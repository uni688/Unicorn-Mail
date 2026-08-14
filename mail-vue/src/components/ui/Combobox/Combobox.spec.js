import {afterEach, describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import Combobox from './Combobox.vue'

/**
 * Combobox 与 Select 的差别都在输入框上：它自己是 role="combobox"，边打边筛，
 * 收起时显示已选项的 label（displayValue），筛空时必须有 ComboboxEmpty 兜底反馈。
 * 面板同样走 Portal 挂 body，所以断言用 document 查。
 */

const FLAT = [
    {label: 'ada@unicorn.mail', value: 'ada', hint: '常用'},
    {label: 'bob@unicorn.mail', value: 'bob'},
    {label: 'cat@unicorn.mail', value: 'cat', disabled: true},
]

const GROUPED = [
    {label: '同事', options: [{label: 'ada@unicorn.mail', value: 'ada'}]},
    {label: '外部', options: [{label: 'zoe@example.com', value: 'zoe'}]},
]

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Combobox, {props: {options: FLAT, ...props}, attachTo: document.body, ...options})
    mounted.push(wrapper)
    return wrapper
}

const input = (wrapper) => wrapper.get('input')
const expandBtn = (wrapper) => wrapper.get('button')
const panel = () => document.querySelector('[role="listbox"]')
const items = () => [...document.querySelectorAll('[role="option"]')]

async function open(wrapper) {
    await nextTick()
    input(wrapper).element.click()
    await nextTick()
    await nextTick()
}

async function filter(wrapper, text) {
    input(wrapper).element.value = text
    await input(wrapper).trigger('input')
    await nextTick()
    await nextTick()
}

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Combobox · 输入框', () => {
    it('输入框自己就是 combobox，声明 list 型自动补全', () => {
        const el = input(render())
        expect(el.attributes('role')).toBe('combobox')
        expect(el.attributes('aria-autocomplete')).toBe('list')
        expect(el.attributes('aria-expanded')).toBe('false')
        // 浏览器自带的历史补全会挡住面板，必须关掉
        expect(el.attributes('autocomplete')).toBe('off')
    })

    it('不给 placeholder 时退回内置的「搜索」', () => {
        expect(input(render()).attributes('placeholder')).toBe('搜索')
        expect(input(render({placeholder: '搜收件人'})).attributes('placeholder')).toBe('搜收件人')
    })

    it('收起时显示已选项的 label 而不是 value', async () => {
        const wrapper = render({modelValue: 'bob'})
        await nextTick()
        expect(input(wrapper).element.value).toBe('bob@unicorn.mail')
    })

    it('多选时把已选 label 拼成「A、B」', async () => {
        const wrapper = render({multiple: true, modelValue: ['ada', 'bob']})
        await nextTick()
        expect(input(wrapper).element.value).toBe('ada@unicorn.mail、bob@unicorn.mail')
    })

    it('遇到不在 options 里的值就显示原值，不显示空白', async () => {
        const wrapper = render({modelValue: 'ghost'})
        await nextTick()
        expect(input(wrapper).element.value).toBe('ghost')
    })

    it('invalid 报 aria-invalid + 危险色描边', () => {
        const wrapper = render({invalid: true})
        expect(input(wrapper).attributes('aria-invalid')).toBe('true')
        expect(wrapper.get('input').element.closest('.border-danger')).not.toBeNull()
    })

    it('id / ariaLabel 落在输入框上，不在外层包装', () => {
        const wrapper = render({id: 'to', ariaLabel: '收件人'})
        expect(input(wrapper).attributes('id')).toBe('to')
        expect(input(wrapper).attributes('aria-label')).toBe('收件人')
    })

    it('展开按钮有无障碍名称，且不抢 Tab 焦点', () => {
        const btn = expandBtn(render())
        expect(btn.attributes('aria-label')).toBe('展开')
        expect(btn.attributes('tabindex')).toBe('-1')
        expect(btn.attributes('aria-haspopup')).toBe('listbox')
    })

    it('禁用时输入框和按钮一起报 aria-disabled', () => {
        const wrapper = render({disabled: true})
        expect(input(wrapper).attributes('aria-disabled')).toBe('true')
        expect(expandBtn(wrapper).attributes('aria-disabled')).toBe('true')
    })

    it('外框吃 controlVariants 的尺寸，焦点环走 focus-within', () => {
        const box = render({size: 'lg'}).get('input').element.parentElement
        expect(box.className).toContain('h-[38px]')
        expect(box.className).toContain('focus-within:outline-focus')
    })

    it('class 落在 Root 容器上而不是输入框上', () => {
        // ComboboxRoot 外面套着 renderless 的 PopperRoot，组件的根是 Fragment，
        // 于是 wrapper.element 指到 VTU 自己的容器上、classes() 是空的，
        // 真正的根容器要用第一个 div 去拿
        const wrapper = render({class: 'w-64'})
        const root = wrapper.get('div')
        expect(root.classes()).toContain('w-64')
        expect(root.classes()).toContain('relative')
        expect(input(wrapper).classes()).not.toContain('w-64')
    })
})

