import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import RadioGroup from './RadioGroup.vue'
import Radio from './Radio.vue'

/**
 * Radio 单独拿出来测意义不大（单选语义一半在组上），所以这里基本都从 RadioGroup 挂载。
 * 组内只有一个 tab stop、方向键换选这类行为由 reka 的 RovingFocus 提供，
 * 它是 pre-flush 注册的，所以按键前一律先 `await nextTick()`。
 */

const OPTIONS = [
    {label: '全部邮件', value: 'all'},
    {label: '仅未读', value: 'unread', hint: '只显示没点开过的'},
    {label: '已归档', value: 'archived', disabled: true},
]

async function render(props = {}, options = {}) {
    const wrapper = mount(RadioGroup, {props: {options: OPTIONS, ...props}, ...options})
    await nextTick()
    return wrapper
}

const items = (wrapper) => wrapper.findAll('[role="radio"]')

describe('RadioGroup · 结构', () => {
    it('组是 radiogroup，每项是 radio', async () => {
        const wrapper = await render()
        expect(wrapper.get('[role="radiogroup"]')).toBeTruthy()
        expect(items(wrapper)).toHaveLength(3)
    })

    it('options 简写渲染出标签和 hint', async () => {
        const wrapper = await render()
        expect(wrapper.text()).toContain('全部邮件')
        expect(wrapper.text()).toContain('只显示没点开过的')
    })

    it('hint 通过 aria-describedby 挂到对应项上', async () => {
        const wrapper = await render()
        const hintId = items(wrapper)[1].attributes('aria-describedby')
        expect(wrapper.get(`#${hintId}`).text()).toBe('只显示没点开过的')
        // 没 hint 的项不该凭空多出 describedby
        expect(items(wrapper)[0].attributes('aria-describedby')).toBeUndefined()
    })

    it('选中项报 aria-checked=true，其余为 false', async () => {
        const wrapper = await render({modelValue: 'unread'})
        expect(items(wrapper).map((el) => el.attributes('aria-checked')))
            .toEqual(['false', 'true', 'false'])
    })

    it('默认插槽可以接管排版', async () => {
        const wrapper = mount(RadioGroup, {
            props: {modelValue: 'b'},
            slots: {default: '<div class="grid"><Radio value="a" label="A"/><Radio value="b" label="B"/></div>'},
            global: {components: {Radio}},
        })
        await nextTick()
        expect(wrapper.get('.grid')).toBeTruthy()
        expect(items(wrapper)).toHaveLength(2)
        expect(items(wrapper)[1].attributes('aria-checked')).toBe('true')
    })
})

