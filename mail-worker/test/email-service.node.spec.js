/**
 * `email-service` 的服务层用例，跑在真 SQLite 上（见 `helpers/d1-sqlite.js`）。
 *
 * 挑的都是**只有 SQL 才能验**的行为，mock 掉 orm 就等于什么都没测：
 *   - 负数 / NaN 的 size 会不会真的退化成「无限制」（审计 P1-1）
 *   - `account.isDel` 的 leftJoin 会不会把软删邮箱的邮件漏出来
 *   - `del_time` 的盖章 / 清零（回收站 30 天清理的计时列，审计 P1-4）
 *   - `purge` 的 `all=1` 显式意图（审计 P1-2，唯一不可逆的入口）
 *   - `datetime('now', ?)` 的相对时间窗口
 *
 * 每个 it 自己建一份内存库（`setupEnv` 跑真的迁移链），互不串台。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import emailService from '../src/service/email-service.js'
import BizError from '../src/error/biz-error.js'
import {countRows, insertAccount, insertAtt, insertEmail, insertStar, insertUser, selectRow, setupEnv} from './helpers/env.js'

const RECEIVE = 0
const SEND = 1
const USER = 1

let env

/** 默认场景：一个用户、两个邮箱（1 号 allReceive 开、2 号关），收件 3 封 */
async function seed({allReceive1 = 1, allReceive2 = 0, account2Del = 0} = {}) {
    env = await setupEnv()
    const {sqlite} = env
    insertUser(sqlite, {userId: USER})
    insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: allReceive1})
    insertAccount(sqlite, {accountId: 2, userId: USER, email: 'a2@example.com', allReceive: allReceive2, isDel: account2Del})
    insertEmail(sqlite, {emailId: 1, userId: USER, accountId: 1, type: RECEIVE})
    insertEmail(sqlite, {emailId: 2, userId: USER, accountId: 2, type: RECEIVE})
    insertEmail(sqlite, {emailId: 3, userId: USER, accountId: 1, type: RECEIVE})
    return env
}

afterEach(() => {
    env?.close()
    env = undefined
    vi.restoreAllMocks()
})

describe('resolveAllReceive（经由 list 的入参）', () => {

    it('accountId=0 走聚合，不会退化成 account_id = 0 的空查询', async () => {
        const {c} = await seed()
        const {list, total} = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        expect(total).toBe(3)
        expect(list.map(item => item.emailId)).toEqual([3, 2, 1])
    })

    it('accountId 有值且该邮箱 allReceive=0 时只看这一个邮箱', async () => {
        const {c} = await seed()
        const {list, total} = await emailService.list(c, {accountId: 2, type: RECEIVE}, USER)
        expect(total).toBe(1)
        expect(list.map(item => item.emailId)).toEqual([2])
    })

    it('accountId 有值且 allReceive=1 时聚合全部邮箱', async () => {
        const {c} = await seed()
        const {total} = await emailService.list(c, {accountId: 1, type: RECEIVE}, USER)
        expect(total).toBe(3)
    })

    it('不存在的 accountId 报 BizError，而不是 500 或静默空列表', async () => {
        const {c} = await seed()
        await expect(emailService.list(c, {accountId: 999, type: RECEIVE}, USER)).rejects.toThrow(BizError)
    })

    it('显式 allReceive 优先于邮箱自身的设置', async () => {
        const {c} = await seed()
        const scoped = await emailService.list(c, {accountId: 1, type: RECEIVE, allReceive: 0}, USER)
        expect(scoped.list.map(item => item.emailId)).toEqual([3, 1])
        const aggregated = await emailService.list(c, {accountId: 2, type: RECEIVE, allReceive: 1}, USER)
        expect(aggregated.total).toBe(3)
    })
})

