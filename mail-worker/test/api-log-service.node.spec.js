/**
 * `api-log-service` 跑在真 SQLite 上。
 *
 * 这个 service 的行为几乎全在 SQL 里，所以只有真库能验：
 *   - 游标分页（`logId` 倒序 + `lt`）在「持续写入」的表上不漏行、不重行；
 *   - `status` 的 `2xx` / `4xx` / `5xx` 区间谓词与精确码谓词；
 *   - `LIKE` 的通配符转义（`_` 必须当字面量）；
 *   - `stats` 一条 SQL 出四个数，且和筛选条件同源；
 *   - 30 天清理的边界；
 *   - `userId` 恒定参与 —— 别人的日志在 SQL 层就取不到。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import apiLogService from '../src/service/api-log-service.js'
import {countRows, insertUser, setupEnv} from './helpers/env.js'

const USER = 1
const OTHER = 2

let env

/** 直接裸 SQL 写日志：`add()` 自己也是被测对象，用它准备数据会把读的用例绑在写的实现上 */
function insertLog(sqlite, {logId, userId = USER, keyId = 1, method = 'GET', path = '/open/email/list', status = 200, duration = 10, createTime = null, ip = null, ua = null, err = null} = {}) {
    sqlite.prepare(
        `INSERT INTO api_log (log_id, key_id, user_id, method, path, status, duration, ip, ua, err, create_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    ).run(logId, keyId, userId, method, path, status, duration, ip, ua, err, createTime)
    return logId
}

async function seedLogs() {
    env = await setupEnv()
    const {sqlite} = env
    insertUser(sqlite, {userId: USER})
    insertUser(sqlite, {userId: OTHER})
    insertLog(sqlite, {logId: 1, status: 200, path: '/open/email/list', method: 'GET'})
    insertLog(sqlite, {logId: 2, status: 404, path: '/open/email/detail', method: 'GET'})
    insertLog(sqlite, {logId: 3, status: 500, path: '/open/email/send', method: 'POST'})
    insertLog(sqlite, {logId: 4, status: 403, path: '/open/account/list', method: 'GET', keyId: 2})
    insertLog(sqlite, {logId: 5, status: 204, path: '/open/email/counts', method: 'GET'})
    insertLog(sqlite, {logId: 6, userId: OTHER, status: 200, path: '/open/email/list'})
    return env
}

const ids = (result) => result.list.map(item => item.logId)

afterEach(() => {
    env?.close()
    env = undefined
})

describe('api-log-service.list', () => {

    it('按 logId 倒序，只列自己的', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {}, USER))).toEqual([5, 4, 3, 2, 1])
        expect(ids(await apiLogService.list(c, {}, OTHER))).toEqual([6])
    })

    it('游标是「上一页最后一条的 logId」，严格小于', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {logId: 4}, USER))).toEqual([3, 2, 1])
        expect(ids(await apiLogService.list(c, {logId: 1}, USER))).toEqual([])
    })

    it('size 双边收口：超上限和非正整数都落回默认', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {size: 2}, USER))).toEqual([5, 4])
        expect(ids(await apiLogService.list(c, {size: -1}, USER))).toEqual([5, 4, 3, 2, 1])
        expect(ids(await apiLogService.list(c, {size: 999}, USER))).toEqual([5, 4, 3, 2, 1])
    })

    // 翻页期间头部插入新行 —— offset 分页会把第 5 条重复吐一次，游标不会
    it('翻页期间有新日志写入也不会重行', async () => {
        const {c, sqlite} = await seedLogs()
        const first = await apiLogService.list(c, {size: 2}, USER)
        expect(ids(first)).toEqual([5, 4])
        insertLog(sqlite, {logId: 7, status: 200})
        const second = await apiLogService.list(c, {size: 2, logId: 4}, USER)
        expect(ids(second)).toEqual([3, 2])
    })

    it('第一页带 stats，后续页 stats 为 null（滚动时不重算）', async () => {
        const {c} = await seedLogs()
        const first = await apiLogService.list(c, {}, USER)
        expect(first.stats).toEqual({total: 5, ok: 2, clientErr: 2, serverErr: 1, other: 0})
        expect((await apiLogService.list(c, {logId: 4}, USER)).stats).toBeNull()
    })

    it('不返回 total（和 all-email 同一套游标语义）', async () => {
        const {c} = await seedLogs()
        expect(await apiLogService.list(c, {}, USER)).not.toHaveProperty('total')
    })
})

describe('api-log-service 筛选', () => {

    it('status 支持区间形态 2xx / 4xx / 5xx', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {status: '2xx'}, USER))).toEqual([5, 1])
        expect(ids(await apiLogService.list(c, {status: '4xx'}, USER))).toEqual([4, 2])
        expect(ids(await apiLogService.list(c, {status: '5xx'}, USER))).toEqual([3])
        expect(ids(await apiLogService.list(c, {status: '4XX'}, USER))).toEqual([4, 2])
    })

    it('status 支持精确码', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {status: '404'}, USER))).toEqual([2])
    })

    it('status 是垃圾值时整个条件被忽略，而不是筛成空', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {status: 'abc'}, USER))).toEqual([5, 4, 3, 2, 1])
        expect(ids(await apiLogService.list(c, {status: ''}, USER))).toEqual([5, 4, 3, 2, 1])
    })

    it('keyId / method 精确匹配，method 大小写不敏感', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {keyId: 2}, USER))).toEqual([4])
        expect(ids(await apiLogService.list(c, {method: 'post'}, USER))).toEqual([3])
    })

    it('path 是模糊匹配', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {path: '/open/email'}, USER))).toEqual([5, 3, 2, 1])
        expect(ids(await apiLogService.list(c, {path: 'ACCOUNT'}, USER))).toEqual([4])
    })

    // `_` 不转义的话它会匹配任意单字符，把 5 条全捞出来
    it('path 里的通配符按字面量处理', async () => {
        const {c, sqlite} = await seedLogs()
        insertLog(sqlite, {logId: 8, path: '/open/a_b'})
        expect(ids(await apiLogService.list(c, {path: 'a_b'}, USER))).toEqual([8])
        expect(ids(await apiLogService.list(c, {path: '%'}, USER))).toEqual([])
    })

    it('startTime / endTime 是闭区间', async () => {
        const {c, sqlite} = await seedLogs()
        insertLog(sqlite, {logId: 9, createTime: '2026-08-01 00:00:00'})
        insertLog(sqlite, {logId: 10, createTime: '2026-08-10 00:00:00'})
        const result = await apiLogService.list(c, {startTime: '2026-08-01 00:00:00', endTime: '2026-08-10 00:00:00'}, USER)
        expect(ids(result)).toEqual([10, 9])
    })

    it('stats 与列表同一套筛选条件', async () => {
        const {c} = await seedLogs()
        const result = await apiLogService.list(c, {status: '4xx'}, USER)
        expect(result.stats).toEqual({total: 2, ok: 0, clientErr: 2, serverErr: 0, other: 0})
    })

    it('1xx / 3xx 落进 other', async () => {
        const {c, sqlite} = await seedLogs()
        insertLog(sqlite, {logId: 11, status: 302})
        expect((await apiLogService.list(c, {}, USER)).stats.other).toBe(1)
    })

    it('别人的日志在任何筛选下都取不到', async () => {
        const {c} = await seedLogs()
        expect(ids(await apiLogService.list(c, {path: '/open/email/list'}, OTHER))).toEqual([6])
        expect(ids(await apiLogService.list(c, {keyId: 1}, OTHER))).toEqual([6])
    })
})

describe('api-log-service.add', () => {

    it('正常写入一条', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        await apiLogService.add(c, {keyId: 1, userId: USER, method: 'GET', path: '/open/email/list', status: 200, duration: 12})
        expect(countRows(sqlite, 'api_log', 'user_id = ?', USER)).toBe(1)
    })

    it('401 的请求（还不知道是谁）也能落库：keyId / userId 可空', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        await apiLogService.add(c, {method: 'GET', path: '/open/email/list', status: 401, duration: 1, err: 'apiKeyMissing'})
        const row = sqlite.prepare(`SELECT * FROM api_log`).get()
        expect(row.key_id).toBeNull()
        expect(row.user_id).toBeNull()
        expect(row.status).toBe(401)
    })

    it('跳过 apiLogSkipPaths 里的路径', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        await apiLogService.add(c, {userId: USER, path: '/open/ping', status: 200, duration: 1})
        await apiLogService.add(c, {userId: USER, path: '/open/ping/x', status: 200, duration: 1})
        expect(countRows(sqlite, 'api_log')).toBe(0)
    })

    it('超长字段被截断，不会把整段堆栈存进去', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        await apiLogService.add(c, {
            userId: USER, status: 500, duration: 1,
            method: 'X'.repeat(50), path: '/open/' + 'p'.repeat(500),
            ip: 'i'.repeat(200), ua: 'u'.repeat(500), err: 'e'.repeat(2000),
        })
        const row = sqlite.prepare(`SELECT * FROM api_log`).get()
        expect(row.method.length).toBe(10)
        expect(row.path.length).toBe(200)
        expect(row.ip.length).toBe(64)
        expect(row.ua.length).toBe(200)
        expect(row.err.length).toBe(500)
    })

    it('duration 取整且不为负', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        await apiLogService.add(c, {userId: USER, path: '/open/x', status: 200, duration: -5})
        await apiLogService.add(c, {userId: USER, path: '/open/y', status: 200, duration: 12.7})
        const rows = sqlite.prepare(`SELECT duration FROM api_log ORDER BY log_id`).all()
        expect(rows.map(item => item.duration)).toEqual([0, 13])
    })

    // 响应已经发出去了，这里抛异常就是一个没人接的 rejection
    it('写入失败只告警，不抛错', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sqlite.exec('DROP TABLE api_log')
        await expect(apiLogService.add(c, {userId: USER, path: '/open/x', status: 200, duration: 1})).resolves.toBeUndefined()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

describe('api-log-service.keyNames', () => {

    it('把软删掉的 Key 也带出来 —— 否则历史日志的名称列是一串孤儿 id', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        sqlite.prepare(
            `INSERT INTO api_key (key_id, user_id, name, prefix, hash, salt, scopes, status, is_del)
             VALUES (1, ?, '在用', 'um_live_aaaaaaaa', 'h', 's', 'email:read', 0, 0),
                    (2, ?, '已删', 'um_live_bbbbbbbb', 'h', 's', 'email:read', 0, 1)`,
        ).run(USER, USER)
        const rows = await apiLogService.keyNames(c, USER)
        expect(rows.map(item => item.name).sort()).toEqual(['在用', '已删'])
    })

    it('不带别人的 Key', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertUser(sqlite, {userId: OTHER})
        sqlite.prepare(
            `INSERT INTO api_key (key_id, user_id, name, prefix, hash, salt, scopes, status, is_del)
             VALUES (1, ?, '我的', 'um_live_aaaaaaaa', 'h', 's', 'email:read', 0, 0),
                    (2, ?, '别人的', 'um_live_bbbbbbbb', 'h', 's', 'email:read', 0, 0)`,
        ).run(USER, OTHER)
        expect((await apiLogService.keyNames(c, USER)).map(item => item.name)).toEqual(['我的'])
    })
})

describe('api-log-service.clearExpired', () => {

    it('只删 30 天以前的', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        insertUser(sqlite, {userId: USER})
        insertLog(sqlite, {logId: 1, createTime: '2026-01-01 00:00:00'})
        insertLog(sqlite, {logId: 2})
        await apiLogService.clearExpired(c)
        expect(countRows(sqlite, 'api_log')).toBe(1)
        expect(countRows(sqlite, 'api_log', 'log_id = ?', 2)).toBe(1)
    })

    // 这是 cron 里最后一个任务，表还没建出来时不该让整个 scheduled 失败
    it('表不存在时安静跳过，不抛错', async () => {
        env = await setupEnv()
        const {c, sqlite} = env
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sqlite.exec('DROP TABLE api_log')
        await expect(apiLogService.clearExpired(c)).resolves.toBeUndefined()
        warn.mockRestore()
    })
})
