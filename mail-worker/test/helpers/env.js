/**
 * worker 测试的环境搭台：一套内存 D1 + KV + 一个够用的 hono 上下文替身。
 *
 * 表结构不手写，直接跑**真的**迁移链 `dbInit.init(c)`：
 *   1. 断言用的列（`email.del_time`、`account.all_receive`、`email.type` …）
 *      到底存不存在，只有迁移链说了算 —— 手抄一份 DDL 迟早和 `init.js` 走岔；
 *   2. 迁移链本身也就跟着被测了（v3_1DB 加列、v2_x 的 ALTER 幂等）。
 *
 * 服务层从 `c` 上只取三样：`c.env.db`、`c.env.kv`、`c.env.*` 里的几个配置，
 * 外加 `c.get/set('setting')`（settingService 的请求内缓存）。`c.req` 只有 init 用到。
 */
import {createD1, createKv} from './d1-sqlite.js'

const JWT_SECRET = 'test-secret'

/** 建库 + 跑迁移链，返回 `{c, sqlite, close}`；一个用例一份，互不串台 */
export async function setupEnv({env = {}} = {}) {

    const {db, sqlite, close} = createD1()
    const kv = createKv()
    const c = createContext({db, kv, env})

    const {dbInit} = await import('../../src/init/init.js')
    const result = await dbInit.init(c)
    if (result !== 'success') throw new Error(`迁移链没跑完：${result}`)

    return {c, db, kv, sqlite, close}
}

export function createContext({db, kv, env = {}, params = {secret: JWT_SECRET}} = {}) {

    const vars = new Map()

    return {
        env: {
            db,
            kv,
            orm_log: false,
            domain: ['example.com'],
            admin: 'admin@example.com',
            jwt_secret: JWT_SECRET,
            ...env,
        },
        req: {
            param: (key) => params[key],
            header: () => undefined,
            query: () => ({}),
        },
        text: (body) => body,
        json: (body) => body,
        get: (key) => vars.get(key),
        set: (key, value) => vars.set(key, value),
    }
}

/* --------------------------------------------------------------- 数据夹具 */

/**
 * 夹具直接走裸 SQL 而不是 service：service 的插入路径本身就是被测对象之一，
 * 用它准备数据会把「读」的用例和「写」的实现绑在一起。
 */
export function insertUser(sqlite, {userId, email = `u${userId}@example.com`, type = 1, isDel = 0} = {}) {
    sqlite.prepare(
        `INSERT INTO user (user_id, email, type, password, salt, status, is_del) VALUES (?, ?, ?, 'x', 'y', 0, ?)`,
    ).run(userId, email, type, isDel)
    return userId
}

export function insertAccount(sqlite, {accountId, userId, email, allReceive = 0, isDel = 0, name = ''} = {}) {
    sqlite.prepare(
        `INSERT INTO account (account_id, email, name, user_id, all_receive, is_del, sort, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    ).run(accountId, email, name, userId, allReceive, isDel)
    return accountId
}

/** 邮件行；`createTime` / `delTime` 允许显式给，回收站的 30 天清理要靠它造历史 */
export function insertEmail(sqlite, {
    emailId,
    userId,
    accountId,
    type = 0,
    isDel = 0,
    unread = 0,
    subject = `主题 ${emailId}`,
    sendEmail = 'from@x.dev',
    toEmail = 'to@example.com',
    name = '发件人',
    text = '正文',
    content = '<p>正文</p>',
    code = '',
    createTime = null,
    delTime = null,
} = {}) {
    sqlite.prepare(
        `INSERT INTO email (email_id, user_id, account_id, type, is_del, unread, subject, send_email, to_email,
                            name, text, content, code, create_time, del_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
    ).run(emailId, userId, accountId, type, isDel, unread, subject, sendEmail, toEmail,
        name, text, content, code, createTime, delTime)
    return emailId
}

export function insertStar(sqlite, {userId, emailId}) {
    sqlite.prepare(`INSERT INTO star (user_id, email_id) VALUES (?, ?)`).run(userId, emailId)
}

export function insertAtt(sqlite, {attId, userId, emailId, accountId, key, filename = 'a.pdf', type = 0}) {
    sqlite.prepare(
        `INSERT INTO attachments (att_id, user_id, email_id, account_id, key, filename, mime_type, size, type, status)
         VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', 10, ?, 0)`,
    ).run(attId, userId, emailId, accountId, key, filename, type)
}

/** 直接数行，绕开 service —— 断言「库里到底剩了什么」 */
export function countRows(sqlite, table, where = '1=1', ...params) {
    return sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params).n
}

export function selectRow(sqlite, table, where, ...params) {
    return sqlite.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(...params)
}