describe('list 的分页收口（审计 P1-1）', () => {

    /** 造 60 封，够跨过默认上限 50 */
    async function seedMany() {
        env = await setupEnv()
        const {sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
        for (let i = 1; i <= 60; i++) insertEmail(sqlite, {emailId: i, userId: USER, accountId: 1, type: RECEIVE})
        return env
    }

    // SQLite 把负 LIMIT 当无限制 —— 这一条不过就是「一个请求拉走整张表」
    it.each([
        ['size=-1', -1],
        ['size=0', 0],
        ['size=NaN', 'abc'],
        ['size 缺省', undefined],
        ['size 超上限', 9999],
    ])('%s 都只返回 50 条', async (_label, size) => {
        const {c} = await seedMany()
        const {list, total} = await emailService.list(c, {accountId: 0, type: RECEIVE, size}, USER)
        expect(list).toHaveLength(50)
        expect(total).toBe(60)
    })

    it('合法 size 原样生效，游标翻页按 emailId 递减', async () => {
        const {c} = await seedMany()
        const first = await emailService.list(c, {accountId: 0, type: RECEIVE, size: 10}, USER)
        expect(first.list.map(item => item.emailId)).toEqual([60, 59, 58, 57, 56, 55, 54, 53, 52, 51])
        const second = await emailService.list(c, {accountId: 0, type: RECEIVE, size: 10, emailId: 51}, USER)
        expect(second.list.map(item => item.emailId)).toEqual([50, 49, 48, 47, 46, 45, 44, 43, 42, 41])
    })

    it('timeSort=1 时反向取新邮件（latest 轮询用的那条路径）', async () => {
        const {c} = await seedMany()
        const {list} = await emailService.list(c, {accountId: 0, type: RECEIVE, size: 3, timeSort: 1, emailId: 57}, USER)
        expect(list.map(item => item.emailId)).toEqual([58, 59, 60])
    })
})

describe('list 的可见性边界', () => {

    it('软删邮箱的邮件不出现在聚合列表里（leftJoin account.is_del）', async () => {
        const {c} = await seed({account2Del: 1})
        const {list, total} = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        expect(list.map(item => item.emailId)).toEqual([3, 1])
        expect(total).toBe(2)
    })

    it('账号行已不存在的孤立邮件同样不出现（leftJoin 后 is_del 为 NULL）', async () => {
        const {c, sqlite} = await seed()
        insertEmail(sqlite, {emailId: 9, userId: USER, accountId: 77, type: RECEIVE})
        const {list} = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        expect(list.map(item => item.emailId)).not.toContain(9)
    })

    it('别人的邮件、软删的邮件、另一种 type 都不会串进来', async () => {
        const {c, sqlite} = await seed()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 3, userId: 2, email: 'b@example.com', allReceive: 1})
        insertEmail(sqlite, {emailId: 11, userId: 2, accountId: 3, type: RECEIVE})
        insertEmail(sqlite, {emailId: 12, userId: USER, accountId: 1, type: RECEIVE, isDel: 1})
        insertEmail(sqlite, {emailId: 13, userId: USER, accountId: 1, type: SEND})
        const {list, total} = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        expect(list.map(item => item.emailId)).toEqual([3, 2, 1])
        expect(total).toBe(3)
    })

    it('带出 isStar 与 attList', async () => {
        const {c, sqlite} = await seed()
        insertStar(sqlite, {userId: USER, emailId: 3})
        insertAtt(sqlite, {attId: 1, userId: USER, emailId: 3, accountId: 1, key: 'k1'})
        const {list} = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        const [third, second] = list
        expect(third.emailId).toBe(3)
        expect(third.isStar).toBe(1)
        expect(third.attList.map(item => item.key)).toEqual(['k1'])
        expect(second.isStar).toBe(0)
        expect(second.attList).toEqual([])
    })
})

describe('delete / restore 与 del_time 计时列（审计 P1-4）', () => {

    it('删除是软删，并且当场盖上 del_time', async () => {
        const {c, sqlite} = await seed()
        await emailService.delete(c, {emailIds: [1, 3]}, USER)
        expect(countRows(sqlite, 'email', 'is_del = 1')).toBe(2)
        expect(selectRow(sqlite, 'email', 'email_id = 1').del_time).toBeTruthy()
        expect(selectRow(sqlite, 'email', 'email_id = 3').del_time).toBeTruthy()
        expect(selectRow(sqlite, 'email', 'email_id = 2').del_time).toBe(null)
    })

    it('只能删自己的邮件', async () => {
        const {c, sqlite} = await seed()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 3, userId: 2, email: 'b@example.com'})
        insertEmail(sqlite, {emailId: 11, userId: 2, accountId: 3, type: RECEIVE})
        await emailService.delete(c, {emailIds: [11]}, USER)
        expect(selectRow(sqlite, 'email', 'email_id = 11').is_del).toBe(0)
        expect(selectRow(sqlite, 'email', 'email_id = 11').del_time).toBe(null)
    })

    // 不清 del_time 的话，这封邮件下次被删就带着上一次的日期 —— 当晚即被物理删除
    it('还原会把 del_time 清回 NULL', async () => {
        const {c, sqlite} = await seed()
        await emailService.delete(c, {emailIds: [1]}, USER)
        await emailService.restore(c, {emailIds: [1]}, USER)
        const row = selectRow(sqlite, 'email', 'email_id = 1')
        expect(row.is_del).toBe(0)
        expect(row.del_time).toBe(null)
    })

    it('还原只作用于回收站里的行，不会把正常邮件的 is_del 写花', async () => {
        const {c, sqlite} = await seed()
        await emailService.restore(c, {emailIds: [2]}, USER)
        expect(selectRow(sqlite, 'email', 'email_id = 2').is_del).toBe(0)
        expect(countRows(sqlite, 'email', 'is_del = 1')).toBe(0)
    })

    it('整户还原（restoreByUserId）同样清空计时列', async () => {
        const {c, sqlite} = await seed()
        await emailService.delete(c, {emailIds: [1, 2, 3]}, USER)
        await emailService.restoreByUserId(c, USER)
        expect(countRows(sqlite, 'email', 'is_del = 1')).toBe(0)
        expect(countRows(sqlite, 'email', 'del_time IS NOT NULL')).toBe(0)
    })
})

