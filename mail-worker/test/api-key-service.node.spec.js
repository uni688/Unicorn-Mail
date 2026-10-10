/**
 * `api-key-service` 跑在真 SQLite 上。
 *
 * 这个 service 有三条不能破的规矩（写在 service 头注释里），用例是它们的守门人：
 *   1. 明文只在 `add()` 的返回值里出现一次；库里只有 prefix + salt + hash，
 *      任何查询都不能把 hash / salt 带出去；
 *   2. 每条查询都带 `user_id`，别人的 Key 既查不到也改不动、删不掉；
 *   3. 删除是软删 —— `api_log` 里的历史记录要能反查到 Key 名称。
 *
 * 另外验 `verifyPlainKey()` 的四种失败口径（malformed / notFound / disabled / expired）：
 * 中间件靠 reason 决定 401 还是 403，口径错了就是鉴权漏洞。
 */
import {afterEach, describe, expect, it} from 'vitest'
import apiKeyService from '../src/service/api-key-service.js'
import apiLogService from '../src/service/api-log-service.js'
import {apiKeyConst} from '../src/const/api-const.js'
import {grantRolePerms, insertUser, revokeRolePerms, selectRow, setupEnv} from './helpers/env.js'

const USER = 1
const OTHER = 2

let env

async function seed() {
    env = await setupEnv()
    insertUser(env.sqlite, {userId: USER})
    insertUser(env.sqlite, {userId: OTHER})
    // 创建 Key 要求角色有开发者能力（见下方「scope 不能超出角色」）；默认角色 1 不含，先勾上
    grantRolePerms(env.sqlite, 1, ['api-key:query', 'api-key:add'])
    return env
}

const add = (c, params = {}, userId = USER) =>
    apiKeyService.add(c, {name: 'CI', scopes: ['email:read'], ...params}, userId)

afterEach(() => {
    env?.close()
    env = undefined
})

describe('api-key-service.add', () => {

    it('返回明文一次，库里只有 prefix/salt/hash', async () => {
        const {c, sqlite} = await seed()
        const created = await add(c)

        expect(created.key).toMatch(/^um_live_[0-9a-f]{32}$/)
        expect(created.prefix).toBe(created.key.substring(0, apiKeyConst.prefixNamespace.length + apiKeyConst.prefixLength))
        // 返回值里不能出现校验材料
        expect(created.hash).toBeUndefined()
        expect(created.salt).toBeUndefined()

        const row = selectRow(sqlite, 'api_key', 'key_id = ?', created.keyId)
        expect(row.hash).toBeTruthy()
        expect(row.salt).toBeTruthy()
        // 关键：库里任何一列都不等于明文
        expect(Object.values(row)).not.toContain(created.key)
    })

    it('两次创建的明文与 prefix 都不同', async () => {
        const {c} = await seed()
        const first = await add(c)
        const second = await add(c, {name: 'CI2'})
        expect(first.key).not.toBe(second.key)
        expect(first.prefix).not.toBe(second.prefix)
    })

    it('name 必填且不超过 30 字，scopes 不能为空', async () => {
        const {c} = await seed()
        await expect(add(c, {name: '   '})).rejects.toThrow()
        await expect(add(c, {name: 'x'.repeat(apiKeyConst.nameMaxLength + 1)})).rejects.toThrow()
        await expect(add(c, {scopes: []})).rejects.toThrow()
        // 未知 scope 会被 parseScopes 丢掉，丢完为空同样要拦住
        await expect(add(c, {scopes: ['email:nuke']})).rejects.toThrow()
    })

    it('scopes 去重、丢未知项，逗号串与数组等价', async () => {
        const {c} = await seed()
        const fromArray = await add(c, {scopes: ['email:read', 'email:read', 'nope', 'email:send']})
        const fromCsv = await add(c, {name: 'CI2', scopes: 'email:read, email:send ,nope'})
        expect(fromArray.scopes).toBe('email:read,email:send')
        expect(fromCsv.scopes).toBe('email:read,email:send')
    })

    it('expireDays 只认 30/90/365，其余当永不过期', async () => {
        const {c} = await seed()
        expect((await add(c, {expireDays: 30})).expireTime).toBeTruthy()
        expect((await add(c, {name: 'a', expireDays: 7})).expireTime).toBeNull()
        expect((await add(c, {name: 'b'})).expireTime).toBeNull()
    })

    // 不接受前端直接给过期时刻，否则「永不过期」是可以伪造的
    it('忽略前端传来的 expireTime', async () => {
        const {c} = await seed()
        const created = await add(c, {expireTime: '2099-01-01 00:00:00'})
        expect(created.expireTime).toBeNull()
    })

    it('超过每人上限就拦住', async () => {
        const {c} = await seed()
        for (let i = 0; i < apiKeyConst.maxPerUser; i++) {
            await add(c, {name: `k${i}`})
        }
        await expect(add(c, {name: 'over'})).rejects.toThrow()
        // 上限是按人算的，别人不受影响
        await expect(add(c, {name: 'other'}, OTHER)).resolves.toBeTruthy()
    })

    // 软删掉的 Key 不该继续占额度
    it('软删后额度释放', async () => {
        const {c} = await seed()
        const keys = []
        for (let i = 0; i < apiKeyConst.maxPerUser; i++) {
            keys.push(await add(c, {name: `k${i}`}))
        }
        await apiKeyService.delete(c, {keyIds: String(keys[0].keyId)}, USER)
        await expect(add(c, {name: 'again'})).resolves.toBeTruthy()
    })
})