describe('Combobox · 面板与过滤', () => {
    it('点输入框就打开面板（open-on-click）', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(panel()).not.toBeNull()
        expect(input(wrapper).attributes('aria-expanded')).toBe('true')
        expect(items()).toHaveLength(3)
    })

    it('边打边筛，只留匹配项', async () => {
        const wrapper = render()
        await open(wrapper)
        await filter(wrapper, 'bob')
        expect(items().map((el) => el.textContent.trim())).toEqual(['bob@unicorn.mail'])
    })

    it('过滤是子串匹配，不要求前缀', async () => {
        const wrapper = render()
        await open(wrapper)
        await filter(wrapper, 'unicorn')
        expect(items()).toHaveLength(3)
    })

    it('筛空时给出无匹配反馈，而不是一个空面板', async () => {
        const wrapper = render()
        await open(wrapper)
        await filter(wrapper, 'zzz')
        expect(items()).toHaveLength(0)
        expect(panel().textContent).toContain('无匹配结果')
    })

    it('emptyText 可以覆盖无匹配文案', async () => {
        const wrapper = render({emptyText: '没有这个联系人'})
        await open(wrapper)
        await filter(wrapper, 'zzz')
        expect(panel().textContent).toContain('没有这个联系人')
    })

    it('ignoreFilter 时输入不再影响列表（自己在外面筛）', async () => {
        const wrapper = render({ignoreFilter: true})
        await open(wrapper)
        await filter(wrapper, 'zzz')
        expect(items()).toHaveLength(3)
    })

    it('输入把关键词抛给宿主，方便远程搜索', async () => {
        const wrapper = render()
        await open(wrapper)
        await filter(wrapper, 'ada')
        expect(wrapper.emitted('update:searchTerm')?.at(-1)).toEqual(['ada'])
    })

    it('选项渲染 label 与 hint', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(items()[0].textContent).toContain('ada@unicorn.mail')
        expect(items()[0].textContent).toContain('常用')
    })

    it('选中项报 aria-selected', async () => {
        const wrapper = render({modelValue: 'bob'})
        await open(wrapper)
        expect(items().map((el) => el.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    })

    it('禁用项报 data-disabled', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(items()[2].hasAttribute('data-disabled')).toBe(true)
    })

    it('分组写法生成分组标题', async () => {
        const wrapper = render({options: GROUPED})
        await open(wrapper)
        expect(panel().textContent).toContain('同事')
        expect(panel().textContent).toContain('外部')
        expect(items()).toHaveLength(2)
    })

    it('contentClass 追加到面板上', async () => {
        const wrapper = render({contentClass: 'max-w-72'})
        await open(wrapper)
        expect(document.querySelector('.max-w-72')).not.toBeNull()
    })

    it('默认插槽可以接管选项排版，但空态仍在', async () => {
        const wrapper = mount(Combobox, {
            props: {options: FLAT},
            slots: {default: '<div class="custom">自定义</div>'},
            attachTo: document.body,
        })
        mounted.push(wrapper)
        await open(wrapper)
        expect(document.querySelector('.custom')).not.toBeNull()
        expect(items()).toHaveLength(0)
    })
})

describe('Combobox · 选择', () => {
    it('点选项抛出它的 value', async () => {
        const wrapper = render()
        await open(wrapper)
        items()[1].click()
        await nextTick()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['bob'])
    })

    it('禁用项点不动', async () => {
        const wrapper = render()
        await open(wrapper)
        items()[2].click()
        await nextTick()
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('multiple 抛出的是数组', async () => {
        const wrapper = render({multiple: true, modelValue: ['ada']})
        await open(wrapper)
        items()[1].click()
        await nextTick()
        expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(['ada', 'bob'])
    })
})