describe('toEmailIds 的入参净化（审计 P1-2 的第一道闸）', () => {

    it.each([
        ['undefined', undefined, []],
        ['null', null, []],
        ['空字符串', '', []],
        ['逗号串', '1,2,3', [1, 2, 3]],
        ['带空洞的逗号串', '1,,3', [1, 3]],
        ['数组', [1, 2], [1, 2]],
        ['含 undefined 的数组', [1, undefined, 2], [1, 2]],
        ['含 null 的数组', [null, 3], [3]],
        ['负数与 0', [-1, 0, 5], [5]],
        ['小数', [1.5, 2], [2]],
        ['非数字', ['abc', '2'], [2]],
        ['全部非法', [undefined, 'x', -3], []],
        ['单个数字', 7, [7]],
    ])('%s → %j', (_label, raw, expected) => {
        expect(emailService.toEmailIds(raw)).toEqual(expected)
    })
})

describe('purge 的显式意图（审计 P1-2）', () => {

    /** 三封都进回收站，各带一个独立附件 */
    async function seedTrash() {
        const created = await seed()
        const {c, sqlite} = created
        for (const id of [1, 2, 3]) insertAtt(sqlite, {attId: id, userId: USER, emailId: id, accountId: 1, key: `k${id}`})
        await emailService.delete(c, {emailIds: [1, 2, 3]}, USER)
        return created
    }

    // 空 id 曾经等于「清空整个回收站」：前端一次 purge([undefined]) 就是真丢数据
    it.each([
        ['emailIds 缺省', undefined],
        ['emailIds 为空数组', []],
        ['emailIds 全部非法', [undefined, -1, 'x']],
        ['emailIds 为空串', ''],
    ])('%s 且没有 all=1 时什么都不删', async (_label, emailIds) => {
        const {c, sqlite} = await seedTrash()
        await emailService.purge(c, {emailIds}, USER)
        expect(countRows(sqlite, 'email')).toBe(3)
        expect(countRows(sqlite, 'attachments')).toBe(3)
    })

    it('all=1 才清空整个回收站，连附件一起', async () => {
        const {c, sqlite, kv} = await seedTrash()
        await kv.put('k1', 'blob')
        await emailService.purge(c, {all: 1}, USER)
        expect(countRows(sqlite, 'email')).toBe(0)
        expect(countRows(sqlite, 'attachments')).toBe(0)
        // 存储桶未绑定时 r2Service 落到 KV，物理删除要把对象一起带走
        expect(kv._store.has('k1')).toBe(false)
    })

    it('all=1 只清回收站里的行，正常邮件留着', async () => {
        const {c, sqlite} = await seedTrash()
        insertEmail(sqlite, {emailId: 20, userId: USER, accountId: 1, type: RECEIVE})
        await emailService.purge(c, {all: 1}, USER)
        expect(countRows(sqlite, 'email')).toBe(1)
        expect(selectRow(sqlite, 'email', 'email_id = 20')).toBeTruthy()
    })

    it('all=1 不会越过用户边界', async () => {
        const {c, sqlite} = await seedTrash()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 3, userId: 2, email: 'b@example.com'})
        insertEmail(sqlite, {emailId: 21, userId: 2, accountId: 3, type: RECEIVE, isDel: 1})
        await emailService.purge(c, {all: 1}, USER)
        expect(countRows(sqlite, 'email')).toBe(1)
        expect(selectRow(sqlite, 'email', 'email_id = 21')).toBeTruthy()
    })

    it('给定 id 时只删这几封，星标行跟着走', async () => {
        const {c, sqlite} = await seedTrash()
        insertStar(sqlite, {userId: USER, emailId: 1})
        insertStar(sqlite, {userId: USER, emailId: 2})
        await emailService.purge(c, {emailIds: [1]}, USER)
        expect(countRows(sqlite, 'email')).toBe(2)
        expect(countRows(sqlite, 'star', 'email_id = 1')).toBe(0)
        expect(countRows(sqlite, 'star', 'email_id = 2')).toBe(1)
        expect(countRows(sqlite, 'attachments', 'email_id = 1')).toBe(0)
    })

    it('id 里混进非回收站的邮件时，那一封不会被物理删除', async () => {
        const {c, sqlite} = await seedTrash()
        insertEmail(sqlite, {emailId: 22, userId: USER, accountId: 1, type: RECEIVE})
        await emailService.purge(c, {emailIds: [1, 22]}, USER)
        expect(selectRow(sqlite, 'email', 'email_id = 22')).toBeTruthy()
        expect(selectRow(sqlite, 'email', 'email_id = 1')).toBeUndefined()
    })
})

