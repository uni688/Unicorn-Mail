/**
 * EmailInput 是「两个真控件拼成一条输入行」，所以要锁的正是**拼装没把语义拼坏**：
 * `$attrs`（`id` / `aria-describedby` / `autocomplete`）必须落在真正的 `<input>` 上
 * 而不是外层 div —— 落错了 `Field` 的 label 就点不到控件、报错也读不出来。
 *
 * 旧实现是把一个透明 `el-select` 盖在输入框上（`login/index.vue:22-39`），
 * 键盘打不开、读屏读不到；这里 `aria-label` 与 Tab 序两条断言就是防回退的闸。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import EmailInput from './EmailInput.vue'

const DOMAINS = [
    {label: '@one.com', value: '@one.com'},
    {label: '@two.com', value: '@two.com'},
]

function mountInput(props = {}, attrs = {}) {
    return mount(EmailInput, {
        props: {domainOptions: DOMAINS, suffix: '@one.com', domainLabel: '选择域名', ...props},
        attrs,
    })
}

describe('EmailInput', () => {
    it('前缀框与域名选择器各是一个可聚焦控件', () => {
        const wrapper = mountInput()
        expect(wrapper.find('input').exists()).toBe(true)
        const trigger = wrapper.find('button')
        expect(trigger.exists()).toBe(true)
        expect(trigger.attributes('aria-label')).toBe('选择域名')
        // 两者都在 Tab 序里（旧实现的透明 select 是 pointer-events:none，永远进不来）
        expect(trigger.attributes('tabindex')).not.toBe('-1')
    })

    it('$attrs 落在真正的 <input> 上，不留在外层 div', () => {
        const wrapper = mountInput({}, {
            id: 'email-field',
            autocomplete: 'username',
            'aria-describedby': 'email-error',
        })
        const input = wrapper.find('input')
        expect(input.attributes('id')).toBe('email-field')
        expect(input.attributes('autocomplete')).toBe('username')
        expect(input.attributes('aria-describedby')).toBe('email-error')
        expect(wrapper.element.getAttribute('id')).toBeNull()
    })

    it('class 落在联体外层，用来接 Field 传下来的布局', () => {
        const wrapper = mountInput({class: 'mt-2'})
        expect(wrapper.classes()).toContain('mt-2')
        expect(wrapper.classes()).toContain('flex')
    })

    it('输入与回车向上转发', async () => {
        const wrapper = mountInput()
        await wrapper.find('input').setValue('bob')
        expect(wrapper.emitted('update:modelValue')).toEqual([['bob']])

        await wrapper.find('input').trigger('keydown.enter')
        expect(wrapper.emitted('enter')).toHaveLength(1)
    })

    /**
     * P4 收尾时用户报的「域名选择器没法正常用」：上限原来是 `max-w-[45%]`，手机上登录卡片
     * 内宽约 234px，域名只剩 105px，`@example.com / @example2.com / @example3.com` 全被截成
     * `@exa…`，选了哪个看不出来。现在上限按「整行减掉前缀框的最小宽度」算。
     * jsdom 没有布局，量不了像素，所以钉的是这条宽度规则本身（像素在真浏览器里量过：
     * 360px 宽的手机上 `@example3.com` 完整显示）。
     */
    it('域名按内容宽度显示，只给前缀框留出最小宽度，不再按 45% 封顶', () => {
        const wrapper = mountInput()
        const trigger = wrapper.get('button')
        expect(trigger.classes()).not.toContain('max-w-[45%]')
        expect(trigger.classes()).toContain('max-w-[calc(100%_-_5rem)]')
        // 前缀框的最小宽度就是上面那 5rem，两边对得上才不会互相挤
        expect(wrapper.get('input').element.closest('.min-w-20')).not.toBeNull()
    })

    it('站长隐藏域名时后缀选择器整块不渲染', () => {
        const wrapper = mountInput({hideDomain: true})
        expect(wrapper.find('input').exists()).toBe(true)
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('错误态同时传给两段，视觉上才是一条完整的红线', () => {
        const wrapper = mountInput({invalid: true})
        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
        expect(wrapper.find('button').attributes('aria-invalid')).toBe('true')
    })

    it('禁用态传给两段', () => {
        const wrapper = mountInput({disabled: true})
        expect(wrapper.find('input').attributes('disabled')).toBeDefined()
        expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('暴露 focus()：认证页要自动聚焦第一个空字段', () => {
        const wrapper = mount(EmailInput, {
            props: {domainOptions: DOMAINS, suffix: '@one.com', domainLabel: '选择域名'},
            attachTo: document.body,
        })
        wrapper.vm.focus()
        expect(document.activeElement).toBe(wrapper.find('input').element)
        wrapper.unmount()
    })
})
