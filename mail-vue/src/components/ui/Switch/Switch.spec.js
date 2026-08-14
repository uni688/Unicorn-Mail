import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Switch from './Switch.vue'

/**
 * Switch 的语义是「切换即生效」，所以自研的那点逻辑全在 loading 上：
 * 正在写库时要吞掉交互但保留焦点（不能用 disabled——那会让焦点从按钮上掉下来）。
 * 另外它故意没有 invalid 态，这条也测一下，防止以后有人顺手加回来。
 */

const render = (props = {}, options = {}) => mount(Switch, {props, ...options})
const track = (wrapper) => wrapper.get('[role="switch"]')
const lastEmit = (wrapper) => {
    const all = wrapper.emitted('update:modelValue')
    return all?.[all.length - 1]?.[0]
}

describe('Switch · 开关', () => {
    it('关/开分别是 unchecked / checked', () => {
        expect(track(render()).attributes('data-state')).toBe('unchecked')
        expect(track(render({modelValue: true})).attributes('data-state')).toBe('checked')
    })

    it('报 aria-checked 给读屏', () => {
        expect(track(render()).attributes('aria-checked')).toBe('false')
        expect(track(render({modelValue: true})).attributes('aria-checked')).toBe('true')
    })

    it('点击来回切', async () => {
        const off = render({modelValue: false})
        await track(off).trigger('click')
        expect(lastEmit(off)).toBe(true)

        const on = render({modelValue: true})
        await track(on).trigger('click')
        expect(lastEmit(on)).toBe(false)
    })

    it('disabled 时点不动', async () => {
        const wrapper = render({disabled: true})
        await track(wrapper).trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})

describe('Switch · loading', () => {
    it('loading 时吞掉这次切换', async () => {
        const wrapper = render({loading: true})
        await track(wrapper).trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('loading 报 aria-busy，但不加 disabled —— 焦点要留在按钮上', () => {
        const el = track(render({loading: true}))
        expect(el.attributes('aria-busy')).toBe('true')
        expect(el.attributes('disabled')).toBeUndefined()
        expect(el.attributes('data-loading')).toBe('')
    })

    it('非 loading 时不留空的 aria-busy / data-loading', () => {
        const el = track(render())
        expect(el.attributes('aria-busy')).toBeUndefined()
        expect(el.attributes('data-loading')).toBeUndefined()
    })

    it('loading 结束后恢复可切换', async () => {
        const wrapper = render({loading: true})
        await track(wrapper).trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()

        await wrapper.setProps({loading: false})
        await track(wrapper).trigger('click')
        expect(lastEmit(wrapper)).toBe(true)
    })
})

describe('Switch · 标签与 a11y', () => {
    it('label 通过 for/id 关联', () => {
        const wrapper = render({label: '开启粒子背景'})
        expect(wrapper.get('label').attributes('for')).toBe(track(wrapper).attributes('id'))
    })

    it('hint 通过 aria-describedby 关联', () => {
        const wrapper = render({label: '粒子背景', hint: '低端设备建议关闭'})
        const hintId = track(wrapper).attributes('aria-describedby')
        expect(wrapper.get(`#${hintId}`).text()).toBe('低端设备建议关闭')
    })

    it('没有可见文字时用 ariaLabel', () => {
        const wrapper = render({ariaLabel: '深色模式'})
        expect(track(wrapper).attributes('aria-label')).toBe('深色模式')
        expect(wrapper.find('label').exists()).toBe(false)
    })

    it('外部 id 优先', () => {
        expect(track(render({id: 'particles', label: 'x'})).attributes('id')).toBe('particles')
    })

    it('同一个 app 里的自动 id 不撞车', () => {
        const wrapper = mount({
            components: {Switch},
            template: '<div><Switch label="A"/><Switch label="B"/></div>',
        })
        const [a, b] = wrapper.findAll('[role="switch"]')
        expect(a.attributes('id')).not.toBe(b.attributes('id'))
    })

    it('默认插槽优先于 label prop', () => {
        const wrapper = render({label: '被覆盖'}, {slots: {default: '自定义<b>文字</b>'}})
        expect(wrapper.get('label').text()).toContain('自定义文字')
        expect(wrapper.text()).not.toContain('被覆盖')
    })

    it('故意不做 invalid 态 —— 它没有校验语义', () => {
        // 传了也不该冒出 aria-invalid
        const wrapper = mount(Switch, {props: {label: 'x'}, attrs: {'aria-invalid': undefined}})
        expect(track(wrapper).attributes('aria-invalid')).toBeUndefined()
        expect('invalid' in Switch.props).toBe(false)
    })

    it('disabled 时标签也显示为禁用态', () => {
        expect(render({label: 'x', disabled: true}).get('label').classes()).toContain('text-fg-disabled')
    })
})

describe('Switch · 外观', () => {
    it('两档尺寸的轨道与滑块尺寸配套', () => {
        const md = render()
        expect(track(md).classes()).toContain('h-5')
        expect(md.get('[role="switch"] > span').classes()).toContain('size-4')

        const sm = render({size: 'sm'})
        expect(track(sm).classes()).toContain('h-4')
        expect(sm.get('[role="switch"] > span').classes()).toContain('size-3')
    })

    it('滑块不吃指针事件（点它等于点轨道）', () => {
        expect(render().get('[role="switch"] > span').classes()).toContain('pointer-events-none')
    })

    it('class 透传到最外层容器', () => {
        expect(render({class: 'mb-2'}).classes()).toContain('mb-2')
    })
})