/**
 * scope 只能收窄角色本来就有的能力（P4 验收时发现的越权）：建 Key 时只校验了 scope 是否
 * 在已知清单里，没校验角色有没有对应的站内权限 —— 没有 `email:send` 的角色建一把带
 * `email:send` 的 Key，就能绕过角色设置去 `/open/email/send` 发信。
 */
describe('api-key-service · scope 不能超出角色', () => {

    it('角色没有 email:send → 建不出带 email:send 的 Key（403）', async () => {
        const {c, sqlite} = await seed()
        revokeRolePerms(sqlite, 1, ['email:send'])
        await expect(add(c, {scopes: ['email:send']})).rejects.toMatchObject({code: 403})
        await expect(add(c, {scopes: ['email:read', 'email:send']})).rejects.toMatchObject({code: 403})
        // email:read 在站内本来就不卡权限，照常能建
        await expect(add(c, {scopes: ['email:read']})).resolves.toBeTruthy()
    })

    it('角色没有 account:query → 建不出带 account:read 的 Key', async () => {
        const {c, sqlite} = await seed()
        revokeRolePerms(sqlite, 1, ['account:query'])
        await expect(add(c, {scopes: ['account:read']})).rejects.toMatchObject({code: 403})
    })

    it('角色没有任何开发者权限 → 什么 scope 都建不出来', async () => {
        const {c, sqlite} = await seed()
        revokeRolePerms(sqlite, 1, ['api-key:query', 'api-key:add'])
        await expect(add(c, {scopes: ['email:read']})).rejects.toMatchObject({code: 403})
    })

    it('站长（env.admin）不看角色', async () => {
        const {c, sqlite} = await seed()
        insertUser(sqlite, {userId: 9, email: 'admin@example.com', type: 0})
        revokeRolePerms(sqlite, 1, ['email:send', 'account:query', 'api-key:query', 'api-key:add'])
        await expect(add(c, {scopes: ['email:send', 'account:read']}, 9)).resolves.toBeTruthy()
    })

    it('scopeOptions 给每个 scope 标出 allowed，供前端置灰', async () => {
        const {c, sqlite} = await seed()
        revokeRolePerms(sqlite, 1, ['email:send'])
        const options = await apiKeyService.scopeOptions(c, USER)
        expect(options.map(o => [o.key, o.allowed])).toEqual([
            ['email:read', true], ['email:send', false], ['account:read', true],
        ])
        expect(options[0].paths).toContain('/open/email/list')
    })
})

