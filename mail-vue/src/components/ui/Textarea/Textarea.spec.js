import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import Textarea from './Textarea.vue'

/**
 * autosize 是这里唯一的自研逻辑，而 jsdom 的 scrollHeight 恒等于 0，
 * 所以下面用一个可控的 scrollHeight getter 把它替出来。
 * 顺手记录「读 scrollHeight 那一刻的 style.height」，用来验证量之前确实归零过——
 * 不归零的话内容删短时高度只会涨不会缩。
 */

let scrollHeight = 0
/** 每次读 scrollHeight 时的 style.height 快照（一次 resize 会读两次） */
let heightsAtRead = []
let original = null

beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
            heightsAtRead.push(this.style.height)
            return scrollHeight
        },
    })
    scrollHeight = 0
    heightsAtRead = []
})

afterEach(() => {
    delete HTMLTextAreaElement.prototype.scrollHeight
    if (original) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
    }
})

const render = (props = {}, options = {}) => mount(Textarea, {props, ...options})

/**
 * 根元素就是 textarea，`wrapper.setValue()` 走的是 VueWrapper 那条路——它直接
 * `$emit('update:modelValue')`，根本不碰 DOM，于是组件自己的 @input 不会跑。
 * 要测真实输入必须自己写值再派事件。
 */
async function typeInto(wrapper, text) {
    wrapper.element.value = text
    await wrapper.trigger('input')
}

describe('Textarea · 值与属性', () => {
    it('modelValue 渲染进去，输入抛出新值', async () => {
        const wrapper = render({modelValue: '草稿'})
        expect(wrapper.element.value).toBe('草稿')

        await typeInto(wrapper, '草稿改一版')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['草稿改一版'])
    })

    it('完全受控：自己不改 modelValue，只等宿主回写', async () => {
        const wrapper = render({modelValue: '草稿'})
        await typeInto(wrapper, 'x')
        expect(wrapper.props('modelValue')).toBe('草稿')

        await wrapper.setProps({modelValue: '宿主改的'})
        expect(wrapper.element.value).toBe('宿主改的')
    })

    it('rows 透到原生属性', () => {
        expect(render({rows: 6}).attributes('rows')).toBe('6')
    })

    it('id / aria-describedby 落在 textarea 本体上', () => {
        const wrapper = render({}, {attrs: {id: 'note', 'aria-describedby': 'note-hint'}})
        expect(wrapper.attributes('id')).toBe('note')
        expect(wrapper.attributes('aria-describedby')).toBe('note-hint')
    })

    it('invalid 报 aria-invalid + 危险色描边', () => {
        const wrapper = render({invalid: true})
        expect(wrapper.attributes('aria-invalid')).toBe('true')
        expect(wrapper.classes()).toContain('border-danger')
    })

    it('正常态不留空的 aria-invalid / aria-label', () => {
        const wrapper = render()
        expect(wrapper.attributes('aria-invalid')).toBeUndefined()
        expect(wrapper.attributes('aria-label')).toBeUndefined()
    })

    it('ariaLabel 兜底无障碍名称', () => {
        expect(render({ariaLabel: '邮件正文'}).attributes('aria-label')).toBe('邮件正文')
    })

    it('空 placeholder 不渲染成空属性', () => {
        expect(render().attributes('placeholder')).toBeUndefined()
        expect(render({placeholder: '写点什么'}).attributes('placeholder')).toBe('写点什么')
    })

    it('disabled / readonly 透到原生属性', () => {
        expect(render({disabled: true}).attributes('disabled')).toBeDefined()
        expect(render({readonly: true}).attributes('readonly')).toBeDefined()
    })
})

