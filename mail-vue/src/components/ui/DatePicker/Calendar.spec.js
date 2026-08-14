import {describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Calendar from './Calendar.vue'
import {todayKey} from './date.js'

/**
 * Calendar 把 reka 的两套原语（Calendar / RangeCalendar）合并成一个组件，
 * 所以这里盯死三件事：① 单日/区间都真的能渲染并按 `YYYY-MM-DD` 语义发值；
 * ② min/max 与 isDateDisabled 落到了正确的格子上；③ reka 硬编码的英文 aria-label
 * 被换成了本地化文案（读屏用户唯一能听到的翻页提示）。
 */

const cells = (wrapper) => wrapper.findAll('[data-reka-calendar-cell-trigger]')
const cellFor = (wrapper, key) => wrapper.find(`[data-value^="${key}"]`)
const lastEmit = (wrapper, event) => {
    const all = wrapper.emitted(event)
    return all?.[all.length - 1]?.[0]
}

describe('Calendar · 单日', () => {
    it('渲染 6×7 固定网格，选中日带 data-selected', () => {
        const wrapper = mount(Calendar, {props: {modelValue: '2026-08-12'}})
        // fixedWeeks 默认开：不管当月几周，永远 42 格，面板高度不跳
        expect(cells(wrapper)).toHaveLength(42)
        expect(wrapper.findAll('th')).toHaveLength(7)
        expect(cellFor(wrapper, '2026-08-12').attributes('data-selected')).toBe('true')
    })

    it('点某天发出 YYYY-MM-DD 字符串', async () => {
        const wrapper = mount(Calendar, {props: {modelValue: '2026-08-12'}})
        await cellFor(wrapper, '2026-08-20').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toBe('2026-08-20')
    })

    it('preventDeselect：点已选中的那天不会把值清空', async () => {
        const wrapper = mount(Calendar, {props: {modelValue: '2026-08-12'}})
        await cellFor(wrapper, '2026-08-12').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toBe('2026-08-12')
    })

    it('min/max 之外的日子点不动', async () => {
        const wrapper = mount(Calendar, {
            props: {modelValue: '2026-08-12', min: '2026-08-10', max: '2026-08-20'},
        })
        const early = cellFor(wrapper, '2026-08-05')
        expect(early.attributes('data-disabled')).toBe('')
        await early.trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('isDateDisabled 收到的是 YYYY-MM-DD 而不是 Date 对象', () => {
        const seen = []
        const wrapper = mount(Calendar, {
            props: {
                modelValue: '2026-08-12',
                isDateDisabled: (key) => {
                    seen.push(key)
                    return key === '2026-08-15'
                },
            },
        })
        expect(seen.every((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))).toBe(true)
        expect(cellFor(wrapper, '2026-08-15').attributes('data-disabled')).toBe('')
    })

    it('今天标 data-today', () => {
        const wrapper = mount(Calendar, {props: {modelValue: todayKey()}})
        expect(wrapper.find('[data-today]').exists()).toBe(true)
    })

    it('翻页按钮用本地化文案（reka 默认是硬编码英文）', () => {
        const wrapper = mount(Calendar)
        const labels = wrapper.findAll('[aria-label]').map((el) => el.attributes('aria-label'))
        expect(labels).toContain('上个月')
        expect(labels).toContain('下个月')
    })

    it('整体禁用时所有格子都是 disabled', () => {
        const wrapper = mount(Calendar, {props: {modelValue: '2026-08-12', disabled: true}})
        expect(cells(wrapper).every((cell) => cell.attributes('data-disabled') === '')).toBe(true)
    })
})

describe('Calendar · 区间', () => {
    it('第一次点击就发事件，end 为 null', async () => {
        const wrapper = mount(Calendar, {props: {range: true, modelValue: {start: null, end: null}}})
        await cellFor(wrapper, `${todayKey().slice(0, 7)}-10`).trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual({
            start: `${todayKey().slice(0, 7)}-10`,
            end: null,
        })
    })

    /**
     * reka 的区间语义容易踩坑，这里把它钉死：已选定的区间是**整段**都带 `data-selected`
     * （不只两个端点），端点额外带 `data-selection-start/end`；而 `data-highlighted`
     * 只在「点了起始日还没点结束日」的预览期存在，选完就没了。
     * 样式层因此只能靠 selection-start/end 区分端点与中间日。
     */
    it('已选区间整段带 data-selected，端点带 selection-start/end，且不带 highlighted', async () => {
        const month = '2026-08'
        const wrapper = mount(Calendar, {
            props: {range: true, modelValue: {start: `${month}-10`, end: `${month}-14`}},
        })
        await nextTick()
        expect(cellFor(wrapper, `${month}-10`).attributes('data-selection-start')).toBe('true')
        expect(cellFor(wrapper, `${month}-14`).attributes('data-selection-end')).toBe('true')

        const inside = cellFor(wrapper, `${month}-12`)
        expect(inside.attributes('data-selected')).toBe('true')
        expect(inside.attributes('data-selection-start')).toBeUndefined()
        expect(inside.attributes('data-selection-end')).toBeUndefined()
        // 选完就不该再有预览态
        expect(inside.attributes('data-highlighted')).toBeUndefined()

        expect(cellFor(wrapper, `${month}-16`).attributes('data-selected')).toBeUndefined()
    })

    it('只点了起始日时，预览段带 data-highlighted', async () => {
        const month = '2026-08'
        const wrapper = mount(Calendar, {
            props: {range: true, modelValue: {start: `${month}-10`, end: null}},
        })
        await nextTick()
        const anchor = cellFor(wrapper, `${month}-10`)
        // 悬停到 08-13：reka 用 focusedValue 推预览段，hover 会同步过去
        await cellFor(wrapper, `${month}-13`).trigger('mouseenter')
        await nextTick()
        expect(anchor.attributes('data-highlighted-start')).toBe('true')
        // 注意 reka 这里发的是空串（`data-highlighted=""`），只有 -start/-end 才是 'true'
        expect(cellFor(wrapper, `${month}-12`).attributes('data-highlighted')).toBe('')
        expect(cellFor(wrapper, `${month}-16`).attributes('data-highlighted')).toBeUndefined()
    })

    it('months=2 渲染两个月，并给每个月加小标题', () => {
        const wrapper = mount(Calendar, {props: {range: true, months: 2, modelValue: {start: '2026-08-10', end: '2026-09-02'}}})
        expect(wrapper.findAll('table')).toHaveLength(2)
        expect(wrapper.findAll('p')).toHaveLength(2)
    })
})