describe('api-key-service.list', () => {

    it('只列自己的，按 keyId 递减，scopes 拆成数组', async () => {
        const {c} = await seed()
        await add(c, {name: 'a'})
        await add(c, {name: 'b', scopes: ['email:read', 'email:send']})
        await add(c, {name: '别人的'}, OTHER)

        const list = await apiKeyService.list(c, {}, USER)
        expect(list.map(item => item.name)).toEqual(['b', 'a'])
        expect(list[0].scopes).toEqual(['email:read', 'email:send'])
        expect(list.some(item => 'hash' in item || 'salt' in item)).toBe(false)
    })

    it('expired 是按 expireTime 现算的，不是存下来的状态位', async () => {
        const {c, sqlite} = await seed()
        const created = await add(c, {expireDays: 30})
        expect((await apiKeyService.list(c, {}, USER))[0].expired).toBe(false)

        sqlite.prepare(`UPDATE api_key SET expire_time = '2000-01-01 00:00:00' WHERE key_id = ?`).run(created.keyId)
        const [row] = await apiKeyService.list(c, {}, USER)
        expect(row.expired).toBe(true)
        // 过期不改状态位：启用/停用与过期是两件独立的事
        expect(row.status).toBe(apiKeyConst.status.NORMAL)
    })

    it('软删的不出现', async () => {
        const {c} = await seed()
        const created = await add(c)
        await apiKeyService.delete(c, {keyIds: String(created.keyId)}, USER)
        expect(await apiKeyService.list(c, {}, USER)).toEqual([])
    })
})

describe('api-key-service 越权', () => {

    it('setStatus / delete / usage 都碰不到别人的 Key', async () => {
        const {c, sqlite} = await seed()
        const mine = await add(c, {name: '我的'})

        await expect(apiKeyService.setStatus(c, {keyId: mine.keyId, status: 1}, OTHER)).rejects.toThrow()
        await expect(apiKeyService.usage(c, {keyId: mine.keyId}, OTHER)).rejects.toThrow()

        // delete 不抛错（批量删的语义是「删掉能删的」），但一行都不该动
        await apiKeyService.delete(c, {keyIds: String(mine.keyId)}, OTHER)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', mine.keyId).is_del).toBe(0)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', mine.keyId).status).toBe(0)
    })

    it('status 只认 0 / 1', async () => {
        const {c} = await seed()
        const created = await add(c)
        await expect(apiKeyService.setStatus(c, {keyId: created.keyId, status: 2}, USER)).rejects.toThrow()
        await expect(apiKeyService.setStatus(c, {keyId: created.keyId, status: 1}, USER)).resolves.toBeUndefined()
    })

    it('批量删只删自己的那几把', async () => {
        const {c, sqlite} = await seed()
        const a = await add(c, {name: 'a'})
        const b = await add(c, {name: 'b'})
        const other = await add(c, {name: 'other'}, OTHER)

        await apiKeyService.delete(c, {keyIds: `${a.keyId},${b.keyId},${other.keyId}`}, USER)

        expect(selectRow(sqlite, 'api_key', 'key_id = ?', a.keyId).is_del).toBe(1)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', b.keyId).is_del).toBe(1)
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', other.keyId).is_del).toBe(0)
    })

    it('keyIds 全是垃圾就报错，不会退化成「删光」', async () => {
        const {c, sqlite} = await seed()
        const created = await add(c)
        await expect(apiKeyService.delete(c, {keyIds: 'abc,,-1'}, USER)).rejects.toThrow()
        expect(selectRow(sqlite, 'api_key', 'key_id = ?', created.keyId).is_del).toBe(0)
    })
})