describe('trashList', () => {

    async function seedTrashList() {
        const created = await seed()
        const {c, sqlite} = created
        insertEmail(sqlite, {emailId: 4, userId: USER, accountId: 1, type: SEND})
        await emailService.delete(c, {emailIds: [1, 2, 4]}, USER)
        return created
    }

    it('只列回收站里的邮件，默认不按 type 过滤（删掉的已发送也要在）', async () => {
        const {c} = await seedTrashList()
        const {list, total} = await emailService.trashList(c, {accountId: 0}, USER)
        expect(list.map(item => item.emailId)).toEqual([4, 2, 1])
        expect(total).toBe(3)
    })

    it('给了 type 就按 type 收窄；空串等于没给', async () => {
        const {c} = await seedTrashList()
        const sent = await emailService.trashList(c, {accountId: 0, type: SEND}, USER)
        expect(sent.list.map(item => item.emailId)).toEqual([4])
        const received = await emailService.trashList(c, {accountId: 0, type: RECEIVE}, USER)
        expect(received.list.map(item => item.emailId)).toEqual([2, 1])
        const blank = await emailService.trashList(c, {accountId: 0, type: ''}, USER)
        expect(blank.total).toBe(3)
    })

    it('size 同样双边收口，游标按 emailId 递减', async () => {
        const {c} = await seedTrashList()
        const clamped = await emailService.trashList(c, {accountId: 0, size: -1}, USER)
        expect(clamped.list).toHaveLength(3)
        const paged = await emailService.trashList(c, {accountId: 0, size: 1, emailId: 4}, USER)
        expect(paged.list.map(item => item.emailId)).toEqual([2])
        expect(paged.total).toBe(3)
    })

    it('按邮箱过滤时同样尊重 allReceive，且软删邮箱的邮件不出现', async () => {
        const {c} = await seedTrashList()
        const scoped = await emailService.trashList(c, {accountId: 2, allReceive: 0}, USER)
        expect(scoped.list.map(item => item.emailId)).toEqual([2])
        env.sqlite.prepare('UPDATE account SET is_del = 1 WHERE account_id = 2').run()
        const afterDel = await emailService.trashList(c, {accountId: 0}, USER)
        expect(afterDel.list.map(item => item.emailId)).toEqual([4, 1])
    })
})

