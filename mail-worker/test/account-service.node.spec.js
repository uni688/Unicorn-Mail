/**
 * `account-service` 的服务层用例（真 SQLite）。
 *
 * 两块只能在 SQL 上验的东西：
 *   1. `searchByKeyword` —— 通配符转义（`%` / `_` / `\` 必须是字面量）、
 *      `ESCAPE` 子句、大小写不敏感、前缀命中排在包含命中前、归属与软删的硬条件；
 *   2. `selectByEmailIncludeDel` 的 `COLLATE NOCASE` 精确匹配 —— 投递路径靠它，
 *      少了它 `Alice@` 收不到发给 `alice@` 的信。
 */
import {afterEach, describe, expect, it} from 'vitest'
import accountService from '../src/service/account-service.js'
import {insertAccount, insertUser, setupEnv} from './helpers/env.js'

const USER = 1
const OTHER = 2

let env

/** 一批邮箱，含大小写、含通配符字面量、含软删、含别人的 */
async function seedAccounts() {
    env = await setupEnv()
    const {sqlite} = env
    insertUser(sqlite, {userId: USER})
    insertUser(sqlite, {userId: OTHER})
    const rows = [
        {accountId: 1, email: 'ab@example.com', name: '前缀命中'},
        {accountId: 2, email: 'xab@example.com', name: '包含命中'},
        {accountId: 3, email: 'AB-Upper@example.com', name: '大写前缀'},
        {accountId: 4, email: 'noise@example.com', name: 'ab 在名字里'},
        {accountId: 5, email: 'pct%sign@example.com', name: '百分号'},
        {accountId: 6, email: 'under_score@example.com', name: '下划线'},
        {accountId: 7, email: 'back\\slash@example.com', name: '反斜杠'},
        {accountId: 8, email: 'deleted-ab@example.com', name: '已软删', isDel: 1},
    ]
    for (const row of rows) insertAccount(sqlite, {...row, userId: USER})
    insertAccount(sqlite, {accountId: 9, userId: OTHER, email: 'ab@other.com', name: '别人的'})
    return env
}

afterEach(() => {
    env?.close()
    env = undefined
})

const emails = (list) => list.map(row => row.email)

describe('searchByKeyword', () => {

    it('空关键词直接返回空数组，不打库', async () => {
        const {c} = await seedAccounts()
        expect(await accountService.searchByKeyword(c, {keyword: ''}, USER)).toEqual([])
        expect(await accountService.searchByKeyword(c, {keyword: '   '}, USER)).toEqual([])
        expect(await accountService.searchByKeyword(c, {}, USER)).toEqual([])
    })

    it('前缀命中排在包含命中前面，且结果不重复', async () => {
        const {c} = await seedAccounts()
        const list = await accountService.searchByKeyword(c, {keyword: 'ab'}, USER)
        expect(emails(list).slice(0, 2)).toEqual(['ab@example.com', 'AB-Upper@example.com'])
        expect(emails(list)).toContain('xab@example.com')
        expect(new Set(list.map(row => row.accountId)).size).toBe(list.length)
    })

    it('大小写不敏感（COLLATE NOCASE）', async () => {
        const {c} = await seedAccounts()
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'AB'}, USER)))
            .toEqual(emails(await accountService.searchByKeyword(c, {keyword: 'ab'}, USER)))
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'ab-upper'}, USER)))
            .toEqual(['AB-Upper@example.com'])
    })

    it('备注名也参与匹配（只在包含命中那一路）', async () => {
        const {c} = await seedAccounts()
        expect(emails(await accountService.searchByKeyword(c, {keyword: '包含'}, USER))).toEqual(['xab@example.com'])
    })

    it('不返回别人的邮箱，也不返回软删的', async () => {
        const {c} = await seedAccounts()
        const list = emails(await accountService.searchByKeyword(c, {keyword: 'ab'}, USER))
        expect(list).not.toContain('ab@other.com')
        expect(list).not.toContain('deleted-ab@example.com')
    })
})

describe('searchByKeyword 的通配符转义', () => {

    // 不转义的话，一个 `%` 就是「列出全部邮箱」，`_` 是「匹配任意一个字符」
    it('% 是字面量', async () => {
        const {c} = await seedAccounts()
        expect(emails(await accountService.searchByKeyword(c, {keyword: '%'}, USER))).toEqual(['pct%sign@example.com'])
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'pct%'}, USER))).toEqual(['pct%sign@example.com'])
    })

    it('_ 是字面量', async () => {
        const {c} = await seedAccounts()
        expect(emails(await accountService.searchByKeyword(c, {keyword: '_'}, USER))).toEqual(['under_score@example.com'])
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'under_'}, USER))).toEqual(['under_score@example.com'])
        expect(await accountService.searchByKeyword(c, {keyword: 'underX'}, USER)).toEqual([])
    })

    it('反斜杠自身也被转义（否则 ESCAPE 会把后一个字符吃掉）', async () => {
        const {c} = await seedAccounts()
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'back\\'}, USER))).toEqual(['back\\slash@example.com'])
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'back\\slash'}, USER))).toEqual(['back\\slash@example.com'])
    })

    it('超长关键词截到 64 字符后继续匹配，不报错', async () => {
        const {c, sqlite} = await seedAccounts()
        const long = 'a'.repeat(64)
        insertAccount(sqlite, {accountId: 20, userId: USER, email: `${long}@example.com`, name: '超长'})
        expect(emails(await accountService.searchByKeyword(c, {keyword: 'a'.repeat(70)}, USER)))
            .toEqual([`${long}@example.com`])
    })

    it('size 双边收口，上限 20', async () => {
        const {c, sqlite} = await seedAccounts()
        for (let i = 30; i < 60; i++) {
            insertAccount(sqlite, {accountId: i, userId: USER, email: `ab${i}@example.com`, name: '批量'})
        }
        expect(await accountService.searchByKeyword(c, {keyword: 'ab', size: 1}, USER)).toHaveLength(1)
        expect(await accountService.searchByKeyword(c, {keyword: 'ab', size: -1}, USER)).toHaveLength(20)
        expect(await accountService.searchByKeyword(c, {keyword: 'ab', size: 999}, USER)).toHaveLength(20)
    })
})

describe('selectByEmailIncludeDel 的 COLLATE NOCASE 精确匹配', () => {

    it('大小写不同也能命中（投递路径靠它）', async () => {
        const {c} = await seedAccounts()
        expect((await accountService.selectByEmailIncludeDel(c, 'ab@EXAMPLE.com')).accountId).toBe(1)
        expect((await accountService.selectByEmailIncludeDel(c, 'ab-upper@example.com')).accountId).toBe(3)
    })

    it('软删的邮箱同样返回（占位不许被重复注册）', async () => {
        const {c} = await seedAccounts()
        expect((await accountService.selectByEmailIncludeDel(c, 'DELETED-AB@example.com')).accountId).toBe(8)
    })

    it('仍然是精确匹配，不做模糊', async () => {
        const {c} = await seedAccounts()
        expect(await accountService.selectByEmailIncludeDel(c, 'ab@example.co')).toBeUndefined()
        expect(await accountService.selectByEmailIncludeDel(c, '%@example.com')).toBeUndefined()
    })
})