describe('api-key-service.verifyPlainKey', () => {

    it('明文正确就通过，带出 userId 与数组化的 scopes，且不带 hash/salt', async () => {
        const {c} = await seed()
        const created = await add(c, {scopes: ['email:read', 'email:send']})

        const result = await apiKeyService.verifyPlainKey(c, created.key)
        expect(result.ok).toBe(true)
        expect(result.row.userId).toBe(USER)
        expect(result.row.keyId).toBe(created.keyId)
        expect(result.row.scopes).toEqual(['email:read', 'email:send'])
        expect(result.row.hash).toBeUndefined()
        expect(result.row.salt).toBeUndefined()
    })

    it('格式不对 → malformed（连库都不查）', async () => {
        const {c} = await seed()
        for (const bad of ['', '   ', 'Bearer x', 'um_live_', 'um_live_abc', 'sk_live_' + 'a'.repeat(32)]) {
            expect((await apiKeyService.verifyPlainKey(c, bad)).reason).toBe('malformed')
        }
    })

    it('前缀对但后半段不对 → notFound（不泄露「前缀存在」）', async () => {
        const {c} = await seed()
        const created = await add(c)
        const forged = created.prefix + 'f'.repeat(created.key.length - created.prefix.length)
        const result = await apiKeyService.verifyPlainKey(c, forged)
        expect(result.ok).toBe(false)
        expect(result.reason).toBe('notFound')
    })

    it('停用 → disabled，过期 → expired，两者都带 row 供写日志', async () => {
        const {c, sqlite} = await seed()
        const banned = await add(c, {name: 'banned'})
        const outdated = await add(c, {name: 'outdated'})

        await apiKeyService.setStatus(c, {keyId: banned.keyId, status: apiKeyConst.status.BAN}, USER)
        sqlite.prepare(`UPDATE api_key SET expire_time = '2000-01-01 00:00:00' WHERE key_id = ?`).run(outdated.keyId)

        const bannedResult = await apiKeyService.verifyPlainKey(c, banned.key)
        expect(bannedResult).toMatchObject({ok: false, reason: 'disabled'})
        expect(bannedResult.row.keyId).toBe(banned.keyId)

        const expiredResult = await apiKeyService.verifyPlainKey(c, outdated.key)
        expect(expiredResult).toMatchObject({ok: false, reason: 'expired'})
        expect(expiredResult.row.keyId).toBe(outdated.keyId)
    })

    it('软删的 Key 立刻失效', async () => {
        const {c} = await seed()
        const created = await add(c)
        await apiKeyService.delete(c, {keyIds: String(created.keyId)}, USER)
        expect((await apiKeyService.verifyPlainKey(c, created.key)).reason).toBe('notFound')
    })

    it('前后空格允许（复制粘贴常带）', async () => {
        const {c} = await seed()
        const created = await add(c)
        expect((await apiKeyService.verifyPlainKey(c, `  ${created.key}  `)).ok).toBe(true)
    })
})

describe('api-key-service.touch / usage', () => {

    it('touch 写 lastUsedTime', async () => {
        const {c} = await seed()
        const created = await add(c)
        expect(created.lastUsedTime).toBeNull()

        await apiKeyService.touch(c, created.keyId)
        expect((await apiKeyService.list(c, {}, USER))[0].lastUsedTime).toBeTruthy()
    })

    it('usage 按天聚合，failed 只数 >= 400', async () => {
        const {c} = await seed()
        const created = await add(c)

        await apiLogService.add(c, {keyId: created.keyId, userId: USER, method: 'GET', path: '/open/email/list', status: 200, duration: 3})
        await apiLogService.add(c, {keyId: created.keyId, userId: USER, method: 'GET', path: '/open/email/list', status: 200, duration: 4})
        await apiLogService.add(c, {keyId: created.keyId, userId: USER, method: 'GET', path: '/open/email/list', status: 403, duration: 1})
        await apiLogService.add(c, {keyId: created.keyId, userId: USER, method: 'GET', path: '/open/email/list', status: 500, duration: 1})

        const rows = await apiKeyService.usage(c, {keyId: created.keyId}, USER)
        expect(rows).toHaveLength(1)
        expect(rows[0].total).toBe(4)
        expect(rows[0].failed).toBe(2)
        expect(rows[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('usage 不含别人打的日志', async () => {
        const {c} = await seed()
        const created = await add(c)
        await apiLogService.add(c, {keyId: created.keyId, userId: OTHER, method: 'GET', path: '/open/email/list', status: 200, duration: 1})
        expect(await apiKeyService.usage(c, {keyId: created.keyId}, USER)).toEqual([])
    })

    it('7 天以前的不算进来', async () => {
        const {c, sqlite} = await seed()
        const created = await add(c)
        await apiLogService.add(c, {keyId: created.keyId, userId: USER, method: 'GET', path: '/open/email/list', status: 200, duration: 1})
        sqlite.prepare(`UPDATE api_log SET create_time = '2000-01-01 00:00:00'`).run()
        expect(await apiKeyService.usage(c, {keyId: created.keyId}, USER)).toEqual([])
    })
})