describe('clearTrash（cron 的 30 天清理）', () => {

    /** 造一批回收站行，`ago` 天前删除；null 表示 del_time 还没写（历史行） */
    function trash(sqlite, ids, ago) {
        for (const id of ids) {
            insertEmail(sqlite, {emailId: id, userId: USER, accountId: 1, type: RECEIVE, isDel: 1})
            if (ago !== null) {
                sqlite.prepare(`UPDATE email SET del_time = datetime('now', ?) WHERE email_id = ?`).run(`-${ago} day`, id)
            }
        }
    }

    it('补时间戳限量，且刚补上的行当次不会被删', async () => {
        const {c, sqlite} = await seed()
        trash(sqlite, [10, 11, 12], null)
        const removed = await emailService.clearTrash(c, 30, 2)
        expect(removed).toBe(0)
        expect(countRows(sqlite, 'email', 'is_del = 1 AND del_time IS NOT NULL')).toBe(2)
        expect(countRows(sqlite, 'email', 'is_del = 1 AND del_time IS NULL')).toBe(1)
    })

    it('只删满 30 天的，边界内的留着', async () => {
        const {c, sqlite} = await seed()
        trash(sqlite, [10], 31)
        trash(sqlite, [11], 29)
        expect(await emailService.clearTrash(c)).toBe(1)
        expect(selectRow(sqlite, 'email', 'email_id = 10')).toBeUndefined()
        expect(selectRow(sqlite, 'email', 'email_id = 11')).toBeTruthy()
    })

    it('窗口天数可调，物理删除带走附件与星标', async () => {
        const {c, sqlite} = await seed()
        trash(sqlite, [10], 8)
        insertAtt(sqlite, {attId: 1, userId: USER, emailId: 10, accountId: 1, key: 'k10'})
        insertStar(sqlite, {userId: USER, emailId: 10})
        expect(await emailService.clearTrash(c, 7)).toBe(1)
        expect(countRows(sqlite, 'attachments', 'email_id = 10')).toBe(0)
        expect(countRows(sqlite, 'star', 'email_id = 10')).toBe(0)
    })

    it('单次删除限量，余下的留给下一次 cron', async () => {
        const {c, sqlite} = await seed()
        trash(sqlite, [10, 11, 12], 40)
        expect(await emailService.clearTrash(c, 30, 2)).toBe(2)
        expect(countRows(sqlite, 'email', 'is_del = 1')).toBe(1)
        expect(await emailService.clearTrash(c, 30, 2)).toBe(1)
        expect(countRows(sqlite, 'email', 'is_del = 1')).toBe(0)
    })

    it('未删除的邮件永远不进清理范围', async () => {
        const {c, sqlite} = await seed()
        sqlite.prepare(`UPDATE email SET del_time = datetime('now', '-99 day') WHERE email_id = 1`).run()
        expect(await emailService.clearTrash(c)).toBe(0)
        expect(countRows(sqlite, 'email')).toBe(3)
    })

    it('库里没有 del_time 列时只警告，不拖垮 scheduled()', async () => {
        const {c, sqlite} = await seed()
        sqlite.prepare('ALTER TABLE email DROP COLUMN del_time').run()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(await emailService.clearTrash(c)).toBe(0)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('del_time'))
    })

    // 「附件已删、邮件行还在」的孤立状态必须冒出来，不能被 schema 警告吃掉
    it('其它异常照抛', async () => {
        const {c} = await seed()
        vi.spyOn(c.env.db, 'prepare').mockImplementation(() => {
            throw new Error('D1_ERROR: network')
        })
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        await expect(emailService.clearTrash(c)).rejects.toThrow('D1_ERROR: network')
        expect(error).toHaveBeenCalled()
    })
})

describe('markUnread / syncDelTime 的健壮性', () => {

    it('把邮件标回未读，只作用于自己的邮件', async () => {
        const {c, sqlite} = await seed()
        sqlite.prepare('UPDATE email SET unread = 1').run()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 3, userId: 2, email: 'b@example.com'})
        insertEmail(sqlite, {emailId: 11, userId: 2, accountId: 3, type: RECEIVE, unread: 1})
        await emailService.markUnread(c, {emailIds: [1, 11]}, USER)
        expect(selectRow(sqlite, 'email', 'email_id = 1').unread).toBe(0)
        expect(selectRow(sqlite, 'email', 'email_id = 11').unread).toBe(1)
        expect(selectRow(sqlite, 'email', 'email_id = 2').unread).toBe(1)
    })

    it('空 id 时不发 SQL', async () => {
        const {c} = await seed()
        const prepare = vi.spyOn(c.env.db, 'prepare')
        await emailService.markUnread(c, {emailIds: []}, USER)
        await emailService.delete(c, {emailIds: [undefined, -1]}, USER)
        await emailService.restore(c, {emailIds: ''}, USER)
        expect(prepare).not.toHaveBeenCalled()
    })

    it('删除的 id 超过一批（100）时分块下发', async () => {
        const {c, sqlite} = await seed()
        const ids = []
        for (let i = 100; i < 350; i++) {
            insertEmail(sqlite, {emailId: i, userId: USER, accountId: 1, type: RECEIVE})
            ids.push(i)
        }
        await emailService.delete(c, {emailIds: ids}, USER)
        expect(countRows(sqlite, 'email', 'is_del = 1 AND del_time IS NOT NULL')).toBe(250)
    })

    it('缺少 del_time 列时删除本身仍然成功', async () => {
        const {c, sqlite} = await seed()
        sqlite.prepare('ALTER TABLE email DROP COLUMN del_time').run()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await emailService.delete(c, {emailIds: [1]}, USER)
        expect(selectRow(sqlite, 'email', 'email_id = 1').is_del).toBe(1)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('del_time'))
    })
})

