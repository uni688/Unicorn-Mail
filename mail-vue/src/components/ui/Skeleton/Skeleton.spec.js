import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Skeleton from './Skeleton.vue'

/**
 * 骨架的关键约束是「不要抖」：尺寸由调用方按真实内容给，组件只提供几何形状。
 * 所以这里重点测 width/height 有没有原样透传、多行时最后一行有没有短一截，
 * 以及整块骨架对读屏是否完全隐身。
 */

const render = (props = {}) => mount(Skeleton, {props})

describe('Skeleton · 无障碍', () => {
    it('单块骨架对读屏隐身', () => {
        expect(render().attributes('aria-hidden')).toBe('true')
    })

    it('多行骨架在容器上隐身一次就够，不用每行都念', () => {
        const wrapper = render({lines: 3})
        expect(wrapper.attributes('aria-hidden')).toBe('true')
        const rows = wrapper.findAll(':scope > div')
        expect(rows).toHaveLength(3)
        expect(rows.every((row) => row.attributes('aria-hidden') === undefined)).toBe(true)
    })
})

describe('Skeleton · 形状', () => {
    it('text 默认单行、撑满宽度', () => {
        const classes = render().classes()
        expect(classes).toContain('h-3.5')
        expect(classes).toContain('w-full')
    })

    it('rect 用中等圆角', () => {
        expect(render({variant: 'rect'}).classes()).toContain('rounded-md')
    })

    it('circle 是整圆', () => {
        expect(render({variant: 'circle'}).classes()).toContain('rounded-full')
    })

    it('lines>1 时最后一行短一截，像自然段落', () => {
        const rows = render({lines: 3}).findAll(':scope > div')
        expect(rows[0].classes()).toContain('w-full')
        expect(rows[2].classes()).toContain('w-3/5')
    })

    it('lines=1 走单块分支，不多包一层 flex 容器', () => {
        const wrapper = render({lines: 1})
        expect(wrapper.classes()).not.toContain('flex-col')
        expect(wrapper.findAll(':scope > div')).toHaveLength(0)
    })
})

describe('Skeleton · 尺寸透传', () => {
    it('width / height 原样进 inline style', () => {
        const wrapper = render({variant: 'rect', width: '120px', height: '40px'})
        expect(wrapper.element.style.width).toBe('120px')
        expect(wrapper.element.style.height).toBe('40px')
    })

    it('百分比宽度也能给', () => {
        expect(render({variant: 'rect', width: '60%'}).element.style.width).toBe('60%')
    })

    it('不给尺寸时不写空的 inline style', () => {
        expect(render({variant: 'rect'}).attributes('style')).toBeUndefined()
    })

    it('给了 width 的 text 骨架不再强制 w-full', () => {
        expect(render({width: '80px'}).classes()).not.toContain('w-full')
    })

    it('多行时最后一行不吃自定义宽度 —— 它要保持那截短的比例', () => {
        const rows = render({lines: 2, width: '200px'}).findAll(':scope > div')
        expect(rows[0].element.style.width).toBe('200px')
        expect(rows[1].attributes('style')).toBeUndefined()
        expect(rows[1].classes()).toContain('w-3/5')
    })
})

describe('Skeleton · 微光动画', () => {
    it('走 token 定义的渐变与 animate-skeleton', () => {
        const classes = render().classes()
        expect(classes).toContain('animate-skeleton')
        expect(classes.join(' ')).toContain('var(--um-skeleton-gradient)')
    })

    it('多行时每一行都有微光', () => {
        const rows = render({lines: 2}).findAll(':scope > div')
        expect(rows.every((row) => row.classes().includes('animate-skeleton'))).toBe(true)
    })

    it('class 透传到骨架块本身（多行时落在每一行上）', () => {
        expect(render({class: 'opacity-50'}).classes()).toContain('opacity-50')
        const rows = render({lines: 2, class: 'opacity-50'}).findAll(':scope > div')
        expect(rows.every((row) => row.classes().includes('opacity-50'))).toBe(true)
    })
})
