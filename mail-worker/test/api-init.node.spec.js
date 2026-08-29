/**
 * `v3_2DB()` 的幂等性 —— P4 §0.6 / §0.7 要求迁移能重复执行。
 *
 * 这条用例存在的理由很具体：`/api/init/<secret>` 是**手动**接口，部署后被点两次
 * （或者用户按 F5）在真实使用里就发生过。迁移链没有版本表，唯一的护栏就是每条语句
 * 自身的幂等写法（`IF NOT EXISTS` / `INSERT … WHERE NOT EXISTS`）。所以这里连跑两次
 * 真的 `dbInit.init()`，断言：
 *   1. 第二次仍然返回 `success`（不是某条语句抛出后被 catch 掉的 `❌`）；
 *   2. perm 行没有翻倍 —— 权限树里出现两个「API密钥查看」比报错更难发现；
 *   3. 新建的两张表和五个索引都在。
 *
 * 顺带把 §0.6 的「三处必须同时改」钉住：`premKey` 里的每个 P4 权限键，
 * 在 perm 表里都得有对应的行，否则那个键永远匹配不上，接口就是永久 403。
 */
import {afterEach, describe, expect, it} from 'vitest'
import {setupEnv} from './helpers/env.js'

let env

afterEach(() => {
    env?.close()
    env = undefined
})

/** 表上的索引名集合 */
function indexNames(sqlite, table) {
    return sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
        .all(table).map(row => row.name)
}

describe('init.v3_2DB', () => {

    it('建出 api_key / api_log 两张表和五个索引', async () => {
        env = await setupEnv()
        const {sqlite} = env

        const tables = sqlite.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('api_key', 'api_log')`,
        ).all().map(row => row.name)
        expect(tables.sort()).toEqual(['api_key', 'api_log'])

        expect(indexNames(sqlite, 'api_key')).toEqual(
            expect.arrayContaining(['idx_api_key_user', 'idx_api_key_prefix']),
        )
        expect(indexNames(sqlite, 'api_log')).toEqual(
            expect.arrayContaining(['idx_api_log_time', 'idx_api_log_key', 'idx_api_log_user']),
        )
    })

    it('idx_api_key_prefix 是唯一索引（前缀是鉴权的查找键，重了就会命中错的 Key）', async () => {
        env = await setupEnv()
        const {sqlite} = env
        const row = sqlite.prepare(
            `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_api_key_prefix'`,
        ).get()
        expect(row.sql).toMatch(/UNIQUE/i)
    })

    it('perm 行 37–42 各一条，权限键与 name 都是新的', async () => {
        env = await setupEnv()
        const {sqlite} = env

        const rows = sqlite.prepare(
            `SELECT perm_id, name, perm_key, pid, type FROM perm WHERE perm_id BETWEEN 37 AND 42 ORDER BY perm_id`,
        ).all()

        expect(rows.map(row => [row.perm_id, row.name, row.perm_key])).toEqual([
            [37, '开发者', null],
            [38, 'API密钥查看', 'api-key:query'],
            [39, 'API密钥创建', 'api-key:add'],
            [40, 'API密钥修改', 'api-key:set'],
            [41, 'API密钥删除', 'api-key:delete'],
            [42, '请求日志查看', 'api-log:query'],
        ])
        // 37 是分组（type=1，pid=0），38–42 挂在它下面且都是按钮级（type=2）
        expect(rows[0].type).toBe(1)
        expect(rows.slice(1).every(row => row.pid === 37 && row.type === 2)).toBe(true)
    })

    /**
     * `perm-service.tree()` 用 `t('perms.' + name)` 翻译权限名，所以 name 必须唯一。
     * reg-key 已经占了「密钥查看 / 密钥添加 / 密钥删除」——重名不会报错，只会让 API 密钥
     * 的权限点在角色树里显示成邀请码的文案，是那种上线半年才有人发现的 bug。
     *
     * 只断言 **P4 新增的 6 行**与全表不重名，不断言全表两两不重名：仓库里已经存在一对
     * 历史重名（`perm_id` 2 `email:delete` 与 29 `all-email:delete` 都叫「邮件删除」，
     * 前者在「邮件」组、后者在「邮件列表」组）。改它要 UPDATE 已有行，而 §0.7 限定
     * `v3_2DB()` 只能做 `IF NOT EXISTS` / `INSERT … WHERE NOT EXISTS`，不许改存量数据 ——
     * 所以那一对留给独立的修复，这里如实记录，不让它把 P4 的护栏拖成红灯。
     */
    it('P4 的 6 个 perm.name 与全表都不重名', async () => {
        env = await setupEnv()
        const {sqlite} = env
        const dup = sqlite.prepare(
            `SELECT p.perm_id, p.name FROM perm p
             WHERE p.perm_id BETWEEN 37 AND 42
               AND EXISTS (SELECT 1 FROM perm o WHERE o.name = p.name AND o.perm_id <> p.perm_id)`,
        ).all()
        expect(dup).toEqual([])
    })

    /** 上面提到的历史重名：钉住现状，修掉之后这条会红，提醒把上面那条收紧成全表 */
    it('全表仅剩一对历史重名（P4 没有新增重名）', async () => {
        env = await setupEnv()
        const {sqlite} = env
        const dup = sqlite.prepare(
            `SELECT name, COUNT(*) AS n FROM perm GROUP BY name HAVING n > 1 ORDER BY name`,
        ).all()
        expect(dup).toEqual([{name: '邮件删除', n: 2}])
    })

    it('连跑两次不报错，且 perm 行不翻倍', async () => {
        env = await setupEnv()
        const {c, sqlite} = env

        const before = sqlite.prepare(`SELECT COUNT(*) AS n FROM perm`).get().n

        const {dbInit} = await import('../src/init/init.js')
        await expect(dbInit.init(c)).resolves.toBe('success')

        expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM perm`).get().n).toBe(before)
        expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM perm WHERE perm_id BETWEEN 37 AND 42`).get().n).toBe(6)
    })

    /**
     * §0.6：新增接口要同时改 `requirePerms[]`、`premKey{}`、`v3_2DB()` 的 perm 行。
     * 前两处在 `security.js` 里，第三处在库里；这条用例把「库里有没有」这一半钉住 ——
     * 漏了的话对应接口对所有非 admin 角色都是 403，而且没有任何报错。
     */
    it('P4 的五个权限键在 perm 表里都能查到', async () => {
        env = await setupEnv()
        const {sqlite} = env
        const keys = ['api-key:query', 'api-key:add', 'api-key:set', 'api-key:delete', 'api-log:query']
        for (const key of keys) {
            const row = sqlite.prepare(`SELECT perm_id FROM perm WHERE perm_key = ?`).get(key)
            expect(row, `perm_key ${key} 不在 perm 表里`).toBeTruthy()
        }
    })
})