describe('counts（侧栏与 Picker 的角标，§10.5「计数必须和列表一致」）', () => {

    const UNREAD = 0
    const READ = 1

    /** 1 号邮箱 2 封未读 + 1 封已读，2 号 1 封未读，软删的 3 号 1 封未读 */
    async function seedCounts() {
        env = await setupEnv()
        const {sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 0})
        insertAccount(sqlite, {accountId: 2, userId: USER, email: 'a2@example.com', allReceive: 0})
        insertAccount(sqlite, {accountId: 3, userId: USER, email: 'a3@example.com', allReceive: 0, isDel: 1})
        insertEmail(sqlite, {emailId: 1, userId: USER, accountId: 1, type: RECEIVE, unread: UNREAD})
        insertEmail(sqlite, {emailId: 2, userId: USER, accountId: 1, type: RECEIVE, unread: UNREAD})
        insertEmail(sqlite, {emailId: 3, userId: USER, accountId: 1, type: RECEIVE, unread: READ})
        insertEmail(sqlite, {emailId: 4, userId: USER, accountId: 2, type: RECEIVE, unread: UNREAD})
        insertEmail(sqlite, {emailId: 5, userId: USER, accountId: 3, type: RECEIVE, unread: UNREAD})
        return env
    }

    it('一次 groupBy 查完，未命中的 id 补 0', async () => {
        const {c} = await seedCounts()
        expect(await emailService.counts(c, {accountIds: '1,2'}, USER)).toEqual({unreadMap: {1: 2, 2: 1}})
    })

    it('软删邮箱的未读不计入（谓词对齐 list 的 leftJoin account）', async () => {
        const {c} = await seedCounts()
        expect(await emailService.counts(c, {accountIds: '1,3'}, USER)).toEqual({unreadMap: {1: 2, 3: 0}})
    })

    it('最多接受 5 个 id，非法 id 过滤掉；全非法则空 map', async () => {
        const {c} = await seedCounts()
        const capped = await emailService.counts(c, {accountIds: '1,2,3,4,5,6,7'}, USER)
        expect(Object.keys(capped.unreadMap)).toEqual(['1', '2', '3', '4', '5'])
        const filtered = await emailService.counts(c, {accountIds: '1,-2,abc,0'}, USER)
        expect(filtered.unreadMap).toEqual({1: 2})
        expect(await emailService.counts(c, {accountIds: '-1,0,x'}, USER)).toEqual({unreadMap: {}})
    })

    it('别人的邮箱数出来是 0，不越权', async () => {
        const {c, sqlite} = await seedCounts()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 9, userId: 2, email: 'b@example.com'})
        insertEmail(sqlite, {emailId: 11, userId: 2, accountId: 9, type: RECEIVE, unread: UNREAD})
        expect(await emailService.counts(c, {accountIds: '9'}, USER)).toEqual({unreadMap: {9: 0}})
    })

    /** 侧栏模式的六个数字 */
    async function seedSidebar() {
        const created = await seedCounts()
        const {sqlite} = created
        insertEmail(sqlite, {emailId: 6, userId: USER, accountId: 1, type: SEND, unread: READ})
        insertEmail(sqlite, {emailId: 7, userId: USER, accountId: 1, type: RECEIVE, unread: READ, code: '123456'})
        insertEmail(sqlite, {emailId: 8, userId: USER, accountId: 1, type: RECEIVE, unread: READ, isDel: 1})
        insertStar(sqlite, {userId: USER, emailId: 1})
        insertStar(sqlite, {userId: USER, emailId: 8})
        return created
    }

    it('all=1 聚合六个数字，星标不数已删的', async () => {
        const {c} = await seedSidebar()
        expect(await emailService.counts(c, {all: 1}, USER)).toEqual({
            inbox: 5, unread: 3, star: 1, code: 1, trash: 1, sent: 1,
        })
    })

    it('accountId=0 与 all=1 同义', async () => {
        const {c} = await seedSidebar()
        expect(await emailService.counts(c, {accountId: 0}, USER))
            .toEqual(await emailService.counts(c, {all: 1}, USER))
    })

    it('单邮箱模式只数这个邮箱（allReceive=0）', async () => {
        const {c} = await seedSidebar()
        expect(await emailService.counts(c, {accountId: 2}, USER)).toEqual({
            inbox: 1, unread: 1, star: 1, code: 0, trash: 0, sent: 0,
        })
    })

    it('邮箱开了「接收全部」时计数跟着放宽，与 list 一致', async () => {
        const {c, sqlite} = await seedSidebar()
        sqlite.prepare('UPDATE account SET all_receive = 1 WHERE account_id = 2').run()
        const counted = await emailService.counts(c, {accountId: 2}, USER)
        const listed = await emailService.list(c, {accountId: 2, type: RECEIVE}, USER)
        expect(counted.inbox).toBe(listed.total)
        expect(counted.inbox).toBe(5)
    })

    it('不是自己的邮箱 / 不存在的邮箱都报 BizError', async () => {
        const {c, sqlite} = await seedSidebar()
        insertUser(sqlite, {userId: 2})
        insertAccount(sqlite, {accountId: 9, userId: 2, email: 'b@example.com'})
        await expect(emailService.counts(c, {accountId: 9}, USER)).rejects.toThrow(BizError)
        await expect(emailService.counts(c, {accountId: 404}, USER)).rejects.toThrow(BizError)
    })
})

/* ------------------------------------------------------------------ 搜索 */

