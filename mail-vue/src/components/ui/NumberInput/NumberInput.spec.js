import {describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import NumberInput from './NumberInput.vue'

/**
 * 换掉 `<input type="number">` 的理由是「加减按钮要有名字、滚轮/箭头行为要对」，
 * 所以这里主要守住：① 两个按钮各自的 aria-label 没被 reka 内置的 "Increase"/"Decrease" 盖掉；
 * ② 到边界时按钮真的禁用（而不是能点但不动）；③ 值被 min/max 钳住。
 *
 * reka 的步进按钮监听的是 pointerdown（不是 click），而且按住 400ms 会开始连发，
 * 所以每次都要补一个 window 上的 pointerup 把 hold 计时器收掉。
 */

const render = (props = {}) => mount(NumberInput, {props, attachTo: document.body})

const input = (wrapper) => wrapper.get('input')
const decBtn = (wrapper) => wrapper.findAll('button')[0]
const incBtn = (wrapper) => wrapper.findAll('button')[1]

async function press(button) {
    // pointerdown 的监听是 vueuse 在 pre-flush 里挂的，mount 当拍还没挂上，要先等一拍
    await nextTick()
    // VTU 的 trigger 改不了 MouseEvent.button（只有 getter），得自己构造事件
    button.element.dispatchEvent(new MouseEvent('pointerdown', {button: 0, bubbles: true}))
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
}

const lastEmit = (wrapper) => {
    const all = wrapper.emitted('update:modelValue')
    return all?.[all.length - 1]?.[0]
}

describe('NumberInput · 结构与 a11y', () => {
    it('外框是 role=group，中间是真正的输入框', () => {
        const wrapper = render({modelValue: 3})
        expect(wrapper.get('[role="group"]').exists()).toBe(true)
        expect(input(wrapper).exists()).toBe(true)
    })

    it('加减按钮用中文名，没被 reka 的 Increase/Decrease 盖掉', () => {
        const wrapper = render({modelValue: 3})
        expect(decBtn(wrapper).attributes('aria-label')).toBe('减少')
        expect(incBtn(wrapper).attributes('aria-label')).toBe('增加')
    })

    it('按钮里的图标对读屏隐藏', () => {
        const wrapper = render({modelValue: 3})
        expect(decBtn(wrapper).get('svg').attributes('aria-hidden')).toBe('true')
        expect(incBtn(wrapper).get('svg').attributes('aria-hidden')).toBe('true')
    })

    it('ariaLabel / placeholder 落在输入框上', () => {
        const wrapper = render({modelValue: 3, ariaLabel: '每页条数', placeholder: '默认 20'})
        expect(input(wrapper).attributes('aria-label')).toBe('每页条数')
        expect(input(wrapper).attributes('placeholder')).toBe('默认 20')
    })

    it('invalid 只标在输入框上，正常态不留空属性', () => {
        expect(input(render({modelValue: 3, invalid: true})).attributes('aria-invalid')).toBe('true')
        expect(input(render({modelValue: 3})).attributes('aria-invalid')).toBeUndefined()
    })

    it('inheritAttrs: false —— 外部属性透到输入框而不是外框', () => {
        const wrapper = mount(NumberInput, {props: {modelValue: 3}, attrs: {'data-testid': 'qty'}})
        expect(input(wrapper).attributes('data-testid')).toBe('qty')
        expect(wrapper.element.getAttribute('data-testid')).toBeNull()
    })
})

describe('NumberInput · 步进', () => {
    it('点加减各走一个 step', async () => {
        const wrapper = render({modelValue: 3})
        await press(incBtn(wrapper))
        expect(lastEmit(wrapper)).toBe(4)

        await press(decBtn(wrapper))
        expect(lastEmit(wrapper)).toBe(2)
    })

    it('自定义 step 生效', async () => {
        const wrapper = render({modelValue: 10, step: 5})
        await press(incBtn(wrapper))
        expect(lastEmit(wrapper)).toBe(15)
    })

    it('没有初值时从 min 起步（没有 min 就当 0）', async () => {
        const fromZero = render({})
        await press(fromZero.findAll('button')[1])
        expect(lastEmit(fromZero)).toBe(0)

        const fromMin = render({min: 5})
        await press(fromMin.findAll('button')[1])
        expect(lastEmit(fromMin)).toBe(5)
    })
})

describe('NumberInput · 边界', () => {
    it('到 max 时加号禁用，到 min 时减号禁用', () => {
        const atMax = render({modelValue: 10, min: 0, max: 10})
        expect(incBtn(atMax).attributes('disabled')).toBeDefined()
        expect(decBtn(atMax).attributes('disabled')).toBeUndefined()

        const atMin = render({modelValue: 0, min: 0, max: 10})
        expect(decBtn(atMin).attributes('disabled')).toBeDefined()
        expect(incBtn(atMin).attributes('disabled')).toBeUndefined()
    })

    it('禁用的按钮点了也不发值', async () => {
        const wrapper = render({modelValue: 10, min: 0, max: 10})
        await press(incBtn(wrapper))
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('disabled 时输入框和两个按钮一起禁用', () => {
        const wrapper = render({modelValue: 3, disabled: true})
        expect(input(wrapper).attributes('disabled')).toBeDefined()
        expect(decBtn(wrapper).attributes('disabled')).toBeDefined()
        expect(incBtn(wrapper).attributes('disabled')).toBeDefined()
    })

    // 手输的值是在 blur / Enter 时才 applyInputValue 的，change 只改输入框自己的文本
    it('手输超范围的值在失焦时被钳回区间', async () => {
        const wrapper = render({modelValue: 5, min: 0, max: 10})
        const el = input(wrapper)
        el.element.value = '99'
        await el.trigger('blur')
        expect(lastEmit(wrapper)).toBe(10)
    })

    it('回车同样会应用并钳制', async () => {
        const wrapper = render({modelValue: 5, min: 0, max: 10})
        const el = input(wrapper)
        el.element.value = '-3'
        await el.trigger('keydown', {key: 'Enter'})
        expect(lastEmit(wrapper)).toBe(0)
    })

    it('手输非数字清空成 undefined，而不是留个 NaN', async () => {
        const wrapper = render({modelValue: 5})
        const el = input(wrapper)
        el.element.value = 'abc'
        await el.trigger('blur')
        expect(lastEmit(wrapper)).toBeUndefined()
    })
})

describe('NumberInput · 键盘', () => {
    it('↑/↓ 走一个 step —— 这是选 NumberField 而不是 input[type=number] 的理由之一', async () => {
        const wrapper = render({modelValue: 3})
        await input(wrapper).trigger('keydown', {key: 'ArrowUp'})
        expect(lastEmit(wrapper)).toBe(4)

        await input(wrapper).trigger('keydown', {key: 'ArrowDown'})
        expect(lastEmit(wrapper)).toBe(2)
    })

    it('PageUp / PageDown 走 10 个 step', async () => {
        const wrapper = render({modelValue: 20})
        await input(wrapper).trigger('keydown', {key: 'PageUp'})
        expect(lastEmit(wrapper)).toBe(30)

        await input(wrapper).trigger('keydown', {key: 'PageDown'})
        expect(lastEmit(wrapper)).toBe(10)
    })

    it('Home / End 直接跳到 min / max', async () => {
        const wrapper = render({modelValue: 5, min: 1, max: 9})
        await input(wrapper).trigger('keydown', {key: 'Home'})
        expect(lastEmit(wrapper)).toBe(1)

        await input(wrapper).trigger('keydown', {key: 'End'})
        expect(lastEmit(wrapper)).toBe(9)
    })
})

describe('NumberInput · 外观', () => {
    it('三档尺寸走 controlVariants，默认 md', () => {
        const cls = (props) => render({modelValue: 1, ...props}).get('[role="group"]').classes()
        expect(cls({})).toContain('h-8')
        expect(cls({size: 'sm'})).toContain('h-7')
        expect(cls({size: 'lg'})).toContain('h-[38px]')
    })

    it('聚焦环挂在外框（focus-within），因为输入框只是其中一格', () => {
        expect(render({modelValue: 1}).get('[role="group"]').classes()).toContain('focus-within:outline-focus')
    })

    it('class 透传且不吃掉内置类', () => {
        const el = render({modelValue: 1, class: 'w-24'}).get('[role="group"]')
        expect(el.classes()).toContain('w-24')
        expect(el.classes()).toContain('overflow-hidden')
    })
})
