/**
 * PasswordInput 的按钮是「贴在原语外面」的（`Input` 的 `#suffix` 槽是装饰位，
 * 塞不进可点的东西），所以三条 a11y 细节必须由测试守住：
 *
 * - `type="button"` —— 认证页的密码框在 `<form>` 里，漏了就变成「看一眼密码顺手提交」
 * - `aria-pressed` + 随状态变化的 `aria-label` —— 只有图标时读屏念不出当前是明文还是密文
 * - 切换不抢焦点 —— 用户可能正在打字，抢焦点会打断输入法
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import PasswordInput from './PasswordInput.vue'

const LABELS = {showLabel: '显示密码', hideLabel: '隐藏密码'}

describe('PasswordInput', () => {
    it('默认密文，按钮不会提交表单', () => {
        const wrapper = mount(PasswordInput, {props: LABELS})
        expect(wrapper.find('input').attributes('type')).toBe('password')
        expect(wrapper.find('button').attributes('type')).toBe('button')
    })

    it('切换明文：type、aria-pressed、aria-label 三者同步', async () => {
        const wrapper = mount(PasswordInput, {props: LABELS})
        const button = wrapper.find('button')

        expect(button.attributes('aria-pressed')).toBe('false')
        expect(button.attributes('aria-label')).toBe('显示密码')

        await button.trigger('click')
        expect(wrapper.find('input').attributes('type')).toBe('text')
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(button.attributes('aria-label')).toBe('隐藏密码')

        await button.trigger('click')
        expect(wrapper.find('input').attributes('type')).toBe('password')
    })

    it('切换不抢焦点', async () => {
        const wrapper = mount(PasswordInput, {props: LABELS, attachTo: document.body})
        const input = wrapper.find('input').element
        input.focus()
        await wrapper.find('button').trigger('click')
        expect(document.activeElement).toBe(input)
        wrapper.unmount()
    })

    it('$attrs 落在真正的 <input> 上', () => {
        const wrapper = mount(PasswordInput, {
            props: LABELS,
            attrs: {id: 'pwd', autocomplete: 'current-password', 'aria-describedby': 'pwd-error'},
        })
        const input = wrapper.find('input')
        expect(input.attributes('id')).toBe('pwd')
        expect(input.attributes('autocomplete')).toBe('current-password')
        expect(input.attributes('aria-describedby')).toBe('pwd-error')
        expect(wrapper.element.getAttribute('id')).toBeNull()
    })

    it('输入与回车向上转发', async () => {
        const wrapper = mount(PasswordInput, {props: LABELS})
        await wrapper.find('input').setValue('hunter2')
        expect(wrapper.emitted('update:modelValue')).toEqual([['hunter2']])
        await wrapper.find('input').trigger('keydown.enter')
        expect(wrapper.emitted('enter')).toHaveLength(1)
    })

    it('禁用态连按钮一起禁掉', () => {
        const wrapper = mount(PasswordInput, {props: {...LABELS, disabled: true}})
        expect(wrapper.find('input').attributes('disabled')).toBeDefined()
        expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('错误态传给输入框', () => {
        const wrapper = mount(PasswordInput, {props: {...LABELS, invalid: true}})
        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    })

    it('暴露 focus()', () => {
        const wrapper = mount(PasswordInput, {props: LABELS, attachTo: document.body})
        wrapper.vm.focus()
        expect(document.activeElement).toBe(wrapper.find('input').element)
        wrapper.unmount()
    })
})