/**
 * `searchConditions()`（§7.5 的服务端过滤）。这些断言只有真 SQL 能给：
 *   - `COLLATE NOCASE LIKE … ESCAPE '\'`：大小写、`%` / `_` / `\` 当字面量
 *   - `hasAtt` / `star` 用 EXISTS 半连接：两个附件不会让同一封出现两行
 *   - `unread` 传的是**列值**（UNREAD=0 / READ=1），两侧都不取反
 *   - `total` 必须跟着条件走，否则「显示 3 封、说共 60 封」
 *   - `latestEmail` 刻意**不**跟着走：它是长轮询的游标（全局最新一封的 id）
 */
describe('list 的搜索条件（§7.5）', () => {

    /** 一批刻意长得很像的邮件，用来卡字段口径与转义 */
    async function seedSearch() {
        env = await setupEnv()
        const {sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
        const row = (emailId, extra) => insertEmail(sqlite, {
            emailId, userId: USER, accountId: 1, type: RECEIVE, ...extra,
        })
        row(1, {subject: '发票 8 月', sendEmail: 'billing@shop.dev', name: 'Shop', text: '合计 100 元'})
        row(2, {subject: 'Invoice July', sendEmail: 'noreply@bank.dev', name: '银行', text: 'total 100%'})
        row(3, {subject: '验证码', sendEmail: 'no-reply@x.dev', name: 'X', code: '123456', unread: 1})
        row(4, {subject: '周报_第三周', sendEmail: 'boss@corp.dev', name: 'Boss', toEmail: 'me@example.com'})
        row(5, {subject: 'a\\b 路径', sendEmail: 'ops@corp.dev', name: 'Ops', text: '反斜杠'})
        return env
    }

    const ids = (result) => result.list.map(item => item.emailId)

    it('没给条件时与不过滤逐字节等价', async () => {
        const {c} = await seedSearch()
        const plain = await emailService.list(c, {accountId: 0, type: RECEIVE}, USER)
        const empty = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '  '}, USER)
        expect(ids(empty)).toEqual(ids(plain))
        expect(empty.total).toBe(5)
    })

    it('keyword 跨主题 / 发件地址 / 发件人名 / 收件地址 / 正文，且大小写不敏感', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'invoice'}, USER))).toEqual([2])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'SHOP'}, USER))).toEqual([1])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '银行'}, USER))).toEqual([2])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'me@example.com'}, USER))).toEqual([4])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '反斜杠'}, USER))).toEqual([5])
    })

    it('total 跟着条件走（否则「显示 1 封、共 5 封」）', async () => {
        const {c} = await seedSearch()
        const found = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'invoice'}, USER)
        expect(found.total).toBe(1)
        expect(found.list).toHaveLength(1)
    })

    it('latestEmail 不受条件影响 —— 它是长轮询的游标，收窄会让轮询原地打转', async () => {
        const {c} = await seedSearch()
        const found = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'invoice'}, USER)
        expect(found.latestEmail?.emailId).toBe(5)
    })

    it('from 命中发件地址或发件人名，to 只看收件地址，subject 只看主题', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, from: 'bank.dev'}, USER))).toEqual([2])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, from: 'Boss'}, USER))).toEqual([4])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, to: 'me@example.com'}, USER))).toEqual([4])
        // 正文里有 100 但主题里没有：subject 不该退化成全文
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, subject: '100'}, USER))).toEqual([])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, subject: '发票'}, USER))).toEqual([1])
    })

    it('多个条件是 AND', async () => {
        const {c} = await seedSearch()
        const both = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '100', from: 'bank'}, USER)
        expect(ids(both)).toEqual([2])
        const none = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '100', from: 'corp'}, USER)
        expect(ids(none)).toEqual([])
    })

    // 不转义的话 `100%` 会变成通配符，把「合计 100 元」也捞进来
    it('% 是字面量', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '100%'}, USER))).toEqual([2])
    })

    // 不转义的话 `_` 匹配任意单字符，等于「搜什么都全中」
    it('_ 是字面量', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: '_'}, USER))).toEqual([4])
    })

    // 转义符自己也要能搜：`a\b` 要先转成 `a\\b`，否则 `\b` 把 b 吃掉
    it('反斜杠是字面量', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'a\\b'}, USER))).toEqual([5])
    })

    it('keyword 截到 64 字符，超长不报错也不落空', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
        insertEmail(sqlite, {emailId: 1, userId: USER, accountId: 1, type: RECEIVE, text: 'y'.repeat(64)})
        const found = await emailService.list(c, {accountId: 0, type: RECEIVE, keyword: 'y'.repeat(70)}, USER)
        expect(ids(found)).toEqual([1])
    })

    it('hasAtt 用 EXISTS：两个附件不会让同一封出现两行，内嵌图不算附件', async () => {
        const {c, sqlite} = await seedSearch()
        insertAtt(sqlite, {attId: 1, userId: USER, emailId: 1, accountId: 1, key: 'k1'})
        insertAtt(sqlite, {attId: 2, userId: USER, emailId: 1, accountId: 1, key: 'k2'})
        insertAtt(sqlite, {attId: 3, userId: USER, emailId: 3, accountId: 1, key: 'k3', type: 1})
        const found = await emailService.list(c, {accountId: 0, type: RECEIVE, hasAtt: 1}, USER)
        expect(ids(found)).toEqual([1])
        expect(found.total).toBe(1)
    })

    it('hasCode 只留带验证码的', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, hasCode: 1}, USER))).toEqual([3])
    })

    it('star=1 用 EXISTS 且只认自己的星标', async () => {
        const {c, sqlite} = await seedSearch()
        insertUser(sqlite, {userId: 2})
        insertStar(sqlite, {userId: USER, emailId: 2})
        insertStar(sqlite, {userId: 2, emailId: 1})
        const found = await emailService.list(c, {accountId: 0, type: RECEIVE, star: 1}, USER)
        expect(ids(found)).toEqual([2])
        expect(found.total).toBe(1)
    })

    // 列值口径：UNREAD=0 / READ=1，前后端都不取反（取反写在哪一侧都会有人踩）
    it('unread 传列值，空串 / 越界值当没给', async () => {
        const {c} = await seedSearch()
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, unread: 1}, USER))).toEqual([3])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, unread: 0}, USER))).toEqual([5, 4, 2, 1])
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, unread: ''}, USER))).toHaveLength(5)
        expect(ids(await emailService.list(c, {accountId: 0, type: RECEIVE, unread: 7}, USER))).toHaveLength(5)
    })

    it('startTime / endTime 含边界，按 UTC 字符串比', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
        const at = (emailId, createTime) => insertEmail(sqlite, {
            emailId, userId: USER, accountId: 1, type: RECEIVE, createTime,
        })
        at(1, '2026-08-01 00:00:00')
        at(2, '2026-08-10 12:30:00')
        at(3, '2026-08-20 23:59:59')
        const from10 = await emailService.list(c, {accountId: 0, type: RECEIVE, startTime: '2026-08-10 12:30:00'}, USER)
        expect(ids(from10)).toEqual([3, 2])
        const to10 = await emailService.list(c, {accountId: 0, type: RECEIVE, endTime: '2026-08-10 12:30:00'}, USER)
        expect(ids(to10)).toEqual([2, 1])
        const window = await emailService.list(c, {
            accountId: 0, type: RECEIVE,
            startTime: '2026-08-02 00:00:00', endTime: '2026-08-20 23:59:59',
        }, USER)
        expect(ids(window)).toEqual([3, 2])
        expect(window.total).toBe(2)
    })
})

