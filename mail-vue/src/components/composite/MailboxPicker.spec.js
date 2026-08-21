/**
 * MailboxPicker 单测（§7.2 / §10.4 验收）。
 *
 * 最重要的一条是**节点预算**：200 个邮箱时选项节点必须远少于 200（验收线 ≤16）。
 * jsdom 没有布局，虚拟化库量到的容器高度是 0，所以这里的数字不能当成浏览器里的真值 ——
 * 它能证明的是「渲染量与数据量脱钩」，真正的 ≤16 与 INP < 200ms 在浏览器验收里量（§10.6）。
 *
 * 另外三条是结构约束：分组标签不是选项（键盘要跳过）、搜索框必须常挂（否则 reka 的
 * `virtualKeydownHook` 会走到 NaN 崩溃路径）、不可切换时整行退化成非按钮。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

const push = vi.fn()
const route = {name: 'email', meta: {mail: true}, path: '/mail/inbox', query: {}}

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${params.n}` : key), locale: ref('zh')}),
}))

vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal()),
    useRoute: () => route,
    useRouter: () => ({push}),
}))

const boxes = (n, from = 1) => Array.from({length: n}, (_, i) => ({
    accountId: from + i,
    sort: 1000 - i,
    email: `box${from + i}@uni.dev`,
    name: `盒子${from + i}`,
}))

const accountList = vi.fn(() => Promise.resolve(boxes(30)))
const accountSearch = vi.fn(() => Promise.resolve(boxes(2, 500)))

vi.mock('@/request/account.js', () => ({
    accountList: (...args) => accountList(...args),
    accountSearch: (...args) => accountSearch(...args),
}))

vi.mock('@/request/email.js', () => ({
    emailCounts: () => Promise.resolve({unreadMap: {}}),
}))

const MailboxPicker = (await import('./MailboxPicker.vue')).default
const {useMailboxes} = await import('@/composables/useMailboxes.js')
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')
const {useAccountStore} = await import('@/store/account.js')

let wrapper

/**
 * jsdom 里 `offsetHeight` 恒为 0，而 tanstack 的 `observeElementRect` 正是用
 * `offsetWidth/offsetHeight` 量滚动容器（`getRect`，virtual-core:14）—— 量到 0 就等于
 * 「窗口里一行都放不下」，于是一个选项都不渲染，节点预算的断言会变成空断言。
 * 这里把原型上的 `offsetHeight` 临时改成 288（= `VIEWPORT_MAX`），只为让算法跑起来，
 * 不代表真实布局；真正的 ≤16 与 INP 在浏览器验收里量。
 */
const rectDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            return 288
        },
    })
})

afterEach(() => {
    if (rectDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', rectDescriptor)
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
})

beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    push.mockClear()
    accountList.mockClear()
    accountSearch.mockClear()
    useMailboxes().resetMailboxes()
    useMailPrefs().resetPrefs()
})

/** 打开面板并等两拍：一拍给 watch(open)，一拍给分页请求回填 */
async function openPicker(props = {}) {
    wrapper = mount(MailboxPicker, {props, attachTo: document.body})
    await wrapper.find('button').trigger('click')
    await nextTick()
    await Promise.resolve()
    await nextTick()
    return wrapper
}

const options = () => document.querySelectorAll('[role="option"]')

describe('MailboxPicker · 触发器', () => {

    it('未选具体邮箱时显示「全部邮箱」', () => {
        wrapper = mount(MailboxPicker)
        expect(wrapper.find('button').text()).toContain('mail.allMailboxes')
    })

    it('选了邮箱后显示该地址', async () => {
        const store = useAccountStore()
        store.currentAccountId = 3
        store.currentAccount = {accountId: 3, email: 'box3@uni.dev'}
        wrapper = mount(MailboxPicker)
        await openPicker()
        expect(wrapper.find('button').attributes('aria-label')).toContain('shell.switchMailbox')
    })

    it('disabled 时不渲染按钮，只留一行身份显示', () => {
        wrapper = mount(MailboxPicker, {props: {disabled: true}})
        expect(wrapper.find('button').exists()).toBe(false)
        expect(wrapper.text()).toBeDefined()
    })
})

describe('MailboxPicker · 面板结构', () => {

    it('打开就拉第一页，并且搜索框常挂（reka 的键盘导航依赖它）', async () => {
        await openPicker()
        expect(accountList).toHaveBeenCalledTimes(1)
        const input = document.querySelector('input[role="combobox"], input')
        expect(input).not.toBeNull()
        expect(input.getAttribute('aria-label')).toBe('mail.searchMailbox')
    })

    it('分组标签是 presentation，不是选项（方向键要跳过）', async () => {
        const store = useAccountStore()
        store.currentAccountId = 1
        useMailPrefs().pushRecent({accountId: 2, email: 'box2@uni.dev', name: '盒子2'})
        await openPicker()

        const labels = document.querySelectorAll('[role="presentation"]')
        expect(labels.length).toBeGreaterThan(0)
        for (const el of labels) expect(el.getAttribute('role')).not.toBe('option')
    })

    it('200 个邮箱时渲染的选项数与数据量脱钩（验收线 ≤16，浏览器里量准数）', async () => {
        accountList.mockImplementation(() => Promise.resolve(boxes(200)))
        await openPicker()
        expect(useMailboxes().mailboxes).toHaveLength(200)
        const n = options().length
        expect(n).toBeGreaterThan(0)
        expect(n).toBeLessThanOrEqual(16)
    })

    it('输入触发服务端搜索（防抖后），结果替换列表', async () => {
        vi.useFakeTimers()
        wrapper = mount(MailboxPicker, {attachTo: document.body})
        await wrapper.find('button').trigger('click')
        const input = document.querySelector('input')
        input.value = 'box5'
        input.dispatchEvent(new Event('input'))
        await nextTick()
        vi.advanceTimersByTime(150)
        vi.useRealTimers()
        await Promise.resolve()
        expect(accountSearch).toHaveBeenCalledWith('box5', 20, expect.anything())
    })
})

describe('MailboxPicker · 选中', () => {

    it('点选项写 store、关面板、抛 select；已在邮件视图里不再跳路由', async () => {
        await openPicker()
        // 第 0 项是「全部邮箱」聚合项，第 1 项起是真邮箱
        const box = document.querySelectorAll('[role="option"]')[1]
        box.dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await nextTick()
        await nextTick()

        const store = useAccountStore()
        expect(store.currentAccountId).toBe(1)
        expect(store.currentAccount.email).toBe('box1@uni.dev')
        expect(wrapper.emitted('select')).toHaveLength(1)
        expect(push).not.toHaveBeenCalled()
        // 面板关没关看 aria-expanded：jsdom 里退场动画不会结束，reka 的 Presence
        // 会把节点留在 DOM 上，所以「节点还在」不能当成「没关」
        expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
    })

    it('不在邮件视图时选邮箱会把人带回收件箱', async () => {
        route.meta = {}
        await openPicker()
        document.querySelectorAll('[role="option"]')[0]
            .dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await nextTick()
        expect(push).toHaveBeenCalledWith({name: 'email'})
        route.meta = {mail: true}
    })

    it('选中项带勾（当前是「全部邮箱」时勾在第一项）', async () => {
        await openPicker()
        const first = document.querySelectorAll('[role="option"]')[0]
        expect(first.querySelectorAll('svg')).toHaveLength(2)
    })
})
