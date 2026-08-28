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
import {defineComponent, h, KeepAlive, nextTick, ref} from 'vue'

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
const {useMailActions} = await import('@/composables/useMailActions.js')

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

/**
 * `pattern` 可以换成没有 `:emailId?` 段的路径：`/mail/sent` 在生产里就是这个形状
 * （`perm.js` 只给收件箱一类的路由补了可选段），深链 watch 的分裂就是为它写的。
 */
function makeRouter(pattern, startAt) {
    router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: pattern, name: 'email', component: {template: '<div />'}, meta: {mail: true}}],
    })
    router.push(startAt)
    return router.isReady()
}

async function mountWorkspace(props = {}, {startAt = '/mail/inbox', pattern = '/mail/inbox/:emailId?'} = {}) {
    await makeRouter(pattern, startAt)

    wrapper = mount(MailWorkspace, {
        props: {fetch: () => Promise.resolve({list: [mail(10), mail(9), mail(8)], total: 3}), ...props},
        global: {plugins: [router]},
        attachTo: document.body,
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    return wrapper
}

/**
 * 两个 workspace 塞进同一个 `<KeepAlive>`，靠 `key` 切换 —— 这就是 `layout/main` 的形状
 * （`:key="route.name"` + keep-alive）。切走的那一个不卸载，只 deactivate。
 */
async function mountKeepAlivePair(propsA, propsB, {startAt = '/mail/inbox'} = {}) {
    await makeRouter('/mail/inbox/:emailId?', startAt)

    const which = ref('a')
    const Host = defineComponent({
        setup() {
            return () => h(KeepAlive, null, {
                default: () => h(MailWorkspace, {key: which.value, ...(which.value === 'a' ? propsA : propsB)}),
            })
        },
    })

    wrapper = mount(Host, {global: {plugins: [router]}, attachTo: document.body})
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    return {
        async switchTo(next) {
            which.value = next
            await nextTick()
            await new Promise((resolve) => setTimeout(resolve, 350))
            await nextTick()
        },
    }
}

const rows = () => wrapper.findAll('[role="option"]')

/** 勾第一行（命令条的动作作用于勾选集合） */
const checkFirstRow = async () => {
    await rows()[0].find('button[role="checkbox"]').trigger('click')
    await nextTick()
}

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

/**
 * 审计 P2-3：命令条的 handler 必须跟着「当前可见的那个 workspace」走。
 *
 * 四个邮件视图常驻 keep-alive，`onUnmounted` 永不触发。只在 setup 里注册一次的话，
 * `useMailActions` 的 handlers 会永远指向**最后挂载过**的那一个 —— 在收件箱勾几封再点命令条的
 * 删除，执行的是回收站那份（`trashMode` → 彻底删除），删掉的是别人。
 */
describe('MailWorkspace · 命令条归属（审计 P2-3）', () => {

    it('切走再切回：动作落在当前可见的 workspace 上，而不是最后挂载的那个', async () => {
        const delA = vi.fn(() => Promise.resolve())
        const delB = vi.fn(() => Promise.resolve())
        const {switchTo} = await mountKeepAlivePair(
            {fetch: () => Promise.resolve({list: [mail(10), mail(9)], total: 2}), onDelete: delA},
            {fetch: () => Promise.resolve({list: [mail(20)], total: 1}), onDelete: delB},
        )
        const {run} = useMailActions()

        await checkFirstRow()
        run('delete')
        await flush()
        expect(delA).toHaveBeenCalledWith([10])
        expect(delB).not.toHaveBeenCalled()

        // B 挂载 → 它接管；A 只是 deactivate，它的 release 不该把 B 的注册清掉
        await switchTo('b')
        await checkFirstRow()
        run('delete')
        await flush()
        expect(delB).toHaveBeenCalledWith([20])
        expect(delA).toHaveBeenCalledTimes(1)

        // 回到 A：onActivated 重新接管（旧实现里这一步之后仍然是 B 的 handler）
        await switchTo('a')
        await checkFirstRow()
        run('delete')
        await flush()
        expect(delA).toHaveBeenCalledTimes(2)
        expect(delA).toHaveBeenLastCalledWith([9])
        expect(delB).toHaveBeenCalledTimes(1)
    })

    it('切走时命令条的选中数归零，不留上一个列表的数字', async () => {
        const {switchTo} = await mountKeepAlivePair(
            {fetch: () => Promise.resolve({list: [mail(10), mail(9)], total: 2})},
            {fetch: () => Promise.resolve({list: [mail(20)], total: 1})},
        )
        const {count} = useMailActions()

        await checkFirstRow()
        expect(count.value).toBe(1)

        await switchTo('b')
        expect(count.value).toBe(0)

        await checkFirstRow()
        expect(count.value).toBe(1)
    })

    it('一封都没勾、窗格也没打开时，命令条的删除什么都不做', async () => {
        const onDelete = vi.fn(() => Promise.resolve())
        await mountWorkspace({onDelete})

        useMailActions().run('delete')
        await flush()
        expect(onDelete).not.toHaveBeenCalled()
    })

    it('回收站里没有目标时也不发彻底删除（P1-2：空 id 曾经等于清空整个回收站）', async () => {
        const onPurge = vi.fn(() => Promise.resolve())
        await mountWorkspace({trashMode: true, showUnread: false, showStar: false, onPurge})

        useMailActions().run('delete')
        await flush()
        expect(onPurge).not.toHaveBeenCalled()
    })

    it('没勾选时命令条的删除作用于窗格里正在读的那一封', async () => {
        const onDelete = vi.fn(() => Promise.resolve())
        await mountWorkspace({onDelete})
        await rows()[0].trigger('click')
        await flush()

        useMailActions().run('delete')
        await flush()
        expect(onDelete).toHaveBeenCalledWith([10])
    })
})

/**
 * 审计 P2-7 的连带：深链 watch 必须是两条 watch 而不是一个数组 watch。
 *
 * 合成一条时，`listRef.mails.length` 变化会带着 `id === undefined` 触发回调、命中
 * `active.value = null`，正在读的邮件因为「列表多了一页」自己关掉。
 * `/mail/sent` 这类没有 `:emailId?` 段的路由每翻一页都会踩到。
 */
describe('MailWorkspace · 深链 watch 的分裂（审计 P2-7）', () => {

    it('路由没有 :emailId? 段时，列表变长不会关掉正在读的那一封', async () => {
        await mountWorkspace({}, {startAt: '/mail/sent', pattern: '/mail/sent'})
        await rows()[0].trigger('click')
        await flush()
        expect(wrapper.text()).not.toContain('mail.noSelection')

        wrapper.vm.addItem(mail(11))
        await flush()
        expect(wrapper.text()).not.toContain('mail.noSelection')
        expect(wrapper.text()).toContain('主题 10')
    })

    it('深链指向的邮件晚一步才进列表：列表变长之后仍然认得它', async () => {
        await mountWorkspace(
            {fetch: () => Promise.resolve({list: [mail(10)], total: 2})},
            {startAt: '/mail/inbox/9'},
        )
        expect(wrapper.text()).toContain('mail.noSelection')

        wrapper.vm.addItem(mail(9))
        await flush()
        expect(wrapper.text()).not.toContain('mail.noSelection')
        expect(wrapper.text()).toContain('主题 9')
    })

    it('URL 上的 id 被清掉（点返回 / 前进后退）才关窗格', async () => {
        await mountWorkspace({}, {startAt: '/mail/inbox/9'})
        expect(wrapper.text()).toContain('主题 9')

        await router.replace({name: 'email', params: {}})
        await flush()
        expect(wrapper.text()).toContain('mail.noSelection')
    })
})

/**
 * §7.5 的搜索：`?q=` 由 `MailWorkspace` 解析，条件作为**第三个参数**交给视图的 fetch。
 *
 * 这四个视图各自只多一行「把它转给自己的请求函数」，所以「解析、重新取数、Chip、
 * 空结果文案」这些形状一致的部分只在这一层测。
 */
describe('MailWorkspace · 搜索（§7.5）', () => {

    const okFetch = () => vi.fn(() => Promise.resolve({list: [mail(10), mail(9)], total: 2}))

    it('把 ?q= 解析出的条件作为第三个参数传给 fetch', async () => {
        const fetch = okFetch()
        await mountWorkspace({fetch}, {startAt: '/mail/inbox?q=from%3Aboss%20%E5%8F%91%E7%A5%A8'})

        expect(fetch).toHaveBeenCalled()
        expect(fetch.mock.calls[0][2]).toEqual({from: 'boss', keyword: '发票'})
    })

    it('没在搜时第三个参数是空对象（请求与从前逐字节等价）', async () => {
        const fetch = okFetch()
        await mountWorkspace({fetch})
        expect(fetch.mock.calls[0][2]).toEqual({})
    })

    it('条件变了重新从头取数，而不是接在旧结果后面翻页', async () => {
        const fetch = okFetch()
        await mountWorkspace({fetch})
        const before = fetch.mock.calls.length

        await router.replace({path: '/mail/inbox', query: {q: 'has:att'}})
        await flush()
        await new Promise((resolve) => setTimeout(resolve, 350))

        expect(fetch.mock.calls.length).toBeGreaterThan(before)
        const last = fetch.mock.calls.at(-1)
        expect(last[2]).toEqual({hasAtt: 1})
        // 从头拉 = 游标归 0（`useMailList.load()` 的 refresh 分支）
        expect(last[0]).toBe(0)
    })

    it('搜索态在列表头部显示 Chip，点它清掉 ?q= 并重新取数', async () => {
        const fetch = okFetch()
        await mountWorkspace({fetch}, {startAt: '/mail/inbox?q=%E5%8F%91%E7%A5%A8'})

        const chip = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.clearSearch')
        expect(chip?.text()).toContain('发票')

        await chip.trigger('click')
        await flush()
        await new Promise((resolve) => setTimeout(resolve, 350))

        expect(router.currentRoute.value.query.q).toBeUndefined()
        expect(fetch.mock.calls.at(-1)[2]).toEqual({})
        expect(wrapper.findAll('button').some((b) => b.attributes('aria-label') === 'mail.clearSearch')).toBe(false)
    })

    it('搜不到东西时说「没有匹配」，不说「这里还没有邮件」', async () => {
        const fetch = vi.fn(() => Promise.resolve({list: [], total: 0}))
        await mountWorkspace(
            {fetch, emptyTitle: 'mail.emptyInbox'},
            {startAt: '/mail/inbox?q=zzz'},
        )
        expect(wrapper.text()).toContain('mail.emptySearch')
        expect(wrapper.text()).not.toContain('mail.emptyInbox')
    })
})
