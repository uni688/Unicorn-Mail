/**
 * `/open/*` 的 Bearer 鉴权（P4 §0.10 / §4.4）。
 *
 * §4.4 明确要求这些负面用例「必须有自动化测试，不能只手测」——
 * 鉴权是唯一一处「写错了也不报错、只是变得能随便调」的代码，手测覆盖不到
 * 「过期」「停用」「scope 差一个」这些分支。
 *
 * 和别的 worker 用例不一样的地方：这里不直接调 service，而是**真的过一遍 hono**。
 * 入口用 `src/hono/webs.js`（生产入口本体），所以顺带钉住两件只在「组装」层面成立的事：
 *   1. `security.js` 的 `exclude[]` 里有 `/open` —— 少了它，`/open/*` 会先被要求 JWT，
 *      收到的是「登录已过期」而不是「缺少 Authorization」；
 *   2. `api-key-auth` 的 import 排在 `security` 之后、`open-api` 之前 ——
 *      反了就是「先跑业务再鉴权」，而业务本身不看 Key。
 * 这两件事在任何 service 级用例里都验不出来。
 *
 * `app.fetch(req, env, ctx)` 的第三个参数就是 `ExecutionContext`，
 * 夹具里换成一个「把 promise 收进数组」的替身，于是 `waitUntil` 里的日志写入
 * 变成可断言的：响应先回来，`await Promise.all(tasks)` 之后日志才落库。
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import app from '../src/hono/webs.js'
import apiKeyService from '../src/service/api-key-service.js'
import apiLogService from '../src/service/api-log-service.js'
import {t} from '../src/i18n/i18n.js'
import {countRows, insertAccount, insertEmail, insertUser, selectRow, setupEnv} from './helpers/env.js'

const USER = 1
const OTHER = 2

/** 用户 1 / 2 各一个邮箱、各一封收件 */
const MINE = 11
const THEIRS = 22

let env

afterEach(() => {
    vi.restoreAllMocks()
    env?.close()
    env = undefined
})

async function seed() {
    env = await setupEnv()
    const {sqlite} = env
    insertUser(sqlite, {userId: USER})
    insertUser(sqlite, {userId: OTHER})
    insertAccount(sqlite, {accountId: USER, userId: USER, email: 'mine@example.com'})
    insertAccount(sqlite, {accountId: OTHER, userId: OTHER, email: 'theirs@example.com'})
    insertEmail(sqlite, {emailId: MINE, userId: USER, accountId: USER, subject: '我的'})
    insertEmail(sqlite, {emailId: THEIRS, userId: OTHER, accountId: OTHER, subject: '别人的'})
    return env
}

/** 建一把 Key，返回 `{keyId, key}`（`key` 是明文，只有这一次拿得到） */
function createKey(scopes = ['email:read', 'account:read'], userId = USER, name = 'CI') {
    return apiKeyService.add(env.c, {name, scopes}, userId)
}

/** 收集 `waitUntil` 的后台任务，替代真的 ExecutionContext */
function makeCtx() {
    const tasks = []
    return {tasks, ctx: {waitUntil: (task) => tasks.push(task), passThroughOnException: () => {}}}
}

/**
 * 发一个请求。`ctx` 传 null 表示**不给** ExecutionContext ——
 * hono 的 `c.executionCtx` 在那种情况下是个会抛的 getter，专门有一条用例盯它。
 */
async function call(path, {key, authorization, method = 'GET', body, headers = {}, ctx} = {}) {

    const holder = ctx === null ? {tasks: [], ctx: undefined} : (ctx ?? makeCtx())
    const init = {method, headers: {...headers}}

    if (authorization !== undefined) {
        init.headers.authorization = authorization
    } else if (key) {
        init.headers.authorization = `Bearer ${key}`
    }

    if (body !== undefined) {
        init.body = JSON.stringify(body)
        init.headers['content-type'] = 'application/json'
    }

    const res = await app.fetch(new Request(`http://localhost${path}`, init), env.c.env, holder.ctx)

    return {res, json: await res.json(), tasks: holder.tasks}
}

/** 冲掉后台任务，之后 `api_log` / `last_used_time` 才是最终状态 */
const flush = (tasks) => Promise.all(tasks)

const logRows = (sqlite) => sqlite.prepare(`SELECT * FROM api_log ORDER BY log_id`).all()

