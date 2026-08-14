import {describe, expect, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import Segmented from './Segmented.vue'

/**
 * 唯一一处自研逻辑是 `onUpdate` 里的「不允许空态」拦截（reka 的 ToggleGroup 没有
 * preventDeselect），所以那一条要正反都测；其余守住 single/multiple 语义别传错
 * 与 iconOnly 的 aria-label。
 */

const ITEMS = [
    {value: 'compact', label: '紧凑'},
    {value: 'cozy', label: '舒适'},
    {value: 'wide', label: '宽松', disabled: true},
]

const render = (props = {}) => mount(Segmented, {props: {items: ITEMS, ...props}})
const buttons = (wrapper) => wrapper.findAll('button')
const byLabel = (wrapper, label) => buttons(wrapper).find((b) => b.text().includes(label))
const lastEmit = (wrapper) => {
    const all = wrapper.emitted('update:modelValue')
    return all?.[all.length - 1]?.[0]
}

describe('Segmented · 结构与 a11y', () => {
    it('是 role=group 的一串 toggle button（不是 tablist）', () => {
        const wrapper = render({modelValue: 'cozy'})
        expect(wrapper.get('[role="group"]').exists()).toBe(true)
        expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
        expect(buttons(wrapper)).toHaveLength(3)
    })

    it('选中项标 data-state=on / aria-pressed', () => {
        const wrapper = render({modelValue: 'cozy'})
        expect(byLabel(wrapper, '舒适').attributes('data-state')).toBe('on')
        expect(byLabel(wrapper, '紧凑').attributes('data-state')).toBe('off')
    })

    it('ariaLabel 给整组起名字，不给就不出属性（交给 Field 的 label）', () => {
        expect(render({ariaLabel: '密度'}).get('[role="group"]').attributes('aria-label')).toBe('密度')
        expect(render().get('[role="group"]').attributes('aria-label')).toBeUndefined()
    })

    it('iconOnly 时把 label 转成 aria-label，文字不再渲染', () => {
        const wrapper = render({iconOnly: true, modelValue: 'cozy'})
        expect(byLabel(wrapper, '') && true).toBe(true)
        expect(buttons(wrapper)[0].attributes('aria-label')).toBe('紧凑')
        expect(wrapper.text()).toBe('')
    })

    it('非 iconOnly 时不加 aria-label（可见文字已经是名字了）', () => {
        expect(buttons(render())[0].attributes('aria-label')).toBeUndefined()
    })

    it('iconOnly 缺 label 时开发期告警', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mount(Segmented, {props: {items: [{value: 'a'}], iconOnly: true}})
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('iconOnly'))
        warn.mockRestore()
    })

    it('禁用项自己禁用，整组 disabled 时全禁', () => {
        expect(byLabel(render(), '宽松').attributes('disabled')).toBeDefined()
        expect(byLabel(render(), '紧凑').attributes('disabled')).toBeUndefined()
        expect(buttons(render({disabled: true})).every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    })
})

describe('Segmented · 单选', () => {
    it('点未选中项发标量值', async () => {
        const wrapper = render({modelValue: 'compact'})
        await byLabel(wrapper, '舒适').trigger('click')
        expect(lastEmit(wrapper)).toBe('cozy')
    })

    it('默认不允许点掉当前项 —— 这次变更被丢弃，不会发 undefined', async () => {
        const wrapper = render({modelValue: 'cozy'})
        await byLabel(wrapper, '舒适').trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('allowDeselect 打开后才允许空态', async () => {
        const wrapper = render({modelValue: 'cozy', allowDeselect: true})
        await byLabel(wrapper, '舒适').trigger('click')
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
        expect(lastEmit(wrapper)).toBeUndefined()
    })

    it('禁用项点不动', async () => {
        const wrapper = render({modelValue: 'cozy'})
        await byLabel(wrapper, '宽松').trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})

describe('Segmented · 多选', () => {
    it('multiple 时收发数组', async () => {
        const wrapper = render({multiple: true, modelValue: ['compact']})
        await byLabel(wrapper, '舒适').trigger('click')
        expect(lastEmit(wrapper)).toEqual(['compact', 'cozy'])
    })

    it('multiple 时可以全部取消（空数组是合法状态，不走拦截）', async () => {
        const wrapper = render({multiple: true, modelValue: ['cozy']})
        await byLabel(wrapper, '舒适').trigger('click')
        expect(lastEmit(wrapper)).toEqual([])
    })

    it('多选时多个选中项同时 on', () => {
        const wrapper = render({multiple: true, modelValue: ['compact', 'cozy']})
        expect(byLabel(wrapper, '紧凑').attributes('data-state')).toBe('on')
        expect(byLabel(wrapper, '舒适').attributes('data-state')).toBe('on')
    })
})

describe('Segmented · 外观与插槽', () => {
    it('两档尺寸各自生效，默认 md', () => {
        expect(buttons(render())[0].classes()).toContain('h-7')
        expect(buttons(render({size: 'sm'}))[0].classes()).toContain('h-6')
    })

    it('block 撑满父容器且每项等分', () => {
        const wrapper = render({block: true})
        expect(wrapper.get('[role="group"]').classes()).toContain('w-full')
        expect(buttons(wrapper)[0].classes()).toContain('flex-1')
    })

    it('vertical 换成纵向排列', () => {
        expect(render({orientation: 'vertical'}).get('[role="group"]').classes()).toContain('flex-col')
    })

    it('#item 插槽拿到该项数据与图标尺寸', () => {
        const wrapper = mount(Segmented, {
            props: {items: ITEMS, size: 'sm'},
            slots: {item: '<template #item="{value, iconSize}"><i :data-v="value" :class="iconSize"/></template>'},
        })
        const icon = wrapper.get('i')
        expect(icon.attributes('data-v')).toBe('compact')
        expect(icon.classes()).toContain('size-3.5')
    })

    it('默认插槽可以整体替换掉自动渲染的项', () => {
        const wrapper = mount(Segmented, {
            props: {items: ITEMS},
            slots: {default: '<button data-custom>自定义</button>'},
        })
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(wrapper.get('button').attributes('data-custom')).toBeDefined()
    })

    it('class 透传且不吃掉内置类', () => {
        const el = render({class: 'ml-2'}).get('[role="group"]')
        expect(el.classes()).toContain('ml-2')
        expect(el.classes()).toContain('bg-inset')
    })
})