describe('Textarea · 外观', () => {
    it('多行控件不吃固定高度，走 h-auto', () => {
        expect(render().classes()).toContain('h-auto')
        expect(render().classes()).not.toContain('h-8')
    })

    it('三档尺寸只改字号和横向内边距', () => {
        expect(render({size: 'sm'}).classes()).toContain('px-2')
        expect(render().classes()).toContain('px-2.5')
        expect(render({size: 'lg'}).classes()).toContain('px-3')
    })

    it('默认可手动纵向拉伸，autosize 时禁掉手柄', () => {
        expect(render().classes()).toContain('resize-y')
        expect(render({autosize: true}).classes()).toContain('resize-none')
    })

    it('class 透传', () => {
        expect(render({class: 'font-mono'}).classes()).toContain('font-mono')
    })
})

describe('Textarea · autosize', () => {
    it('不开 autosize 就不碰 inline height', async () => {
        scrollHeight = 200
        const wrapper = render({modelValue: 'a\nb\nc'})
        await typeInto(wrapper, 'a\nb\nc\nd')
        expect(wrapper.element.style.height).toBe('')
    })

    it('autosize 把 rows 压到 1，剩下的交给测量', () => {
        expect(render({autosize: true, rows: 5}).attributes('rows')).toBe('1')
    })

    it('挂载时就量一次高度', () => {
        scrollHeight = 56
        expect(render({autosize: true}).element.style.height).toBe('56px')
    })

    it('输入后跟着内容长高', async () => {
        scrollHeight = 40
        const wrapper = render({autosize: true, modelValue: 'a'})
        scrollHeight = 84
        await typeInto(wrapper, 'a\nb\nc')
        expect(wrapper.element.style.height).toBe('84px')
    })

    it('测量前先把 height 归零，否则删内容时缩不回来', async () => {
        scrollHeight = 120
        const wrapper = render({autosize: true})
        expect(wrapper.element.style.height).toBe('120px')

        heightsAtRead = []
        scrollHeight = 40
        await typeInto(wrapper, '短')
        // 第一次读发生在 height 归零之后，所以量到的是「内容真实高度」而不是上一轮的 120px
        expect(heightsAtRead[0]).toBe('auto')
        expect(wrapper.element.style.height).toBe('40px')
    })

    it('超过 maxRows 就封顶并打开内部滚动', () => {
        // 没有 Tailwind 的 jsdom 里量不到真实行高/边框（lineHeight 是 normal，
        // border 反而被算成 16px），所以用 inline style 把这几个量钉死：
        // 上限 = 20px × 3 行 = 60px
        scrollHeight = 1000
        const wrapper = render(
            {autosize: true, maxRows: 3},
            {attrs: {style: 'line-height: 20px; padding: 0px; border-width: 0px'}},
        )
        expect(wrapper.element.style.height).toBe('60px')
        expect(wrapper.element.style.overflowY).toBe('auto')
    })

    it('没到上限时不出滚动条', () => {
        scrollHeight = 48
        const wrapper = render(
            {autosize: true, maxRows: 12},
            {attrs: {style: 'line-height: 20px; padding: 0px; border-width: 0px'}},
        )
        expect(wrapper.element.style.height).toBe('48px')
        expect(wrapper.element.style.overflowY).toBe('hidden')
    })

    it('宿主直接改 modelValue 也会重新量（不只在 input 时）', async () => {
        scrollHeight = 40
        const wrapper = render({autosize: true, modelValue: 'a'})
        scrollHeight = 100
        await wrapper.setProps({modelValue: 'a\nb\nc\nd'})
        await nextTick()
        expect(wrapper.element.style.height).toBe('100px')
    })

    it('暴露的 resize() 可以手动补量（比如从 display:none 里露出来之后）', async () => {
        scrollHeight = 40
        const wrapper = render({autosize: true})
        scrollHeight = 72
        wrapper.vm.resize()
        expect(wrapper.element.style.height).toBe('72px')
    })

    it('暴露的 focus() 打到 textarea 上', () => {
        const wrapper = render({}, {attachTo: document.body})
        wrapper.vm.focus()
        expect(document.activeElement).toBe(wrapper.element)
        wrapper.unmount()
    })
})
