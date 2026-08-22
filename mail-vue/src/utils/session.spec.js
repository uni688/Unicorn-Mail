/**
 * 会话清理单测（审计 P2-5）。
 *
 * 测的是「换人登录时上一个账号什么都不留下」：退出登录不刷新页面，
 * 而邮箱列表 / 角标 / 偏好都是**模块级单例**，不显式清就会活到下一个账号。
 *
 * `endSession()` 还有一条时序要求：先离开当前页、再清状态。反过来的话，
 * 还挂在屏幕上的 `MailList` 会看见 `currentAccountId` 归 0 并重新取一次列表，
 * 那一次请求已经没有 token，用户在跳转前先吃到一条 401 报错。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

/** 跳转时的现场快照，用来断言「replace 的时候状态还没清」 */
let snapshot = null
const replace = vi.fn((to) => {
    snapshot = {
        to,
        token: localStorage.getItem('token'),
        accountId: useAccountStore().currentAccountId,
    }
    return Promise.resolve()
})

vi.mock('@/router', () => ({default: {replace: (to) => replace(to)}}))
vi.mock('@/request/email.js', () => ({emailCounts: () => new Promise(() => {})}))
vi.mock('@/request/account.js', () => ({
    accountList: () => new Promise(() => {}),
    accountSearch: () => new Promise(() => {}),
}))

const {clearSession, endSession} = await import('@/utils/session.js')
const {useAccountStore} = await import('@/store/account.js')
const {useUserStore} = await import('@/store/user.js')
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')
const {useCounts} = await import('@/composables/useCounts.js')
const {useMailboxes} = await import('@/composables/useMailboxes.js')
const {useSettingStore} = await import('@/store/setting.js')

/** 造出「有人登录着、用过一阵」的现场 */
function signedIn() {
    localStorage.setItem('token', 'tok-a')

    const accountStore = useAccountStore()
    accountStore.currentAccountId = 7
    accountStore.currentAccount = {accountId: 7, email: 'a@uni.com'}

    useUserStore().user = {userId: 1, email: 'a@uni.com', permKeys: ['*']}

    const counts = useCounts()
    counts.counts.unread = 12

    const {prefs, setShowImages, pushRecent} = useMailPrefs()
    setShowImages(true)
    pushRecent({accountId: 7, email: 'a@uni.com', name: 'A'})

    return {accountStore, counts, prefs}
}

beforeEach(() => {
    replace.mockClear()
    snapshot = null
    localStorage.clear()
    setActivePinia(createPinia())
    useMailPrefs().resetPrefs()
    useCounts().resetCounts()
    useMailboxes().resetMailboxes()
})

describe('clearSession', () => {

    it('token、账号私有 store、角标、偏好一起清掉', () => {
        const {accountStore, counts, prefs} = signedIn()

        clearSession()

        expect(localStorage.getItem('token')).toBeNull()
        expect(accountStore.currentAccountId).toBe(0)
        expect(accountStore.currentAccount).toEqual({})
        expect(useUserStore().user).toEqual({})
        expect(counts.counts.unread).toBeNull()
        // showImages 是逐人做的隐私选择，recent 里是上一个账号的邮箱地址：都不能继承
        expect(prefs.showImages).toBe(false)
        expect(prefs.recent).toEqual([])
    })

    it('邮箱列表（模块单例）也清空', async () => {
        const mb = useMailboxes()
        mb.mailboxes.push({accountId: 7, email: 'a@uni.com'})

        clearSession()

        expect(mb.mailboxes).toEqual([])
        expect(mb.keyword.value).toBe('')
    })

    it('keepToken 时不动 token（token 已被调用方删过）', () => {
        localStorage.setItem('token', 'tok-a')
        clearSession({keepToken: true})
        expect(localStorage.getItem('token')).toBe('tok-a')
    })

    it('设备偏好（语言 / 站点配置）留着 —— 登录页还要用', () => {
        const setting = useSettingStore()
        setting.lang = 'en'
        clearSession()
        expect(useSettingStore().lang).toBe('en')
    })
})

describe('endSession', () => {

    it('先删 token → 再跳 /login → 最后才清状态', async () => {
        const {accountStore} = signedIn()

        await endSession()

        expect(replace).toHaveBeenCalledTimes(1)
        expect(snapshot.to).toBe('/login')
        // 跳转那一刻：token 已经没了（后续请求不再带它），但状态还在（不触发列表重取）
        expect(snapshot.token).toBeNull()
        expect(snapshot.accountId).toBe(7)
        // 跳完才清
        expect(accountStore.currentAccountId).toBe(0)
    })

    it('跳转失败（守卫抛错）也要把状态清掉', async () => {
        signedIn()
        replace.mockImplementationOnce(() => Promise.reject(new Error('guard')))

        await endSession()

        expect(useAccountStore().currentAccountId).toBe(0)
        expect(localStorage.getItem('token')).toBeNull()
    })
})