describe('api-key-auth 的 401 分支', () => {

    it('缺 Authorization 头 → 真的 401，且文案是「缺少 Authorization」而不是「登录已过期」', async () => {
        await seed()
        const {res, json} = await call('/open/email/list')

        // 状态行必须是 401：站内接口一律 200 + body.code，开放 API 刻意不同（§4.4）
        expect(res.status).toBe(401)
        expect(json).toEqual({code: 401, message: t('apiKeyMissing')})
        // 拿到的不是 JWT 中间件的文案 —— 证明 security.js 的 exclude[] 里确实有 /open
        expect(json.message).not.toBe(t('authExpired'))
    })

    it.each([
        ['Basic dXNlcjpwYXNz', '不是 Bearer'],
        ['um_live_0123456789abcdef0123456789abcdef', '裸 key，没有 Bearer 前缀'],
        ['Bearer', '只有 Bearer 没有值'],
        ['Bearer ', 'Bearer 后面是空的'],
        ['Bearer a b', '中间还有空格，取不出唯一的 token'],
    ])('Authorization 形态不对（%s）→ 401', async (authorization) => {
        await seed()
        const {res, json} = await call('/open/email/list', {authorization})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyMalformed'))
    })

    it('明文长度不对 → 401（走 malformed，不去查库）', async () => {
        await seed()
        const {res, json} = await call('/open/email/list', {key: 'um_live_short'})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyMalformed'))
    })

    it('格式对但库里没有 → 401「密钥无效」', async () => {
        await seed()
        const {res, json} = await call('/open/email/list', {key: `um_live_${'a'.repeat(32)}`})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyInvalid'))
    })

    /**
     * 前缀能命中、hash 对不上：这是「猜到了前 8 位」的情形。
     * 必须和「前缀都不存在」一样是 `notFound` —— 两者文案不同就等于确认了前缀有效。
     */
    it('前缀命中但密文不对 → 同样是「密钥无效」，不泄露前缀存在', async () => {
        await seed()
        const created = await createKey()
        // 改掉最后一位：prefix（前 8 位随机字符）不变，hash 必然不匹配
        const tampered = created.key.slice(0, -1) + (created.key.endsWith('0') ? '1' : '0')

        const {res, json} = await call('/open/email/list', {key: tampered})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyInvalid'))
    })

    it('停用的 Key → 401「已停用」，且日志里记下了 keyId（用户才看得见它一直在被调）', async () => {
        const {sqlite} = await seed()
        const created = await createKey()
        await apiKeyService.setStatus(env.c, {keyId: created.keyId, status: 1}, USER)

        const {res, json, tasks} = await call('/open/email/list', {key: created.key})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyDisabled'))

        await flush(tasks)
        const [row] = logRows(sqlite)
        expect(row.status).toBe(401)
        expect(row.key_id).toBe(created.keyId)
        expect(row.user_id).toBe(USER)
        expect(row.err).toBe(t('apiKeyDisabled'))
    })

    it('过期的 Key → 401「已过期」', async () => {
        const {sqlite} = await seed()
        const created = await createKey()
        sqlite.prepare(`UPDATE api_key SET expire_time = ? WHERE key_id = ?`)
            .run('2000-01-01 00:00:00', created.keyId)

        const {res, json} = await call('/open/email/list', {key: created.key})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyExpired'))
    })

    it('软删的 Key 立刻失效（删除是软删，但鉴权查询带 is_del = 0）', async () => {
        await seed()
        const created = await createKey()
        await apiKeyService.delete(env.c, {keyIds: String(created.keyId)}, USER)

        const {res, json} = await call('/open/email/list', {key: created.key})
        expect(res.status).toBe(401)
        expect(json.message).toBe(t('apiKeyInvalid'))
    })

    it('未知 Key 的日志行 key_id / user_id 为空（连是谁都不知道，两列因此可空）', async () => {
        const {sqlite} = await seed()
        const {tasks} = await call('/open/email/list', {
            key: `um_live_${'b'.repeat(32)}`,
            headers: {'cf-connecting-ip': '203.0.113.9', 'user-agent': 'curl/8.5.0'},
        })

        await flush(tasks)
        const [row] = logRows(sqlite)
        expect(row.key_id).toBeNull()
        expect(row.user_id).toBeNull()
        expect(row.status).toBe(401)
        expect(row.path).toBe('/open/email/list')
        expect(row.method).toBe('GET')
        expect(row.ip).toBe('203.0.113.9')
        expect(row.ua).toBe('curl/8.5.0')
    })

    it('Bearer 大小写不敏感、允许多个空格与制表符（RFC 7235）', async () => {
        await seed()
        const created = await createKey()

        for (const authorization of [
            `bearer ${created.key}`,
            `BEARER ${created.key}`,
            `Bearer    ${created.key}`,
            `Bearer\t${created.key}`,
            `  Bearer ${created.key}  `,
        ]) {
            const {res} = await call('/open/account/list', {authorization})
            expect(res.status, authorization).toBe(200)
        }
    })
})

