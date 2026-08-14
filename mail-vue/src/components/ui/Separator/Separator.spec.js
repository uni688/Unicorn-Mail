import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Separator from './Separator.vue'

const render = (props = {}) => mount(Separator, {props})

describe('Separator', () => {
    it('默认是装饰性的：靠 role="none" 退出无障碍树', () => {
        // reka 的 BaseSeparator 在 decorative 下只给 `role="none"`，不额外补 aria-hidden，
        // 这已经足够让读屏跳过它（角色被显式抹掉了），所以这里不要求 aria-hidden。
        const wrapper = render()
        expect(wrapper.attributes('role')).toBe('none')
        expect(wrapper.attributes('aria-orientation')).toBeUndefined()
    })

    it('真的在分组时才给 role="separator"', () => {
        const wrapper = render({decorative: false})
        expect(wrapper.attributes('role')).toBe('separator')
        expect(wrapper.attributes('aria-hidden')).toBeUndefined()
    })

    it('横向是 1px 高、撑满宽', () => {
        expect(render().classes()).toEqual(expect.arrayContaining(['h-px', 'w-full']))
    })

    it('纵向是 1px 宽、撑满高', () => {
        expect(render({orientation: 'vertical'}).classes()).toEqual(expect.arrayContaining(['w-px', 'h-full']))
    })

    it('非装饰时把方向报给读屏', () => {
        expect(render({decorative: false, orientation: 'vertical'}).attributes('aria-orientation')).toBe('vertical')
    })

    it('data-orientation 供样式钩子使用', () => {
        expect(render({orientation: 'vertical'}).attributes('data-orientation')).toBe('vertical')
    })

    it('strong 换用更重的线色', () => {
        expect(render({strong: true}).classes()).toContain('bg-line-strong')
        expect(render().classes()).toContain('bg-line')
    })

    it('不被 flex 压扁', () => {
        expect(render().classes()).toContain('shrink-0')
    })

    it('class 透传', () => {
        expect(render({class: 'my-3'}).classes()).toContain('my-3')
    })
})
