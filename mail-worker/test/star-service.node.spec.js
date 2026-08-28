/**
 * `star-service.list` 跑在真 SQLite 上。
 *
 * 星标视图是 `MailWorkspace` 的四个邮件视图之一，所以这里验的是「它和另外三个同源」：
 *   - `?q=` 的过滤条件必须同样生效（谓词来自 `emailService.searchConditions`）
 *   - 只认自己的星标，且已删除的邮件不出现（`email.is_del = 0`）
 *   - 游标同样是「上一页最后一条的 emailId」，size 双边收口
 */
import {afterEach, describe, expect, it} from 'vitest'
import starService from '../src/service/star-service.js'
import emailService from '../src/service/email-service.js'
import {insertAccount, insertEmail, insertStar, insertUser, setupEnv} from './helpers/env.js'

const RECEIVE = 0
const USER = 1

let env

/** 四封邮件，前三封被 USER 加了星标；第 4 封是别人的星标 */
async function seedStar() {
    env = await setupEnv()
    const {sqlite} = env
    insertUser(sqlite, {userId: USER})
    insertUser(sqlite, {userId: 2})
    insertAccount(sqlite, {accountId: 1, userId: USER, email: 'a1@example.com', allReceive: 1})
    insertEmail(sqlite, {emailId: 1, userId: USER, accountId: 1, type: RECEIVE, subject: '发票 8 月', unread: 0})
    insertEmail(sqlite, {emailId: 2, userId: USER, accountId: 1, type: RECEIVE, subject: '周报_第三周', unread: 1})
    insertEmail(sqlite, {emailId: 3, userId: USER, accountId: 1, type: RECEIVE, subject: '发票回执', unread: 0})
    insertEmail(sqlite, {emailId: 4, userId: USER, accountId: 1, type: RECEIVE, subject: '别人的星标'})
    insertStar(sqlite, {userId: USER, emailId: 1})
    insertStar(sqlite, {userId: USER, emailId: 2})
    insertStar(sqlite, {userId: USER, emailId: 3})
    insertStar(sqlite, {userId: 2, emailId: 4})
    return env
}

const ids = (result) => result.list.map(item => item.emailId)

afterEach(() => {
    env?.close()
    env = undefined
})

describe('star-service.list', () => {

    it('只列自己的星标，按 emailId 递减', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {}, USER))).toEqual([3, 2, 1])
    })

    it('已删除的邮件不出现在星标里（星标行还在，但列表不该带出来）', async () => {
        const {c} = await seedStar()
        await emailService.delete(c, {emailIds: [2]}, USER)
        expect(ids(await starService.list(c, {}, USER))).toEqual([3, 1])
    })

    it('游标与 size 双边收口', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {emailId: 3}, USER))).toEqual([2, 1])
        expect(ids(await starService.list(c, {size: 1}, USER))).toEqual([3])
        expect(ids(await starService.list(c, {size: -1}, USER))).toEqual([3, 2, 1])
    })

    it('带出 isStar=1 与 attList', async () => {
        const {c} = await seedStar()
        const [first] = (await starService.list(c, {}, USER)).list
        expect(first.isStar).toBe(1)
        expect(first.attList).toEqual([])
    })

    it('keyword / subject 等条件同样生效', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {keyword: '发票'}, USER))).toEqual([3, 1])
        expect(ids(await starService.list(c, {subject: '回执'}, USER))).toEqual([3])
        expect(ids(await starService.list(c, {keyword: '  '}, USER))).toEqual([3, 2, 1])
    })

    it('unread 用列值口径（UNREAD=0 / READ=1）', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {unread: 1}, USER))).toEqual([2])
        expect(ids(await starService.list(c, {unread: 0}, USER))).toEqual([3, 1])
    })

    // `_` 不转义的话这一条会把三封全捞出来
    it('通配符按字面量处理', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {keyword: '_'}, USER))).toEqual([2])
    })

    it('star=1（漏斗里勾了「已加星」）在星标视图里是恒真条件，不会自己筛掉自己', async () => {
        const {c} = await seedStar()
        expect(ids(await starService.list(c, {star: 1}, USER))).toEqual([3, 2, 1])
    })
})