describe('api-key-auth 的 403 分支（scope）', () => {

    it('Key 有效但 scopes 不含该资源 → 403，且不是 401', async () => {
        const {sqlite} = await seed()
        const created = await createKey(['account:read'])

        const {res, json, tasks} = await call('/open/email/list', {key: created.key})
        expect(res.status).toBe(403)
        expect(json).toEqual({code: 403, message: t('apiKeyScopeDenied')})

        await flush(tasks)
        const [row] = logRows(sqlite)
        expect(row.status).toBe(403)
        // 403 是「知道是谁、就是不给」，所以 keyId / userId 必须落下来
        expect(row.key_id).toBe(created.keyId)
        expect(row.user_id).toBe(USER)
    })

    it('email:read 不能当 email:send 用（读写分开）', async () => {
        await seed()
        const created = await createKey(['email:read'])

        const {res, json} = await call('/open/email/send', {key: created.key, method: 'POST', body: {}})
        expect(res.status).toBe(403)
        expect(json.message).toBe(t('apiKeyScopeDenied'))
    })

    it('有 email:send 的 Key 能过 scope 闸门（之后失败也不该是 403）', async () => {
        await seed()
        const created = await createKey(['email:send'])

        const {res} = await call('/open/email/send', {key: created.key, method: 'POST', body: {}})
        // 空 body 会被 emailService.send 拦住，但那是业务校验；只要不是 403 就说明闸门开了
        expect(res.status).not.toBe(403)
        expect(res.status).not.toBe(401)
    })

    /**
     * `requiredScopes()` 对没有任何 scope 声明的路径返回 null = 「Key 有效就能调」。
     * 这一条同时钉住「打错路径收到的是 404 而不是 403」——
     * 403 会让人以为是权限问题，去翻 scope 配置，而实际只是路径写错了。
     */
    it('未知的 /open 路径 → 404，不是 403', async () => {
        await seed()
        const created = await createKey()
        const {res} = await call('/open/not-a-real-route', {key: created.key})
        expect(res.status).toBe(404)
    })

    it('/open/ping 不需要任何 scope（scopes 只给一个无关项也能探活）', async () => {
        await seed()
        const created = await createKey(['account:read'])
        const {res, json} = await call('/open/ping', {key: created.key})
        expect(res.status).toBe(200)
        expect(json.data).toEqual({pong: true})
    })

    it('/open/ping 仍然要 Key —— 没有 Authorization 一样 401', async () => {
        await seed()
        const {res} = await call('/open/ping')
        expect(res.status).toBe(401)
    })
})

describe('api-key-auth 的数据边界', () => {

    it('身份只来自 Key：query 里传别人的 userId 不生效', async () => {
        await seed()
        const created = await createKey(['email:read'], USER)

        const {res, json} = await call(`/open/email/list?userId=${OTHER}&accountId=${OTHER}&allReceive=1`, {key: created.key})

        expect(res.status).toBe(200)
        expect(json.data.list.map(item => item.emailId)).toEqual([MINE])
    })

    it('A 的 Key 读不到 B 的邮件详情 → 404（而不是读到别人的信）', async () => {
        await seed()
        const created = await createKey(['email:read'], USER)

        const mine = await call(`/open/email/detail?emailId=${MINE}`, {key: created.key})
        expect(mine.res.status).toBe(200)
        expect(mine.json.data.emailId).toBe(MINE)

        const theirs = await call(`/open/email/detail?emailId=${THEIRS}`, {key: created.key})
        expect(theirs.res.status).toBe(404)
    })

    it('B 的 Key 只看到 B 的邮箱', async () => {
        await seed()
        const created = await createKey(['account:read'], OTHER, 'CI-2')

        const {res, json} = await call('/open/account/list', {key: created.key})
        expect(res.status).toBe(200)
        expect(json.data.map(item => item.email)).toEqual(['theirs@example.com'])
    })

    it('emailId 非法 → 400（业务异常映射成真的状态码，并记进日志的 err 列）', async () => {
        const {sqlite} = await seed()
        const created = await createKey(['email:read'])

        const {res, json, tasks} = await call('/open/email/detail?emailId=abc', {key: created.key})
        expect(res.status).toBe(400)
        expect(json.code).toBe(400)

        await flush(tasks)
        const [row] = logRows(sqlite)
        expect(row.status).toBe(400)
        expect(row.err).toBe(json.message)
    })
})

