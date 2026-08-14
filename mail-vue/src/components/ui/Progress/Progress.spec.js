import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Progress from './Progress.vue'

/**
 * 语义交给 reka 的 ProgressRoot，本组件只管几何与配色，所以重点是：
 * ① null 走不确定态（换成来回扫的那条，且不能带 aria-valuenow）；
 * ② 百分比钳制不会算出 NaN%；
 * ③ 我们的 label 能盖住 reka 默认那句「xx%」的 aria-label（否则读屏念的是百分比不是名字）。
 */

const render = (props = {}) => mount(Progress, {props})
const root = (wrapper) => wrapper.get('[role="progressbar"]')
const indicator = (wrapper) => wrapper.get('[role="progressbar"] > *')
const widthOf = (wrapper) => indicator(wrapper).element.style.width

describe('Progress · 语义', () => {
    it('确定态报 aria-valuenow / max', () => {
        const el = root(render({modelValue: 40}))
        expect(el.attributes('aria-valuenow')).toBe('40')
        expect(el.attributes('aria-valuemax')).toBe('100')
        expect(el.attributes('data-state')).toBe('loading')
    })

    it('值等于 max 时 data-state 变 complete', () => {
        expect(root(render({modelValue: 100})).attributes('data-state')).toBe('complete')
    })

    it('不确定态没有 aria-valuenow，data-state=indeterminate', () => {
        const el = root(render({modelValue: null}))
        expect(el.attributes('aria-valuenow')).toBeUndefined()
        expect(el.attributes('data-state')).toBe('indeterminate')
    })

    it('label 盖掉 reka 默认的百分比 aria-label', () => {
        expect(root(render({modelValue: 40, label: '上传附件'})).attributes('aria-label')).toBe('上传附件')
        // 不给 label 就落回 reka 的 getValueLabel
        expect(root(render({modelValue: 40})).attributes('aria-label')).toBe('40%')
    })
})

describe('Progress · 几何', () => {
    it('按 modelValue / max 算宽度', () => {
        expect(widthOf(render({modelValue: 40}))).toBe('40%')
        expect(widthOf(render({modelValue: 5, max: 20}))).toBe('25%')
    })

    it('0 也要渲染出条（只是宽度为 0），不能当成不确定态', () => {
        const wrapper = render({modelValue: 0})
        expect(root(wrapper).attributes('aria-valuenow')).toBe('0')
        expect(widthOf(wrapper)).toBe('0%')
        expect(indicator(wrapper).classes()).not.toContain('animate-progress-indeterminate')
    })

    it('不确定态换成定宽扫描条，不带 inline width', () => {
        const el = indicator(render({modelValue: null}))
        expect(el.classes()).toContain('animate-progress-indeterminate')
        expect(el.classes()).toContain('w-2/5')
        expect(el.element.style.width).toBe('')
    })

    it('max 非法时按 100 兜底，不会算出 NaN% / Infinity%', () => {
        expect(widthOf(render({modelValue: 30, max: 0}))).toBe('30%')
        expect(widthOf(render({modelValue: 30, max: -5}))).toBe('30%')
    })
})

describe('Progress · 外观', () => {
    it('tone 决定条的颜色', () => {
        expect(indicator(render({modelValue: 40})).classes()).toContain('bg-accent')
        expect(indicator(render({modelValue: 40, tone: 'danger'})).classes()).toContain('bg-danger')
        expect(indicator(render({modelValue: null, tone: 'success'})).classes()).toContain('bg-success')
    })

    it('三档高度各自生效，默认 sm', () => {
        expect(root(render({modelValue: 1})).classes()).toContain('h-1.5')
        expect(root(render({modelValue: 1, size: 'xs'})).classes()).toContain('h-1')
        expect(root(render({modelValue: 1, size: 'md'})).classes()).toContain('h-2')
    })

    it('class 透传且不吃掉内置类', () => {
        const el = root(render({modelValue: 1, class: 'mt-2'}))
        expect(el.classes()).toContain('mt-2')
        expect(el.classes()).toContain('bg-inset')
    })
})
