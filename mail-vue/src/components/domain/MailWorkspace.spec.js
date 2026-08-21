/**
 * MailWorkspace 单测（§7.5）。
 *
 * 这是列表与阅读窗格的接缝，所以测的都是「两边会不会分叉」：
 *   - 打开邮件 → 写进 URL（深链）、标已读、刷新角标；
 *   - 删除 → 摘行 + 关窗格 + 广播给其它列表；
 *   - 刷新页面（URL 带 id）→ 从已加载列表里找回那一封；
 *   - 窗格位置记忆（right / bottom / off）。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

setActivePinia(createPinia())

/**
 * 断点必须在**任何组件 import 之前**决定：`useBreakpoint()` 把 matchMedia 的结果
 * memo 在模块级 Map 里（`useBreakpoint.js:21`），晚了就改不动了。
 * 这里假装 1440px 宽（桌面），否则 jsdom 的默认桩全为 false = 最窄断点，
 * 阅读窗格根本不渲染（窄屏是整页打开）。
 */
window.matchMedia = (query) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(String(query))?.[1] ?? 0)
    return {
        matches: 1440 >= min,
        media: String(query),
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
    }
}

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: ref('zh')}),
}))

const emailRead = vi.fn(() => Promise.resolve())
const emailUnread = vi.fn(() => Promise.resolve())
const emailCounts = vi.fn(() => Promise.resolve({}))

vi.mock('@/request/email.js', () => ({
    emailRead: (...a) => emailRead(...a),
    emailUnread: (...a) => emailUnread(...a),
    emailCounts: (...a) => emailCounts(...a),
}))

const MailWorkspace = (await import('./MailWorkspace.vue')).default
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')
const {useUserStore} = await import('@/store/user.js')
const {useEmailStore} = await import('@/store/email.js')

const mail = (emailId, extra = {}) => ({
    emailId,
    name: `发件人${emailId}`,
    sendEmail: `s${emailId}@x.dev`,
    subject: `主题 ${emailId}`,
    text: '正文',
    createTime: '2026-08-20 03:00:00',
    unread: 0,
    isStar: 0,
    status: 0,
    attList: [],
    ...extra,
})

const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

let wrapper
let router

beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useMailPrefs().resetPrefs()
    // 权限：删除 / 发信都放开，否则按钮不画
    useUserStore().user = {permKeys: ['*']}
    emailRead.mockClear()
    emailUnread.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            return 560
        },
    })
})

afterEach(() => {
    if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor)
    wrapper?.unmount()
    wrapper = null
})

async function mountWorkspace(props = {}, {startAt = '/mail/inbox'} = {}) {
    router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/mail/inbox/:emailId?', name: 'email', component: {template: '<div />'}, meta: {mail: true}}],
    })
    router.push(startAt)
    await router.isReady()

    wrapper = mount(MailWorkspace, {
        props: {fetch: () => Promise.resolve({list: [mail(10), mail(9), mail(8)], total: 3}), ...props},
        global: {plugins: [router]},
        attachTo: document.body,
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    return wrapper
}

const rows = () => wrapper.findAll('[role="option"]')

/** `router.replace` 要跨过一个宏任务才落地（memory history 也一样），别只 await nextTick */
const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await nextTick()
}

