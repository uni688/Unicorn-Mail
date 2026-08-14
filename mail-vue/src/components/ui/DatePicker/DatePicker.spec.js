import {afterEach, beforeAll, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {enableAutoUnmount, mount} from '@vue/test-utils'
import DatePicker from './DatePicker.vue'
import {formatDateKey, todayKey} from './date.js'

/**
 * DatePicker 的价值全在「触发器 ↔ 面板」的接线上，所以这里盯的是接线而不是日历本身
 * （格子行为已经在 `Calendar.spec.js` 里锁死了）：触发器文案有没有被本地化格式化、
 * 清除按钮的值语义、以及「什么时候该收起面板」这条最容易写错的规则。
 *
 * 面板是 `PopoverPortal` 传送到 `document.body` 的，`wrapper.find` 看不到，
 * 只能走原生 DOM 查询 —— 也因此必须逐个用例卸载组件，否则上一个用例遗留的面板
 * 会被下一个用例的 `document.querySelector` 找到。
 */

const OPEN = 'button[aria-haspopup="dialog"]'
const panelCells = () => Array.from(document.querySelectorAll('[data-reka-calendar-cell-trigger]'))
const cellFor = (key) => panelCells().find((el) => el.getAttribute('data-value')?.startsWith(key))
const todayButton = () => Array.from(document.querySelectorAll('button')).find((el) => el.textContent.trim() === '今天')
const clickEl = (el) => el.dispatchEvent(new MouseEvent('click', {bubbles: true}))
const lastEmit = (wrapper, event) => {
    const all = wrapper.emitted(event)
    return all?.[all.length - 1]?.[0]
}

async function open(wrapper) {
    await wrapper.find(OPEN).trigger('click')
    await nextTick()
    await nextTick()
}

beforeAll(() => {
    // floating-ui 要 ResizeObserver，jsdom 没有；面板定位不是这里要测的东西
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
})

enableAutoUnmount(afterEach)

describe('DatePicker · 触发器', () => {
    it('无值时显示 placeholder，有值时显示按语言格式化后的文案', () => {
        const empty = mount(DatePicker, {props: {placeholder: '选个日子'}})
        expect(empty.text()).toContain('选个日子')

        const filled = mount(DatePicker, {props: {modelValue: '2026-08-12', locale: 'zh-CN'}})
        // 关键是「不能把 YYYY-MM-DD 原样丢给用户看」
        expect(filled.text()).not.toContain('2026-08-12')
        expect(filled.text()).toBe(formatDateKey('zh-CN', '2026-08-12'))
    })

    it('format 透传给 Intl.DateTimeFormat', () => {
        const wrapper = mount(DatePicker, {
            props: {modelValue: '2026-08-12', locale: 'en-US', format: {dateStyle: 'full'}},
        })
        expect(wrapper.text()).toBe(formatDateKey('en-US', '2026-08-12', {dateStyle: 'full'}))
        expect(wrapper.text()).toContain('Wednesday')
    })

    it('区间用 en dash 连接；只选了一头就只显示那一头', () => {
        const both = mount(DatePicker, {
            props: {range: true, modelValue: {start: '2026-08-10', end: '2026-08-14'}, locale: 'zh-CN'},
        })
        expect(both.text()).toContain('–')

        const half = mount(DatePicker, {
            props: {range: true, modelValue: {start: '2026-08-10', end: null}, locale: 'zh-CN'},
        })
        expect(half.text()).toBe(formatDateKey('zh-CN', '2026-08-10'))
    })

    it('disabled 时触发器不可点，面板打不开', async () => {
        const wrapper = mount(DatePicker, {props: {disabled: true}})
        expect(wrapper.find(OPEN).attributes('disabled')).toBeDefined()
        await open(wrapper)
        expect(panelCells()).toHaveLength(0)
    })

    it('invalid 落到 aria-invalid，ariaLabel 落到无障碍名称', () => {
        const wrapper = mount(DatePicker, {props: {invalid: true, ariaLabel: '截止日期'}})
        const trigger = wrapper.find(OPEN)
        expect(trigger.attributes('aria-invalid')).toBe('true')
        expect(trigger.attributes('aria-label')).toBe('截止日期')
    })
})

describe('DatePicker · 清除', () => {
    const CLEAR = 'button[aria-label="清除"]'

    it('只有在「可清除 + 有值」时才出现', () => {
        expect(mount(DatePicker, {props: {}}).find(CLEAR).exists()).toBe(false)
        expect(mount(DatePicker, {props: {modelValue: '2026-08-12'}}).find(CLEAR).exists()).toBe(true)
        expect(mount(DatePicker, {props: {modelValue: '2026-08-12', clearable: false}}).find(CLEAR).exists()).toBe(false)
        expect(mount(DatePicker, {props: {modelValue: '2026-08-12', disabled: true}}).find(CLEAR).exists()).toBe(false)
    })

    it('单日清成 null，区间清成 {start: null, end: null}', async () => {
        const single = mount(DatePicker, {props: {modelValue: '2026-08-12'}})
        await single.find(CLEAR).trigger('click')
        expect(lastEmit(single, 'update:modelValue')).toBeNull()
        expect(single.emitted('clear')).toHaveLength(1)

        const range = mount(DatePicker, {
            props: {range: true, modelValue: {start: '2026-08-10', end: '2026-08-14'}},
        })
        await range.find(CLEAR).trigger('click')
        expect(lastEmit(range, 'update:modelValue')).toEqual({start: null, end: null})
    })

    it('清除按钮是触发器的兄弟节点，不是嵌套 button（嵌套是非法 HTML）', () => {
        const wrapper = mount(DatePicker, {props: {modelValue: '2026-08-12'}})
        expect(wrapper.find(OPEN).find('button').exists()).toBe(false)
    })
})

describe('DatePicker · 面板', () => {
    it('点日历里的某天：发出 key 并收起面板', async () => {
        const wrapper = mount(DatePicker, {props: {modelValue: '2026-08-12'}, attachTo: document.body})
        await open(wrapper)
        expect(panelCells().length).toBeGreaterThan(0)

        clickEl(cellFor('2026-08-20'))
        await nextTick()
        expect(lastEmit(wrapper, 'update:modelValue')).toBe('2026-08-20')
        await nextTick()
        expect(wrapper.find(OPEN).attributes('aria-expanded')).toBe('false')
    })

    it('closeOnSelect=false 时选完不收', async () => {
        const wrapper = mount(DatePicker, {
            props: {modelValue: '2026-08-12', closeOnSelect: false},
            attachTo: document.body,
        })
        await open(wrapper)
        clickEl(cellFor('2026-08-20'))
        await nextTick()
        expect(wrapper.find(OPEN).attributes('aria-expanded')).toBe('true')
    })

    it('区间第一次点击（只有 start）不能收面板，否则没法选第二个端点', async () => {
        const month = todayKey().slice(0, 7)
        const wrapper = mount(DatePicker, {
            props: {range: true, modelValue: {start: null, end: null}},
            attachTo: document.body,
        })
        await open(wrapper)
        clickEl(cellFor(`${month}-10`))
        await nextTick()
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual({start: `${month}-10`, end: null})
        expect(wrapper.find(OPEN).attributes('aria-expanded')).toBe('true')
    })

    it('「今天」按钮发出今天的 key', async () => {
        const wrapper = mount(DatePicker, {attachTo: document.body})
        await open(wrapper)
        clickEl(todayButton())
        await nextTick()
        expect(lastEmit(wrapper, 'update:modelValue')).toBe(todayKey())
    })

    it('区间模式不显示「今天」（一个端点没意义）', async () => {
        const wrapper = mount(DatePicker, {props: {range: true}, attachTo: document.body})
        await open(wrapper)
        expect(todayButton()).toBeUndefined()
    })

    it('今天在 min/max 之外时，「今天」按钮是禁用的（点了没反应更让人困惑）', async () => {
        const wrapper = mount(DatePicker, {
            props: {max: '2020-01-01', modelValue: '2019-12-01'},
            attachTo: document.body,
        })
        await open(wrapper)
        expect(todayButton().disabled).toBe(true)
    })

    it('min/max 透传到日历：范围外的格子是 disabled', async () => {
        const wrapper = mount(DatePicker, {
            props: {modelValue: '2026-08-12', min: '2026-08-10', max: '2026-08-20'},
            attachTo: document.body,
        })
        await open(wrapper)
        expect(cellFor('2026-08-05').getAttribute('data-disabled')).toBe('')
        expect(cellFor('2026-08-15').getAttribute('data-disabled')).toBeNull()
    })
})
