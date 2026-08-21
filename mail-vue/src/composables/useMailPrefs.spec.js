/**
 * useMailPrefs 单测。
 *
 * 它是模块级单例，**加载时读一次 localStorage**，所以「读取已有值」这类用例只能靠
 * `vi.resetModules()` + 动态 import 重新加载模块来复现（同 useBgEffect.spec 的做法），
 * 光清 localStorage 是不够的。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'

const KEY = 'um-mail-prefs'

async function load(stored) {
    localStorage.clear()
    if (stored !== undefined) localStorage.setItem(KEY, stored)
    vi.resetModules()
    const mod = await import('@/composables/useMailPrefs.js')
    return {...mod.useMailPrefs(), ROW_HEIGHT: mod.ROW_HEIGHT}
}

beforeEach(() => {
    localStorage.clear()
})

describe('useMailPrefs · 默认值与脏值', () => {

    it('没存过时给默认值', async () => {
        const {prefs} = await load()
        expect(prefs).toMatchObject({
            density: 'cozy', pane: 'right', timeSort: 0, showImages: false, recent: [],
        })
    })

    it('存过的合法值原样恢复', async () => {
        const {prefs} = await load(JSON.stringify({density: 'compact', pane: 'bottom', timeSort: 1}))
        expect(prefs).toMatchObject({density: 'compact', pane: 'bottom', timeSort: 1})
    })

    it('脏值 / 非 JSON / 越界值一律退回默认，不抛错', async () => {
        expect((await load('{{{')).prefs.density).toBe('cozy')
        const {prefs} = await load(JSON.stringify({density: 'huge', pane: 'left', timeSort: 7}))
        expect(prefs).toMatchObject({density: 'cozy', pane: 'right', timeSort: 0})
    })

    it('recent 里的坏项被过滤，最多留 5 个', async () => {
        const {prefs} = await load(JSON.stringify({
            recent: [
                {accountId: 0}, {accountId: -1}, {accountId: 'x'}, null,
                {accountId: 1}, {accountId: 1}, {accountId: 2, email: 'b@c'},
                {accountId: 3}, {accountId: 4}, {accountId: 5}, {accountId: 6},
            ],
        }))
        expect(prefs.recent.map(r => r.accountId)).toEqual([1, 2, 3, 4, 5])
        expect(prefs.recent[1]).toEqual({accountId: 2, email: 'b@c', name: ''})
    })
})

describe('useMailPrefs · 写入', () => {

    it('setDensity 落盘，rowHeight 同步（44 / 56 / 72）', async () => {
        const {prefs, rowHeight, setDensity, ROW_HEIGHT} = await load()
        expect(rowHeight.value).toBe(ROW_HEIGHT.cozy)
        setDensity('roomy')
        expect(prefs.density).toBe('roomy')
        expect(rowHeight.value).toBe(72)
        expect(JSON.parse(localStorage.getItem(KEY)).density).toBe('roomy')
    })

    it('非法值不写、也不改现状', async () => {
        const {prefs, setDensity, setPane} = await load()
        setDensity('huge')
        setPane('left')
        expect(prefs).toMatchObject({density: 'cozy', pane: 'right'})
        expect(localStorage.getItem(KEY)).toBe(null)
    })

    it('timeSort 只认 0/1，字符串 "1" 也算 1', async () => {
        const {prefs, setTimeSort} = await load()
        setTimeSort('1')
        expect(prefs.timeSort).toBe(1)
        setTimeSort('x')
        expect(prefs.timeSort).toBe(0)
    })

    it('showImages 只认真正的 true（默认屏蔽远程图片）', async () => {
        const {prefs, setShowImages} = await load()
        setShowImages('yes')
        expect(prefs.showImages).toBe(false)
        setShowImages(true)
        expect(prefs.showImages).toBe(true)
    })
})

describe('useMailPrefs · 最近使用', () => {

    it('置顶到头部、去重、上限 5', async () => {
        const {prefs, pushRecent} = await load()
        for (const id of [1, 2, 3, 4, 5, 6]) pushRecent({accountId: id, email: `${id}@x`})
        expect(prefs.recent.map(r => r.accountId)).toEqual([6, 5, 4, 3, 2])
        pushRecent({accountId: 3, email: '3@x'})
        expect(prefs.recent.map(r => r.accountId)).toEqual([3, 6, 5, 4, 2])
    })

    it('只存 accountId / email / name 三个字段', async () => {
        const {prefs, pushRecent} = await load()
        pushRecent({accountId: 1, email: 'a@x', name: 'A', sort: 9, isDel: 0})
        expect(prefs.recent[0]).toEqual({accountId: 1, email: 'a@x', name: 'A'})
    })

    it('非法 accountId 直接忽略', async () => {
        const {prefs, pushRecent} = await load()
        pushRecent({accountId: 0})
        pushRecent(null)
        expect(prefs.recent).toEqual([])
    })

    it('dropRecent 摘掉指定项；摘不到时不写盘', async () => {
        const {prefs, pushRecent, dropRecent} = await load()
        pushRecent({accountId: 1})
        pushRecent({accountId: 2})
        localStorage.removeItem(KEY)
        dropRecent(99)
        expect(localStorage.getItem(KEY)).toBe(null)
        dropRecent(1)
        expect(prefs.recent.map(r => r.accountId)).toEqual([2])
        expect(JSON.parse(localStorage.getItem(KEY)).recent).toHaveLength(1)
    })

    it('resetPrefs 清空内存与本地存储', async () => {
        const {prefs, setDensity, pushRecent, resetPrefs} = await load()
        setDensity('compact')
        pushRecent({accountId: 1})
        resetPrefs()
        expect(prefs).toMatchObject({density: 'cozy', recent: []})
        expect(localStorage.getItem(KEY)).toBe(null)
    })
})