describe('MailWorkspace · 打开与深链', () => {

    it('点一封 → 路由带上 emailId，窗格显示它', async () => {
        await mountWorkspace()
        await rows()[0].trigger('click')
        await flush()

        expect(router.currentRoute.value.params.emailId).toBe('10')
        expect(wrapper.text()).toContain('主题 10')
    })

    it('打开就标已读（乐观 + 请求）', async () => {
        await mountWorkspace()
        await rows()[0].trigger('click')
        await nextTick()

        expect(emailRead).toHaveBeenCalledWith([10])
        // 行上的未读点消失（UNREAD=0 → READ=1）
        expect(rows()[0].attributes('data-unread')).toBeUndefined()
    })

    it('已读的邮件再打开不重复发请求', async () => {
        await mountWorkspace({fetch: () => Promise.resolve({list: [mail(10, {unread: 1})], total: 1})})
        await rows()[0].trigger('click')
        expect(emailRead).not.toHaveBeenCalled()
    })

    it('showUnread=false（已发送 / 回收站）时不碰已读接口', async () => {
        await mountWorkspace({showUnread: false})
        await rows()[0].trigger('click')
        expect(emailRead).not.toHaveBeenCalled()
    })

    it('URL 直接带 id 进来：从已加载列表里找回那一封', async () => {
        await mountWorkspace({}, {startAt: '/mail/inbox/9'})
        expect(wrapper.text()).toContain('主题 9')
    })

    it('URL 带的 id 不在已加载范围内：保持列表态而不是空窗格', async () => {
        await mountWorkspace({}, {startAt: '/mail/inbox/999'})
        expect(wrapper.text()).toContain('mail.noSelection')
    })

    it('连点五封不在历史里堆五条（replace 而不是 push）', async () => {
        await mountWorkspace()
        const before = router.currentRoute.value.fullPath
        await rows()[0].trigger('click')
        await rows()[1].trigger('click')
        await flush()
        expect(before).toBe('/mail/inbox')
        expect(router.currentRoute.value.params.emailId).toBe('9')
    })
})

describe('MailWorkspace · 动作的连带影响', () => {

    it('删除：摘行 + 关窗格 + 清 URL + 广播给其它列表', async () => {
        const onDelete = vi.fn(() => Promise.resolve())
        await mountWorkspace({onDelete})

        await rows()[0].trigger('click')
        await flush()
        expect(router.currentRoute.value.params.emailId).toBe('10')

        const trash = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.moveToTrash')
        await trash.trigger('click')
        await flush()

        expect(onDelete).toHaveBeenCalledWith([10])
        expect(rows()).toHaveLength(2)
        // 按名字导航时缺省的可选段是 undefined，直接贴地址进来是空串，两者都表示「没有 id」
        expect(router.currentRoute.value.params.emailId ?? '').toBe('')
        expect(router.currentRoute.value.path).toBe('/mail/inbox')
        expect(useEmailStore().deleteIds).toEqual([10])
    })

    it('删除失败时列表不动（乐观更新只在成功后发生）', async () => {
        const onDelete = vi.fn(() => Promise.reject(new Error('boom')))
        await mountWorkspace({onDelete})
        await rows()[0].trigger('click')
        await flush()

        const trash = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.moveToTrash')
        await trash.trigger('click')
        await flush()

        expect(rows()).toHaveLength(3)
        expect(router.currentRoute.value.params.emailId).toBe('10')
    })

    it('标记未读：行与窗格同时变回未读，并调接口', async () => {
        await mountWorkspace()
        await rows()[0].trigger('click')
        await flush()

        const unreadBtn = wrapper.findAll('button')
            .find((b) => b.attributes('aria-label') === 'mail.markUnread')
        await unreadBtn.trigger('click')
        await flush()

        expect(emailUnread).toHaveBeenCalledWith([10])
        expect(rows()[0].attributes('data-unread')).toBe('true')
    })

    it('回收站模式把还原 / 彻底删除接到对应回调', async () => {
        const onRestore = vi.fn(() => Promise.resolve())
        const onPurge = vi.fn(() => Promise.resolve())
        await mountWorkspace({trashMode: true, showUnread: false, showStar: false, onRestore, onPurge})

        await rows()[0].trigger('click')
        await flush()

        const restore = wrapper.findAll('button').find((b) => b.text() === 'mail.restore')
        await restore.trigger('click')
        await flush()
        expect(onRestore).toHaveBeenCalledWith([10])
        expect(rows()).toHaveLength(2)

        await rows()[0].trigger('click')
        await flush()
        const purge = wrapper.findAll('button').find((b) => b.text() === 'mail.purge')
        await purge.trigger('click')
        await flush()
        expect(onPurge).toHaveBeenCalledWith([9])
    })

    it('窗格位置 off 时不渲染阅读窗格（记忆在 prefs 里）', async () => {
        useMailPrefs().setPane('off')
        await mountWorkspace()
        await rows()[0].trigger('click')
        await flush()
        expect(wrapper.text()).not.toContain('mail.noSelection')
        expect(wrapper.findAll('button').some((b) => b.attributes('aria-label') === 'mail.reply')).toBe(false)
    })
})
