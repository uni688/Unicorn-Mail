/**
 * email-scroll 的装载冒烟（P4 回归）。
 *
 * 这个组件只剩草稿箱与管理端「全部邮件」在用，之前一直没有用例 —— `0c4c686` 把状态图标表
 * 收进 `useMailList.statusIconMap` 时漏了 import，`handleList` 每次都抛 ReferenceError，
 * 列表被 `refresh` 清空后再也填不回来，两个页面都只剩空态。lint 报了 `no-undef`，但 vitest /
 * build 都是绿的，因为从来没人把它真的装起来过。这里钉住的就是「装起来、拿到数据、行被装饰」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {ref} from 'vue'

// 依赖链（useComposer → router → …）里有模块在 import 时就取 store，得先有 active pinia
setActivePinia(createPinia())

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

const EmailScroll = (await import('./index.vue')).default

const mail = (emailId, extra = {}) => ({
    emailId,
    name: `发件人${emailId}`,
    sendEmail: `s${emailId}@x.dev`,
    toEmail: `r${emailId}@x.dev`,
    userEmail: 'owner@x.dev',
    subject: `主题 ${emailId}`,
    text: `正文 ${emailId}`,
    createTime: '2026-08-20 03:00:00',
    unread: 1,
    isStar: 0,
    status: 0,
    type: 0,
    attList: [],
    ...extra,
})

let wrapper

const render = (props = {}) => {
    wrapper = mount(EmailScroll, {
        props: {getEmailList: vi.fn(), ...props},
        global: {
            config: {globalProperties: {$t: (key) => key}},
            directives: {perm: {}},
        },
    })
    return wrapper
}

beforeEach(() => {
    setActivePinia(createPinia())
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

describe('email-scroll · 装载', () => {
    it('管理端「全部邮件」：首屏数据进列表，每行都带上状态图标', async () => {
        const getEmailList = vi.fn(() => Promise.resolve({
            list: [mail(3, {status: 0}), mail(2, {status: 3}), mail(1, {status: 4, isDel: 1})],
            total: 3,
            latestEmail: null,
        }))
        const vm = render({getEmailList, type: 'all-email', showStatus: true, showUserInfo: true}).vm

        // 组件自带 300ms 的最短骨架时长，等它把数据填进来
        await vi.waitFor(() => expect(vm.emailList).toHaveLength(3))

        expect(getEmailList).toHaveBeenCalledWith(0, 50)
        expect(vm.total).toBe(3)
        expect(vm.emailList.map((e) => e.statusIcon?.content)).toEqual(['received', 'bounced', 'complained'])
        expect(vm.emailList[0].statusIcon.color).toBe('var(--color-success)')
        expect(vm.emailList[2].isDelContent).toBe('selectDeleted')
        expect(vm.emailList.every((e) => e.formatText && e.formatCreateTime)).toBe(true)
    })

    it('草稿箱：同一条装饰路径，不能因为没有 status 列就跳过', async () => {
        const getEmailList = vi.fn(() => Promise.resolve({
            list: [mail(9, {draftId: 90})],
            total: 1,
            latestEmail: null,
        }))
        const vm = render({getEmailList, type: 'draft', showStar: false}).vm

        await vi.waitFor(() => expect(vm.emailList).toHaveLength(1))
        expect(vm.emailList[0].formatText).toBe('正文 9')
    })

    it('addItem 走的也是 handleList：新邮件插到正确位置并被装饰', async () => {
        const getEmailList = vi.fn(() => Promise.resolve({
            list: [mail(5), mail(4)],
            total: 2,
            latestEmail: null,
        }))
        const vm = render({getEmailList, type: 'all-email', showStatus: true}).vm
        await vi.waitFor(() => expect(vm.emailList).toHaveLength(2))

        expect(vm.addItem(mail(6, {status: 2}))).toBe(true)
        expect(vm.emailList.map((e) => e.emailId)).toEqual([6, 5, 4])
        expect(vm.emailList[0].statusIcon.content).toBe('delivered')
        expect(vm.total).toBe(3)
    })
})
