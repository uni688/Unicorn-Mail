/**
 * MailRow 单测。
 *
 * 三条是「相对旧行的改动」，必须钉住：邮件对象只读（不再往里塞 checked）、
 * 整行是 `role="option"`（键盘能到）、未读用点 + 加粗而不是整行底色。
 * 其余是把 §7.4 的显示规则固定下来：星标 / 附件 / 验证码 / 状态点的出现条件。
 */
import {describe, it, expect} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'

setActivePinia(createPinia())

const MailRow = (await import('./MailRow.vue')).default

const mail = (extra = {}) => ({
    emailId: 1,
    name: 'Stripe',
    sendEmail: 'billing@stripe.com',
    subject: '8 月发票',
    formatText: '本月共计 42 元',
    formatCreateTime: '10:24',
    createTime: '2026-08-20 02:24:00',
    unread: 1,
    isStar: 0,
    attList: [],
    ...extra,
})

const mountRow = (props = {}) => mount(MailRow, {
    props: {email: mail(), selectLabel: '选择', starLabel: '星标', ...props},
})

describe('MailRow', () => {

    it('整行是 role=option，选中态进 aria-selected', () => {
        const wrapper = mountRow({selected: true})
        expect(wrapper.attributes('role')).toBe('option')
        expect(wrapper.attributes('aria-selected')).toBe('true')
    })

    it('高度来自 density 档位', () => {
        expect(mountRow({height: 44}).attributes('style')).toContain('height: 44px')
        expect(mountRow({height: 72}).attributes('style')).toContain('height: 72px')
    })

    it('不往邮件对象上写任何字段（旧行把 checked 塞进邮件里）', async () => {
        const email = mail()
        const before = Object.keys(email).sort()
        const wrapper = mount(MailRow, {props: {email, selected: false}})
        await wrapper.trigger('click')
        await wrapper.find('input[type="checkbox"], button[role="checkbox"]').trigger('click')
        expect(Object.keys(email).sort()).toEqual(before)
    })

    // `entity-const.js:54` 里 UNREAD=0 / READ=1，名字和直觉相反，这两个用例顺手把它钉住
    it('未读：出现未读点 + 加粗，但不给整行底色', () => {
        const wrapper = mountRow({email: mail({unread: 0}), showUnread: true})
        expect(wrapper.attributes('data-unread')).toBe('true')
        expect(wrapper.html()).toContain('rounded-full bg-accent')
        expect(wrapper.classes().join(' ')).not.toContain('bg-accent-subtle')
    })

    it('已读（unread=1）没有未读点', () => {
        const wrapper = mountRow({email: mail({unread: 1}), showUnread: true})
        expect(wrapper.attributes('data-unread')).toBeUndefined()
        expect(wrapper.html()).not.toContain('rounded-full bg-accent')
    })

    it('showUnread=false 时不谈未读（回收站 / 已发送）', () => {
        const wrapper = mountRow({email: mail({unread: 0}), showUnread: false})
        expect(wrapper.attributes('data-unread')).toBeUndefined()
        expect(wrapper.html()).not.toContain('rounded-full bg-accent')
    })

    it('点击整行抛 open；勾选和星标不会顺带打开', async () => {
        const wrapper = mountRow()
        await wrapper.trigger('click')
        expect(wrapper.emitted('open')).toHaveLength(1)

        // Checkbox 也渲染成 button，所以按 aria-label 找星标那个
        await wrapper.find('button[aria-label="星标"]').trigger('click')
        expect(wrapper.emitted('toggle-star')).toHaveLength(1)
        expect(wrapper.emitted('open')).toHaveLength(1)
    })

    it('验证码是个按钮，点了只抛 copy-code', async () => {
        const wrapper = mountRow({email: mail({code: '123456'}), codeLabel: '验证码：'})
        const chip = wrapper.findAll('button').find((b) => b.text().includes('123456'))
        expect(chip).toBeTruthy()
        await chip.trigger('click')
        expect(wrapper.emitted('copy-code')[0]).toEqual(['123456'])
        expect(wrapper.emitted('open')).toBeUndefined()
    })

    it('附件图标只在有附件时出现', () => {
        // 图标是内联 SVG（unplugin-icons），名字不在 DOM 里，所以数 svg 个数
        const without = mountRow().findAll('svg').length
        const withAtt = mountRow({email: mail({attList: [{attId: 1}]})}).findAll('svg').length
        expect(withAtt).toBe(without + 1)
    })

    it('时间列的 title 是绝对时间（相对时间好读，几点必须查得到）', () => {
        const wrapper = mountRow()
        const time = wrapper.findAll('span').find((s) => s.attributes('title'))
        expect(time.attributes('title')).toBeTruthy()
        expect(time.text()).toBe('10:24')
    })

    it('showStatus 才画状态点（已发送视图）；颜色来自 statusIcon', () => {
        const email = mail({statusIcon: {color: '#F56C6C', content: '退信'}})
        const dotOf = (wrapper) => wrapper.findAll('span')
            .find((s) => (s.attributes('style') ?? '').includes('background'))

        expect(dotOf(mountRow({email}))).toBeUndefined()
        // Vue 会把 #F56C6C 规范成 rgb()，所以断言两种写法之一
        const style = dotOf(mountRow({email, showStatus: true})).attributes('style')
        expect(style).toMatch(/#F56C6C|rgb\(245, 108, 108\)/i)
    })

    it('右键把事件和邮件一起抛出去（旧行是把 #FDF6EC 写进 style）', async () => {
        const wrapper = mountRow()
        await wrapper.trigger('contextmenu')
        expect(wrapper.emitted('contextmenu')).toHaveLength(1)
        expect(wrapper.emitted('contextmenu')[0][1].emailId).toBe(1)
    })
})
