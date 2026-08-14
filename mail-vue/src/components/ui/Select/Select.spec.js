import {afterEach, describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import Select from './Select.vue'

/**
 * Select 的面板走 SelectPortal，挂在 body 上而不是组件子树里，所以查询用 document 而不是
 * wrapper。打开动作必须是 pointerdown（reka 在这里区分「按住拖选」和「点一下打开」），
 * `trigger('click')` 是打不开的。
 *
 * jsdom 缺的 hasPointerCapture / ResizeObserver 由 test/setup.js 补齐。
 */

const FLAT = [
    {label: '全部邮件', value: 'all'},
    {label: '仅未读', value: 'unread', hint: '12'},
    {label: '已归档', value: 'archived', disabled: true},
]

const GROUPED = [
    {label: '状态', options: [{label: '未读', value: 'unread'}, {label: '已读', value: 'read'}]},
    {label: '位置', options: [{label: '收件箱', value: 'inbox'}]},
]

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Select, {props: {options: FLAT, ...props}, attachTo: document.body, ...options})
    mounted.push(wrapper)
    return wrapper
}

async function open(wrapper) {
    await nextTick()
    trigger(wrapper).element.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true}))
    await nextTick()
    await nextTick()
}

/**
 * 选中是 pointerup 上的事，而且 reka 的 handleSelect 内部先 `await nextTick()`
 * 才回调，所以派完事件要多等一拍才看得到 emit。
 */
async function pick(index) {
    items()[index].dispatchEvent(new PointerEvent('pointerup', {button: 0, bubbles: true}))
    await nextTick()
    await nextTick()
}

const trigger = (wrapper) => wrapper.get('[role="combobox"]')
const panel = () => document.querySelector('[role="listbox"]')
const items = () => [...document.querySelectorAll('[role="option"]')]

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Select · 触发器', () => {
    it('触发器是 combobox，闭合时 aria-expanded=false', () => {
        const el = trigger(render())
        expect(el.attributes('aria-expanded')).toBe('false')
        expect(el.attributes('data-state')).toBe('closed')
        expect(el.attributes('type')).toBe('button')
    })

    it('没选中时显示占位文案，并打上 data-placeholder', () => {
        const wrapper = render({placeholder: '选择范围'})
        expect(wrapper.text()).toContain('选择范围')
        expect(trigger(wrapper).attributes('data-placeholder')).toBe('')
    })

    it('不给 placeholder 时退回内置的「请选择」', () => {
        expect(render().text()).toContain('请选择')
    })

    it('选中后显示对应 label 而不是 value', async () => {
        const wrapper = render({modelValue: 'unread'})
        // 面板关着的时候 reka 把选项渲进一个游离的 DocumentFragment 来登记 label，
        // 那个 fragment 在 onMounted 里才建，所以挂载当拍还是占位文案。
        await nextTick()
        expect(wrapper.text()).toContain('仅未读')
        expect(trigger(wrapper).attributes('data-placeholder')).toBeUndefined()
    })

    it('invalid 报 aria-invalid + 危险色描边', () => {
        const el = trigger(render({invalid: true}))
        expect(el.attributes('aria-invalid')).toBe('true')
        expect(el.classes()).toContain('border-danger')
    })

    it('disabled 时打不开', async () => {
        const wrapper = render({disabled: true})
        await open(wrapper)
        expect(panel()).toBeNull()
    })

    it('id / ariaLabel 落在触发器上', () => {
        const el = trigger(render({id: 'scope', ariaLabel: '筛选范围'}))
        expect(el.attributes('id')).toBe('scope')
        expect(el.attributes('aria-label')).toBe('筛选范围')
    })

    it('三档尺寸与其他控件同高', () => {
        expect(trigger(render({size: 'sm'})).classes()).toContain('h-7')
        expect(trigger(render()).classes()).toContain('h-8')
        expect(trigger(render({size: 'lg'})).classes()).toContain('h-[38px]')
    })

    it('class 落在触发器上', () => {
        expect(trigger(render({class: 'max-w-40'})).classes()).toContain('max-w-40')
    })

    it('箭头图标对读屏隐身', () => {
        expect(render().get('svg').attributes('aria-hidden')).toBe('true')
    })
})

describe('Select · 面板与选项', () => {
    it('打开后 body 上出现 listbox，触发器状态翻转', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(panel()).not.toBeNull()
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
        expect(trigger(wrapper).attributes('data-state')).toBe('open')
    })

    it('扁平 options 逐项渲染，文案是 label', async () => {
        await open(render())
        expect(items()).toHaveLength(3)
        expect(items().map((el) => el.textContent.trim())).toEqual(
            expect.arrayContaining(['全部邮件', '已归档']),
        )
    })

    it('hint 显示在选项右侧', async () => {
        await open(render())
        expect(items()[1].textContent).toContain('12')
    })

    it('单项 disabled 报 aria-disabled', async () => {
        await open(render())
        expect(items()[2].attributes.getNamedItem('data-disabled')).not.toBeNull()
    })

    it('选中项报 aria-selected', async () => {
        await open(render({modelValue: 'unread'}))
        expect(items().map((el) => el.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    })

    it('分组写法生成分组标题', async () => {
        await open(render({options: GROUPED}))
        expect(panel().textContent).toContain('状态')
        expect(panel().textContent).toContain('位置')
        expect(items()).toHaveLength(3)
    })

    it('分组与扁平混写都能吃', async () => {
        await open(render({options: [...GROUPED, {label: '草稿', value: 'draft'}]}))
        expect(items()).toHaveLength(4)
        expect(panel().textContent).toContain('草稿')
    })

    it('面板宽度跟随触发器，避免长选项撑宽', async () => {
        await open(render())
        expect(panel().closest('[data-reka-popper-content-wrapper]') ?? panel()).toBeTruthy()
        const content = document.querySelector('.min-w-\\(--reka-select-trigger-width\\)')
        expect(content).not.toBeNull()
    })

    it('contentClass 追加到面板上', async () => {
        await open(render({contentClass: 'max-w-60'}))
        expect(document.querySelector('.max-w-60')).not.toBeNull()
    })

    it('默认插槽可以完全接管选项排版', async () => {
        const wrapper = mount(Select, {
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

describe('Select · 选择与多选', () => {
    it('点选项抛出它的 value', async () => {
        const wrapper = render()
        await open(wrapper)
        await pick(1)
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['unread'])
    })

    it('单选选完就关面板', async () => {
        const wrapper = render()
        await open(wrapper)
        await pick(1)
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
    })

    it('禁用项点不动', async () => {
        const wrapper = render()
        await open(wrapper)
        await pick(2)
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('multiple 时把多个 label 拼成「A、B」', () => {
        // 多选的文案是组件自己拼的（不走 SelectValue），所以不用等 fragment
        const wrapper = render({multiple: true, modelValue: ['all', 'unread']})
        expect(wrapper.text()).toContain('全部邮件、仅未读')
    })

    it('multiple 且空数组时显示占位文案', () => {
        const wrapper = render({multiple: true, modelValue: [], placeholder: '选择标签'})
        expect(wrapper.text()).toContain('选择标签')
    })

    it('multiple 里遇到未知值就直接显示原值，不静默丢掉', () => {
        const wrapper = render({multiple: true, modelValue: ['all', 'ghost']})
        expect(wrapper.text()).toContain('全部邮件、ghost')
    })

    it('multiple 抛出的是数组，且选完不关面板', async () => {
        const wrapper = render({multiple: true, modelValue: ['all']})
        await open(wrapper)
        await pick(1)
        expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(['all', 'unread'])
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
    })
})
