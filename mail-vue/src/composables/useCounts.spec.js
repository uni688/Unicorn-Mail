/**
 * useCounts 单测（§10.5 增量 1）。
 *
 * 这个 composable 的价值全在「不显示错的数字」上，所以测的都是时序：切邮箱后旧请求的
 * 结果必须作废、同 scope 的并发请求要合并、debounce 要把一串刷新并成一次。
 *
 * `emailCounts` 被 mock 成受控 promise —— 真实网络时序在单测里没法复现。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const calls = []

vi.mock('@/request/email.js', () => ({
    emailCounts: (params) => {
        let resolve
        let reject
        const promise = new Promise((res, rej) => {
            resolve = res
            reject = rej
        })
        calls.push({params, resolve, reject})
        return promise
    },
}))

const {useCounts} = await import('@/composables/useCounts.js')
const {useAccountStore} = await import('@/store/account.js')

let counts
let accountStore

beforeEach(() => {
    calls.length = 0
    setActivePinia(createPinia())
    accountStore = useAccountStore()
    counts = useCounts()
    counts.resetCounts()
})

const DATA = {inbox: 12, unread: 3, star: 1, code: 2, trash: 4, sent: 5}

describe('useCounts · 取数与作用域', () => {

    it('accountId > 0 时传 accountId，否则传 all=1', async () => {
        accountStore.currentAccountId = 7
        counts.refresh({force: true})
        expect(calls.at(-1).params).toEqual({accountId: 7})

        accountStore.currentAccountId = 0
        counts.refresh({force: true})
        expect(calls.at(-1).params).toEqual({all: 1})
    })

    it('回来的数字全部转成 number，缺的字段按 0', async () => {
        accountStore.currentAccountId = 1
        const p = counts.refresh({force: true})
        calls.at(-1).resolve({inbox: '12', unread: 3})
        await p
        expect(counts.counts.inbox).toBe(12)
        expect(counts.counts.trash).toBe(0)
        expect(counts.loading.value).toBe(false)
    })

    it('同一 scope 并发只发一个请求', async () => {
        accountStore.currentAccountId = 1
        const a = counts.refresh({force: true})
        const b = counts.refresh({force: true})
        expect(calls).toHaveLength(1)
        calls[0].resolve(DATA)
        await Promise.all([a, b])
        expect(counts.counts.unread).toBe(3)
    })
})

describe('useCounts · 时序', () => {

    it('切邮箱先把角标清成 null（停在旧值比没角标更容易误判）', async () => {
        accountStore.currentAccountId = 1
        const p = counts.refresh({force: true})
        calls.at(-1).resolve(DATA)
        await p
        expect(counts.counts.inbox).toBe(12)

        accountStore.currentAccountId = 2
        counts.refresh({force: true})
        expect(counts.counts.inbox).toBe(null)
    })

    it('切邮箱后旧请求的结果作废', async () => {
        accountStore.currentAccountId = 1
        const first = counts.refresh({force: true})
        const stale = calls.at(-1)

        accountStore.currentAccountId = 2
        const second = counts.refresh({force: true})

        stale.resolve({inbox: 999})
        await first
        expect(counts.counts.inbox).toBe(null)

        calls.at(-1).resolve({inbox: 5})
        await second
        expect(counts.counts.inbox).toBe(5)
    })

    it('请求失败时留住 error，不把角标写成 0', async () => {
        accountStore.currentAccountId = 1
        const p = counts.refresh({force: true})
        calls.at(-1).reject(new Error('boom'))
        await p
        expect(counts.error.value).toBeInstanceOf(Error)
        expect(counts.counts.inbox).toBe(null)
        expect(counts.loading.value).toBe(false)
    })
})

describe('useCounts · debounce 与批量未读', () => {

    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('短时间内的多次 refresh 合并成一次请求', async () => {
        accountStore.currentAccountId = 1
        counts.refresh()
        counts.refresh()
        counts.refresh()
        expect(calls).toHaveLength(0)
        vi.advanceTimersByTime(250)
        expect(calls).toHaveLength(1)
        vi.useRealTimers()
        calls[0].resolve(DATA)
    })

    it('force 不等 debounce，立刻发', () => {
        accountStore.currentAccountId = 1
        counts.refresh()
        counts.refresh({force: true})
        expect(calls).toHaveLength(1)
        vi.advanceTimersByTime(250)
        // debounce 的那一发被 force 取消，不会补发第二个请求
        expect(calls).toHaveLength(1)
        vi.useRealTimers()
    })
})

describe('useCounts · refreshUnread / resetCounts', () => {

    it('最多 5 个 id，非法 id 先过滤；一个都不剩时不发请求', async () => {
        await counts.refreshUnread([0, -1, 'x', null])
        expect(calls).toHaveLength(0)

        counts.refreshUnread([1, 2, 3, 4, 5, 6, 7])
        expect(calls.at(-1).params).toEqual({accountIds: '1,2,3,4,5'})
        calls.at(-1).resolve({unreadMap: {1: 2}})
    })

    it('unreadMap 合并进单例；失败时静默（角标没有比角标错好）', async () => {
        const ok = counts.refreshUnread([1])
        calls.at(-1).resolve({unreadMap: {1: 9}})
        await ok
        expect(counts.unreadMap[1]).toBe(9)

        const bad = counts.refreshUnread([2])
        calls.at(-1).reject(new Error('boom'))
        await expect(bad).resolves.toBeDefined()
        expect(counts.unreadMap[1]).toBe(9)
    })

    it('resetCounts 清空一切（退出登录用）', async () => {
        accountStore.currentAccountId = 1
        const p = counts.refresh({force: true})
        calls.at(-1).resolve(DATA)
        await p
        const un = counts.refreshUnread([1])
        calls.at(-1).resolve({unreadMap: {1: 3}})
        await un

        counts.resetCounts()
        expect(counts.counts.inbox).toBe(null)
        expect(counts.unreadMap).toEqual({})
        expect(counts.error.value).toBe(null)
    })
})
