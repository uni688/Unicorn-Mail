import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Spinner from './Spinner.vue'

const render = (props = {}) => mount(Spinner, {props})

describe('Spinner', () => {
    it('不给 label 时纯装饰：整体隐身，不占 status 语义', () => {
        const wrapper = render()
        expect(wrapper.attributes('aria-hidden')).toBe('true')
        expect(wrapper.attributes('role')).toBeUndefined()
    })

    it('给了 label 就变成 status，读屏会播报一次', () => {
        const wrapper = render({label: '加载中'})
        expect(wrapper.attributes('role')).toBe('status')
        expect(wrapper.attributes('aria-hidden')).toBeUndefined()
        expect(wrapper.text()).toBe('加载中')
    })

    it('label 只给读屏，不占视觉位置', () => {
        expect(render({label: '加载中'}).get('span > span').classes()).toContain('sr-only')
    })

    it('图标本身永远隐身 —— 语义由外层承担', () => {
        expect(render({label: '加载中'}).get('svg').attributes('aria-hidden')).toBe('true')
    })

    it('图标在转', () => {
        expect(render().get('svg').classes()).toContain('animate-spin')
    })

    it('四档尺寸', () => {
        expect(render({size: 'xs'}).get('svg').classes()).toContain('size-3')
        expect(render().get('svg').classes()).toContain('size-4')
        expect(render({size: 'md'}).get('svg').classes()).toContain('size-5')
        expect(render({size: 'lg'}).get('svg').classes()).toContain('size-6')
    })

    it('行内对齐，混在文字里不跳行', () => {
        expect(render().classes()).toEqual(expect.arrayContaining(['inline-flex', 'align-middle']))
    })

    it('不被 flex 压扁', () => {
        expect(render().get('svg').classes()).toContain('shrink-0')
    })

    it('class 透传到外层', () => {
        expect(render({class: 'text-accent'}).classes()).toContain('text-accent')
    })
})
