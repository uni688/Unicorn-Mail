import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Meter from './Meter.vue'

/**
 * Meter 的全部逻辑都在两个 computed 里（百分比钳制 + tone="auto" 的阈值），
 * 所以这里盯死三件事：① 越界值不会画出条外；② 阈值换色的边界正好落在 70/90；
 * ③ aria-valuetext 有兜底 —— 读屏不能只听见一个光秃秃的 role。
 */

const render = (props = {}) => mount(Meter, {props})
const track = (wrapper) => wrapper.get('[role="meter"]')
const bar = (wrapper) => wrapper.get('[role="meter"] > div')
const widthOf = (wrapper) => bar(wrapper).element.style.width

describe('Meter · 语义', () => {
    it('用 role=meter 并把 min/max/now 都报出去', () => {
        const el = track(render({value: 3, min: 0, max: 50}))
        expect(el.attributes('aria-valuenow')).toBe('3')
        expect(el.attributes('aria-valuemin')).toBe('0')
        expect(el.attributes('aria-valuemax')).toBe('50')
    })

    it('valueText 优先，缺了才退化成整数百分比', () => {
        expect(track(render({value: 3, max: 50, valueText: '已发 3 / 50'})).attributes('aria-valuetext'))
            .toBe('已发 3 / 50')
        // 6% 不是整数时也要取整，别把 6.0000001% 念给用户
        expect(track(render({value: 3, max: 50})).attributes('aria-valuetext')).toBe('6%')
    })

    it('label 写进 aria-label，不给就干脆不出这个属性', () => {
        expect(track(render({label: '今日发信'})).attributes('aria-label')).toBe('今日发信')
        expect(track(render()).attributes('aria-label')).toBeUndefined()
    })
})

describe('Meter · 百分比钳制', () => {
    it('普通区间按比例算', () => {
        expect(widthOf(render({value: 25}))).toBe('25%')
        expect(widthOf(render({value: 5, max: 20}))).toBe('25%')
    })

    it('min 不为 0 时按区间长度算，不是按 max 算', () => {
        // 区间 [10,20] 里的 15 是正中间
        expect(widthOf(render({value: 15, min: 10, max: 20}))).toBe('50%')
    })

    it('越界值钳到 0 / 100，负数不会把条画到左边去', () => {
        expect(widthOf(render({value: -10}))).toBe('0%')
        expect(widthOf(render({value: 999}))).toBe('100%')
    })

    it('区间非法（max <= min 或 NaN）时退化成 0，而不是 NaN% 或 Infinity%', () => {
        expect(widthOf(render({value: 5, min: 10, max: 10}))).toBe('0%')
        expect(widthOf(render({value: 5, min: 20, max: 10}))).toBe('0%')
        expect(widthOf(render({value: 5, max: Number.NaN}))).toBe('0%')
    })
})

describe('Meter · tone="auto" 阈值', () => {
    it('<70% 用 accent，[70,90) 转 warning，>=90% 转 danger', () => {
        expect(track(render({value: 69})).attributes('data-tone')).toBe('accent')
        expect(track(render({value: 70})).attributes('data-tone')).toBe('warning')
        expect(track(render({value: 89})).attributes('data-tone')).toBe('warning')
        expect(track(render({value: 90})).attributes('data-tone')).toBe('danger')
        expect(track(render({value: 100})).attributes('data-tone')).toBe('danger')
    })

    it('阈值判断走的是百分比，不是原始值', () => {
        // 45/50 = 90%，原始值 45 本身远小于 70
        expect(track(render({value: 45, max: 50})).attributes('data-tone')).toBe('danger')
    })

    it('显式指定 tone 就不再自动换色', () => {
        const el = track(render({value: 100, tone: 'success'}))
        expect(el.attributes('data-tone')).toBe('success')
        expect(bar(render({value: 100, tone: 'success'})).classes()).toContain('bg-success')
    })
})

describe('Meter · 尺寸', () => {
    it('三档高度各自生效，默认 xs', () => {
        expect(track(render()).classes()).toContain('h-0.5')
        expect(track(render({size: 'sm'})).classes()).toContain('h-1')
        expect(track(render({size: 'md'})).classes()).toContain('h-1.5')
    })

    it('class 透传且不吃掉内置类', () => {
        const el = track(render({class: 'mt-2'}))
        expect(el.classes()).toContain('mt-2')
        expect(el.classes()).toContain('rounded-full')
    })
})
