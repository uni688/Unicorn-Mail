/**
 * GlassCard 的材质数值一个都不硬编码（§4.12），所以这里测的是「算出来的那一串」：
 *
 * - 不透明度的 **0.55 下限**是 §5.3.1 的对比度守卫第一条：站长把登录卡调到 0.2
 *   也要抬回 0.55，否则背景图会从正文底下透上来。
 * - `max(…, var(--um-glass-min-alpha))` 是第二、三条守卫的接口：
 *   没有 `backdrop-filter` 时退到 96%、`prefers-contrast: more` 时退到实色，
 *   两者都靠 token 抬这个下限（见 tokens.css），所以这个 `max()` 不能被优化掉。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {h} from 'vue'
import GlassCard from './GlassCard.vue'

function styleOf(props = {}) {
    return mount(GlassCard, {props}).attributes('style') ?? ''
}

describe('GlassCard · 不透明度', () => {
    it('缺省读 token，不写死数值', () => {
        expect(styleOf()).toContain('var(--um-glass-alpha)')
    })

    it('低于 0.55 抬回下限（§5.3.1 对比度守卫）', () => {
        expect(styleOf({opacity: 0.2})).toContain('max(0.55,')
        expect(styleOf({opacity: 0})).toContain('max(0.55,')
    })

    it('高于 1 收到 1，站长传的合法值原样用', () => {
        expect(styleOf({opacity: 1.4})).toContain('max(1,')
        expect(styleOf({opacity: 0.88})).toContain('max(0.88,')
        // 后端下发的是字符串时也要认
        expect(styleOf({opacity: '0.7'})).toContain('max(0.7,')
    })

    it('非法值退回 token 而不是算出 NaN', () => {
        expect(styleOf({opacity: 'auto'})).toContain('var(--um-glass-alpha)')
        expect(styleOf({opacity: ''})).toContain('var(--um-glass-alpha)')
    })

    it('下限始终与 --um-glass-min-alpha 取 max：无 backdrop-filter 与高对比模式靠它兜底', () => {
        expect(styleOf({opacity: 0.88})).toContain('var(--um-glass-min-alpha)')
    })
})

describe('GlassCard · 几何与材质', () => {
    it('圆角三档，登录卡用 2xl（20px，全站唯一一处）', () => {
        expect(mount(GlassCard, {props: {radius: '2xl'}}).classes()).toContain('rounded-2xl')
        expect(mount(GlassCard, {props: {radius: 'xl'}}).classes()).toContain('rounded-xl')
        expect(mount(GlassCard).classes()).toContain('rounded-lg')
        expect(mount(GlassCard, {props: {radius: 'nope'}}).classes()).toContain('rounded-lg')
    })

    it('模糊半径：数字按 px，缺省读 token', () => {
        expect(styleOf({blur: 12})).toContain('12px')
        expect(styleOf()).toContain('var(--um-glass-blur)')
    })

    it('高光走 ::before 且压在根节点背景之后，不为它多套一层 div', () => {
        const wrapper = mount(GlassCard, {slots: {default: () => h('span', 'x')}})
        expect(wrapper.classes()).toContain('isolate')
        expect(wrapper.classes()).toContain('before:-z-10')
        // 内容是直接子节点：套一层会毁掉调用方传的 flex/grid
        expect(wrapper.element.firstElementChild.tagName).toBe('SPAN')
    })

    it('高对比模式撤掉模糊与高光，换实线边框', () => {
        const classes = mount(GlassCard).classes()
        expect(classes).toContain('contrast-more:backdrop-filter-none')
        expect(classes).toContain('contrast-more:before:hidden')
        expect(classes).toContain('contrast-more:border-line-strong')
    })

    it('as / asChild：能当 section 用，也能把材质并到子节点上', () => {
        expect(mount(GlassCard, {props: {as: 'section'}}).element.tagName).toBe('SECTION')

        const wrapper = mount(GlassCard, {
            props: {asChild: true},
            slots: {default: () => h('form', {class: 'my-form'})},
        })
        expect(wrapper.element.tagName).toBe('FORM')
        expect(wrapper.classes()).toContain('my-form')
        expect(wrapper.classes()).toContain('isolate')
    })
})