describe('trashList 的搜索条件', () => {

    /** 回收站里三封：两封收件、一封发件，内容各不相同 */
    async function seedTrashSearch() {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
        insertEmail(sqlite, {emailId: 1, userId: USER, accountId: 1, type: RECEIVE, subject: '发票 8 月'})
        insertEmail(sqlite, {emailId: 2, userId: USER, accountId: 1, type: RECEIVE, subject: '周报'})
        insertEmail(sqlite, {emailId: 3, userId: USER, accountId: 1, type: SEND, subject: '发票回执'})
        await emailService.delete(c, {emailIds: [1, 2, 3]}, USER)
        return env
    }

    it('条件在回收站同样生效，total 跟着收窄', async () => {
        const {c} = await seedTrashSearch()
        const found = await emailService.trashList(c, {accountId: 0, keyword: '发票'}, USER)
        expect(found.list.map(item => item.emailId)).toEqual([3, 1])
        expect(found.total).toBe(2)
    })

    it('搜索与 type / 游标叠加而不是互相顶掉', async () => {
        const {c} = await seedTrashSearch()
        const sent = await emailService.trashList(c, {accountId: 0, keyword: '发票', type: SEND}, USER)
        expect(sent.list.map(item => item.emailId)).toEqual([3])
        const paged = await emailService.trashList(c, {accountId: 0, keyword: '发票', emailId: 3}, USER)
        expect(paged.list.map(item => item.emailId)).toEqual([1])
    })

    it('没给条件时回收站列表不变', async () => {
        const {c} = await seedTrashSearch()
        const all = await emailService.trashList(c, {accountId: 0}, USER)
        expect(all.list.map(item => item.emailId)).toEqual([3, 2, 1])
        expect(all.total).toBe(3)
    })
})
