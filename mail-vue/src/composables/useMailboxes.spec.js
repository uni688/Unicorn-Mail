/**
 * useMailboxes 单测（§7.2 + §10.5 增量 6）。
 *
 * 三个必须钉住的行为：
 *   - 游标分页用 `(sort, accountId)`，第二页必须带上一页最后一行的值（用 offset 会漏项）；
 *   - 搜索防抖 + 竞态：慢请求在快请求之后 resolve 时不能把旧结果画上去；
 *   - `select()` 的副作用和命令面板一字不差（`useCommandPalette.js:355`）。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const listCalls = []
const searchCalls = []

function deferred(bucket, params) {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    bucket.push({...params, resolve, reject})
    return promise
}

vi.mock('@/request/account.js', () => ({
    accountList: (accountId, size, lastSort) => deferred(listCalls, {accountId, size, lastSort}),
    accountSearch: (keyword, size, signal) => deferred(searchCalls, {keyword, size, signal}),
}))

const {useMailboxes, ALL_MAILBOXES} = await import('@/composables/useMailboxes.js')
const {useAccountStore} = await import('@/store/account.js')
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')

const box = (accountId, sort = 0, extra = {}) => ({
    accountId, sort, email: `a${accountId}@x.dev`, name: `盒子${accountId}`, ...extra,
})

const page = (from, count, sort = 5) =>
    Array.from({length: count}, (_, i) => box(from + i, sort - i))

let mb
let accountStore

beforeEach(() => {
    listCalls.length = 0
    searchCalls.length = 0
    localStorage.clear()
    setActivePinia(createPinia())
    accountStore = useAccountStore()
    mb = useMailboxes()
    mb.resetMailboxes()
    useMailPrefs().resetPrefs()
})

describe('useMailboxes · 分页', () => {

    it('首屏只拉第一页（30 条），不满一页就没有更多', async () => {
        const p = mb.ensureFirstPage()
        expect(listCalls).toHaveLength(1)
        expect(listCalls[0]).toMatchObject({accountId: 0, size: 30, lastSort: undefined})
        listCalls[0].resolve(page(1, 3))
        await p
        expect(mb.mailboxes).toHaveLength(3)
        expect(mb.hasMore.value).toBe(false)
        expect(mb.loading.value).toBe(false)
    })

    it('第二页带上一页最后一行的 (sort, accountId) 作游标', async () => {
        const first = mb.ensureFirstPage()
        listCalls[0].resolve(page(1, 30, 100))
        await first
        expect(mb.hasMore.value).toBe(true)

        const more = mb.loadMore()
        expect(listCalls[1]).toMatchObject({accountId: 30, size: 30, lastSort: 71})
        listCalls[1].resolve(page(31, 2, 70))
        await more
        expect(mb.mailboxes).toHaveLength(32)
        expect(mb.hasMore.value).toBe(false)
    })

    it('缓存 60 秒内不重复拉；force 与 invalidate 能穿透', async () => {
        const p = mb.ensureFirstPage()
        listCalls[0].resolve(page(1, 3))
        await p
        await mb.ensureFirstPage()
        expect(listCalls).toHaveLength(1)

        const forced = mb.ensureFirstPage({force: true})
        expect(listCalls).toHaveLength(2)
        listCalls[1].resolve(page(1, 3))
        await forced

        await mb.invalidate()
        const after = mb.ensureFirstPage()
        expect(listCalls).toHaveLength(3)
        listCalls[2].resolve(page(1, 3))
        await after
    })

    it('并发打开只发一个请求；失败留住 error 且不清空已有列表', async () => {
        const a = mb.ensureFirstPage()
        const b = mb.ensureFirstPage()
        expect(listCalls).toHaveLength(1)
        listCalls[0].reject(new Error('boom'))
        await Promise.all([a, b])
        expect(mb.error.value).toBeInstanceOf(Error)
        expect(mb.mailboxes).toEqual([])
        expect(mb.loading.value).toBe(false)
    })
})

describe('useMailboxes · 搜索', () => {

    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('防抖 120ms 内只发最后一次；空关键词直接清结果不发请求', async () => {
        mb.search('a')
        mb.search('ab')
        mb.search('abc')
        expect(searchCalls).toHaveLength(0)
        vi.advanceTimersByTime(120)
        expect(searchCalls).toHaveLength(1)
        expect(searchCalls[0]).toMatchObject({keyword: 'abc', size: 20})

        vi.useRealTimers()
        searchCalls[0].resolve([box(9)])

        await mb.search('   ')
        expect(mb.results).toEqual([])
        expect(searchCalls).toHaveLength(1)
        expect(mb.searching.value).toBe(false)
    })

    it('慢请求晚回也不覆盖新结果（abort 不是同步生效的）', async () => {
        mb.search('slow')
        vi.advanceTimersByTime(120)
        const slow = searchCalls[0]

        mb.search('fast')
        vi.advanceTimersByTime(120)
        const fast = searchCalls[1]

        vi.useRealTimers()
        fast.resolve([box(2)])
        await Promise.resolve()
        slow.resolve([box(1)])
        await Promise.resolve()

        expect(mb.results.map(r => r.accountId)).toEqual([2])
    })

    it('搜索请求带 signal，取消后静默清空（不弹提示）', async () => {
        mb.search('x')
        vi.advanceTimersByTime(120)
        expect(searchCalls[0].signal).toBeDefined()
        vi.useRealTimers()
        searchCalls[0].reject(new Error('canceled'))
        await Promise.resolve()
        expect(mb.results).toEqual([])
    })
})

describe('useMailboxes · select / recent / remove', () => {

    it('select 的副作用与命令面板一致：写 currentAccountId + currentAccount', () => {
        const target = box(7, 3)
        mb.select(target)
        expect(accountStore.currentAccountId).toBe(7)
        expect(accountStore.currentAccount).toStrictEqual(target)
    })

    /**
     * 「全部邮箱」写的是 `{...ALL_MAILBOXES}` 而不是 `{}`（审计 P0-1）：
     * `views/*` 是从 `currentAccount.allReceive` 取参数发给 `/email/list` 的，
     * 空对象让这个参数变成 undefined，后端会去查一个不存在的 account 行并 500。
     */
    it('「全部邮箱」把 accountId 归 0、currentAccount 是带 allReceive 的聚合项，也不进最近', () => {
        mb.select(box(7))
        mb.select(ALL_MAILBOXES)
        expect(accountStore.currentAccountId).toBe(0)
        expect(accountStore.currentAccount).toEqual({...ALL_MAILBOXES})
        expect(accountStore.currentAccount.allReceive).toBe(1)
        // 同一个对象被两处引用会互相写坏，所以必须是副本
        expect(accountStore.currentAccount).not.toBe(ALL_MAILBOXES)
        expect(useMailPrefs().prefs.recent.map(r => r.accountId)).toEqual([7])
    })

    it('最近区：按 prefs 顺序，排除当前邮箱，字段取实时行（改过名不显示旧名）', async () => {
        const p = mb.ensureFirstPage()
        listCalls[0].resolve([box(1, 5, {name: '新名字'}), box(2, 4)])
        await p

        mb.select(box(1, 5, {name: '旧名字'}))
        mb.select(box(2, 4))
        // 当前是 2，最近里只剩 1，且名字取列表里的实时值
        expect(mb.recent.value.map(r => r.accountId)).toEqual([1])
        expect(mb.recent.value[0].name).toBe('新名字')
    })

    it('remove：列表、最近、当前选中三处都摘掉，当前邮箱被删则回落到全部邮箱', async () => {
        const p = mb.ensureFirstPage()
        listCalls[0].resolve([box(1), box(2)])
        await p

        mb.select(box(1))
        mb.select(box(2))
        mb.remove(2)

        expect(mb.mailboxes.map(r => r.accountId)).toEqual([1])
        expect(useMailPrefs().prefs.recent.map(r => r.accountId)).toEqual([1])
        expect(accountStore.currentAccountId).toBe(0)
    })
})
