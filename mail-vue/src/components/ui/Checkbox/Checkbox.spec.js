import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Checkbox from './Checkbox.vue'

/**
 * 重点：① indeterminate 用 reka 的 'indeterminate' 字面量表达，图标要换成 minus；
 * ② 有可见文字时 label 必须 for/id 关联上（点文字能勾），没文字时必须能传 ariaLabel；
 * ③ hint 要通过 aria-describedby 关联，否则读屏读不到补充说明。
 */

const render = (props = {}, options = {}) => mount(Checkbox, {props, ...options})
const box = (wrapper) => wrapper.get('[role="checkbox"]')
const lastEmit = (wrapper) => {
    const all = wrapper.emitted('update:modelValue')
    return all?.[all.length - 1]?.[0]
}

describe('Checkbox · 状态', () => {
    it('未勾选时 data-state=unchecked 且不画图标', () => {
        const wrapper = render()
        expect(box(wrapper).attributes('data-state')).toBe('unchecked')
        expect(wrapper.find('svg').exists()).toBe(false)
    })

    it('勾选时画 check', () => {
        const wrapper = render({modelValue: true})
        expect(box(wrapper).attributes('data-state')).toBe('checked')
        expect(wrapper.findAll('svg')).toHaveLength(1)
    })

    it('indeterminate 换成 minus，并报 aria-checked=mixed', () => {
        const wrapper = render({modelValue: 'indeterminate'})
        expect(box(wrapper).attributes('data-state')).toBe('indeterminate')
        expect(box(wrapper).attributes('aria-checked')).toBe('mixed')
        expect(wrapper.findAll('svg')).toHaveLength(1)
    })

    it('点击在 false / true 之间切换', async () => {
        const off = render({modelValue: false})
        await box(off).trigger('click')
        expect(lastEmit(off)).toBe(true)

        const on = render({modelValue: true})
        await box(on).trigger('click')
        expect(lastEmit(on)).toBe(false)
    })

    it('从 indeterminate 点一下变成 true（全选语义）', async () => {
        const wrapper = render({modelValue: 'indeterminate'})
        await box(wrapper).trigger('click')
        expect(lastEmit(wrapper)).toBe(true)
    })

    it('disabled 时点不动', async () => {
        const wrapper = render({disabled: true})
        await box(wrapper).trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    // 空格键激活靠的是原生 <button> 语义（浏览器自己把 space 变成 click），
    // jsdom 不会合成这个 click，所以这里只断言它真的是个 button。
    it('本体是原生 button，空格/回车由浏览器原生语义负责', () => {
        expect(box(render()).element.tagName).toBe('BUTTON')
        expect(box(render()).attributes('type')).toBe('button')
    })
})

describe('Checkbox · 标签与 a11y', () => {
    it('label 通过 for/id 关联，点文字也能勾', async () => {
        const wrapper = render({label: '记住我'})
        const label = wrapper.get('label')
        expect(label.attributes('for')).toBe(box(wrapper).attributes('id'))
        expect(label.text()).toBe('记住我')
    })

    it('默认插槽可以放富文本，优先于 label prop', () => {
        const wrapper = render({label: '被覆盖'}, {slots: {default: '我已阅读<a href="#">条款</a>'}})
        expect(wrapper.get('label').text()).toContain('条款')
        expect(wrapper.text()).not.toContain('被覆盖')
    })

    it('hint 通过 aria-describedby 关联', () => {
        const wrapper = render({label: '记住我', hint: '30 天内免登录'})
        const hintId = box(wrapper).attributes('aria-describedby')
        expect(hintId).toBeTruthy()
        expect(wrapper.get(`#${hintId}`).text()).toBe('30 天内免登录')
    })

    it('没有 hint 时不留空的 aria-describedby', () => {
        expect(box(render({label: '记住我'})).attributes('aria-describedby')).toBeUndefined()
    })

    it('没有可见文字时用 ariaLabel 兜住名字', () => {
        const wrapper = render({ariaLabel: '全选'})
        expect(box(wrapper).attributes('aria-label')).toBe('全选')
        expect(wrapper.find('label').exists()).toBe(false)
    })

    it('外部指定 id 时以它为准（方便 Field 关联）', () => {
        const wrapper = render({id: 'agree', label: '同意'})
        expect(box(wrapper).attributes('id')).toBe('agree')
        expect(wrapper.get('label').attributes('for')).toBe('agree')
    })

    it('同一个 app 里多个实例的自动 id 不撞车', () => {
        // 每次 mount() 都是新 app，useId 的计数会重置，所以必须放进同一棵树里测
        const wrapper = mount({
            components: {Checkbox},
            template: '<div><Checkbox label="A"/><Checkbox label="B"/></div>',
        })
        const [a, b] = wrapper.findAll('[role="checkbox"]')
        expect(a.attributes('id')).not.toBe(b.attributes('id'))
        // 各自的 label 也要分别指对
        const labels = wrapper.findAll('label')
        expect(labels[0].attributes('for')).toBe(a.attributes('id'))
        expect(labels[1].attributes('for')).toBe(b.attributes('id'))
    })

    it('invalid 标 aria-invalid 并换边框色', () => {
        const wrapper = render({invalid: true})
        expect(box(wrapper).attributes('aria-invalid')).toBe('true')
        expect(box(wrapper).classes()).toContain('border-danger')
    })

    it('图标对读屏隐藏', () => {
        expect(render({modelValue: true}).get('svg').attributes('aria-hidden')).toBe('true')
    })

    it('disabled 时标签也显示为禁用态', () => {
        expect(render({label: '记住我', disabled: true}).get('label').classes()).toContain('text-fg-disabled')
    })
})

describe('Checkbox · 外观', () => {
    it('两档尺寸各自生效，默认 md', () => {
        expect(box(render()).classes()).toContain('size-4')
        expect(box(render({size: 'sm'})).classes()).toContain('size-3.5')
    })

    it('class 透传到最外层容器', () => {
        expect(render({class: 'mb-2'}).classes()).toContain('mb-2')
    })
})