describe('api-key-auth 的日志与 last_used_time', () => {

    it('成功的请求写一条日志，并更新 last_used_time', async () => {
        const {sqlite} = await seed()
        const created = await createKey()
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', created.keyId).last_used_time).toBeNull()

        const {res, tasks} = await call('/open/account/list', {key: created.key})
        expect(res.status).toBe(200)

        await flush(tasks)

        const [row] = logRows(sqlite)
        expect(row.status).toBe(200)
        expect(row.path).toBe('/open/account/list')
        expect(row.key_id).toBe(created.keyId)
        expect(row.user_id).toBe(USER)
        expect(row.duration).toBeGreaterThanOrEqual(0)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', created.keyId).last_used_time).toBeTruthy()
    })

    it('探活接口不记日志，但仍然算一次使用（last_used_time 会更新）', async () => {
        const {sqlite} = await seed()
        const created = await createKey()

        const {tasks} = await call('/open/ping', {key: created.key})
        await flush(tasks)

        expect(countRows(sqlite, 'api_log')).toBe(0)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', created.keyId).last_used_time).toBeTruthy()
    })

    it('探活接口鉴权失败也不记日志（监控系统按秒轮询，401 一样会刷爆日志表）', async () => {
        const {sqlite} = await seed()
        const {tasks} = await call('/open/ping', {key: `um_live_${'c'.repeat(32)}`})
        await flush(tasks)
        expect(countRows(sqlite, 'api_log')).toBe(0)
    })

    /**
     * §4.4：日志写入必须在 `waitUntil` 里、**不阻塞响应**。
     *
     * 把 `apiLogService.add` 换成一个「手动才 resolve」的 promise：如果中间件是
     * `await` 它的，这个请求就永远回不来，`Promise.race` 里的定时器会先到。
     */
    it('日志写入挂住也不拖慢响应（waitUntil，不是 await）', async () => {
        await seed()
        const created = await createKey()

        let release
        const blocked = new Promise(resolve => {
            release = resolve
        })
        const spy = vi.spyOn(apiLogService, 'add').mockReturnValue(blocked)

        let timer
        const guard = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('响应被日志写入阻塞了')), 2000)
        })

        try {
            const {res, tasks} = await Promise.race([call('/open/account/list', {key: created.key}), guard])
            expect(res.status).toBe(200)
            // 日志确实是交给 ExecutionContext 的，而不是在响应路径上顺手写掉
            expect(tasks).toHaveLength(1)
            expect(spy).toHaveBeenCalledTimes(1)
        } finally {
            clearTimeout(timer)
            release()
        }
    })

    /**
     * `c.executionCtx` 是会抛的 getter（`hono/dist/context.js`），`?.` 挡不住。
     * 不带 ctx 调 `app.fetch(req, env)` 时鉴权已经过了，这里再抛就是 500 ——
     * 而且是那种「本地怎么试都好，某个入口一调就崩」的形态。
     */
    it('没有 ExecutionContext 也不炸（退化成不登记的后台 promise）', async () => {
        await seed()
        const created = await createKey()

        const {res, json} = await call('/open/account/list', {key: created.key, ctx: null})
        expect(res.status).toBe(200)
        expect(json.code).toBe(200)
    })

    it('日志写失败只 warn，不影响已经发出去的响应', async () => {
        await seed()
        const created = await createKey()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(apiLogService, 'add').mockRejectedValue(new Error('D1 挂了'))

        const {res, tasks} = await call('/open/account/list', {key: created.key})
        expect(res.status).toBe(200)

        await flush(tasks)
        expect(warn).toHaveBeenCalled()
    })
})