describe('RadioGroup · 交互', () => {
    it('点击某项把它的 value 抛出来', async () => {
        const wrapper = await render({modelValue: 'all'})
        await items(wrapper)[1].trigger('click')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['unread'])
    })

    it('受控：宿主不回写时 DOM 不动', async () => {
        const wrapper = await render({modelValue: 'all'})
        await items(wrapper)[1].trigger('click')
        expect(items(wrapper)[0].attributes('aria-checked')).toBe('true')
        expect(items(wrapper)[1].attributes('aria-checked')).toBe('false')
    })

    it('单项 disabled 点不动', async () => {
        const wrapper = await render({modelValue: 'all'})
        await items(wrapper)[2].trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('组 disabled 时全员禁用', async () => {
        const wrapper = await render({disabled: true})
        expect(items(wrapper).every((el) => el.attributes('disabled') !== undefined)).toBe(true)
        await items(wrapper)[0].trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('组内只有一个 tab stop —— 入口在组容器上，各项都是 -1', async () => {
        const wrapper = await render({modelValue: 'unread'})
        // reka 的 RovingFocus 把 tabindex=0 放在组容器上，Tab 进来之后再由它把焦点转交给
        // 当前选中项（转交发生在真实 focus 事件里，jsdom 里不便断言）。
        expect(wrapper.get('[role="radiogroup"]').attributes('tabindex')).toBe('0')
        expect(items(wrapper).map((el) => el.attributes('tabindex'))).toEqual(['-1', '-1', '-1'])
    })
})

describe('RadioGroup · 外观与原生表单', () => {
    it('横排/竖排走不同的 flex 方向', async () => {
        expect((await render({orientation: 'horizontal'})).get('[role="radiogroup"]').classes()).toContain('flex-row')
        expect((await render()).get('[role="radiogroup"]').classes()).toContain('flex-col')
    })

    it('orientation 传给 reka，方向键行为跟着走', async () => {
        const wrapper = await render({orientation: 'horizontal'})
        expect(wrapper.get('[role="radiogroup"]').attributes('aria-orientation')).toBe('horizontal')
    })

    it('两档尺寸的圆框和圆点配套', async () => {
        const md = await render({modelValue: 'all'})
        expect(items(md)[0].classes()).toContain('size-4')

        const sm = await render({modelValue: 'all', size: 'sm'})
        expect(items(sm)[0].classes()).toContain('size-3.5')
    })

    it('在 form 里给了 name 才补隐藏 input，值就是当前选中项', async () => {
        // reka 的 useFormControl 是 `el.closest('form')`，不在表单里就不生成隐藏 input
        const form = document.createElement('form')
        document.body.appendChild(form)
        const wrapper = mount(RadioGroup, {
            props: {options: OPTIONS, name: 'scope', modelValue: 'unread'},
            attachTo: form,
        })
        await nextTick()

        const native = wrapper.findAll('input[name="scope"]')
        expect(native).toHaveLength(1)
        expect(native[0].attributes('value')).toBe('unread')
        wrapper.unmount()
        form.remove()
    })

    it('不在 form 里就不生成多余的隐藏 input', async () => {
        expect((await render({name: 'scope'})).findAll('input')).toHaveLength(0)
    })

    it('没有可见组标题时用 ariaLabel', async () => {
        const wrapper = await render({ariaLabel: '筛选范围'})
        expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe('筛选范围')
    })

    it('class 透传到组容器', async () => {
        expect((await render({class: 'mt-3'})).get('[role="radiogroup"]').classes()).toContain('mt-3')
    })
})

describe('Radio · 单项细节', () => {
    it('label 通过 for/id 关联，外部 id 优先', async () => {
        const wrapper = mount(RadioGroup, {
            slots: {default: '<Radio value="a" label="全部" id="scope-all"/>'},
            global: {components: {Radio}},
        })
        await nextTick()
        expect(wrapper.get('[role="radio"]').attributes('id')).toBe('scope-all')
        expect(wrapper.get('label').attributes('for')).toBe('scope-all')
    })

    it('自动 id 在同一棵树里不撞车', async () => {
        const wrapper = mount(RadioGroup, {
            slots: {default: '<Radio value="a" label="A"/><Radio value="b" label="B"/>'},
            global: {components: {Radio}},
        })
        await nextTick()
        const [a, b] = items(wrapper)
        expect(a.attributes('id')).not.toBe(b.attributes('id'))
        const labels = wrapper.findAll('label')
        expect(labels[0].attributes('for')).toBe(a.attributes('id'))
        expect(labels[1].attributes('for')).toBe(b.attributes('id'))
    })

    it('既没 label 也没 hint 时不渲染空的文字列', async () => {
        const wrapper = mount(RadioGroup, {
            slots: {default: '<Radio value="a"/>'},
            global: {components: {Radio}},
        })
        await nextTick()
        expect(wrapper.find('label').exists()).toBe(false)
    })

    it('disabled 时标签也是禁用态', async () => {
        const wrapper = await render()
        const labels = wrapper.findAll('label')
        expect(labels[2].classes()).toContain('text-fg-disabled')
        expect(labels[0].classes()).not.toContain('text-fg-disabled')
    })
})
