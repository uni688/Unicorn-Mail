/**
 * D1 的替身：`node:sqlite` + 一层 D1 形状的包装。
 *
 * 为什么要它：service 层的行为大半是 **SQL 的行为**（`COLLATE NOCASE` 匹配、
 * SQLite 把负 LIMIT 当无限制、`datetime('now', ?)` 的相对时间、`del_time IS NULL`
 * 的补写），拿 mock 断言「调了哪个方法」验不出这些。D1 底下就是 SQLite，
 * 所以让真的 SQL 跑在真的 SQLite 上，只把 `D1Database` 这一层接口补出来。
 *
 * 只实现被用到的那一小块 API，形状按 drizzle 的 d1 driver（`drizzle-orm/d1/session`）来：
 *   - `prepare(sql)` → 语句；`bind(...)` 返回**新**语句（driver 会拿同一个 stmt 反复 bind）
 *   - `all()` → `{results, success, meta}`；`first()` → 第一行；`run()` → `{success, meta}`
 *   - `raw()` → 二维数组（driver 的 `.values()` 走这条）
 *   - `batch([...])` → 顺序执行，返回和入参同序的结果数组
 *
 * 与真 D1 的已知差异（写在这里省得下一个人再查一遍）：
 *   - 没有真正的批事务：`batch()` 是顺序执行，中途失败不回滚；
 *   - `meta` 只有 `changes` / `last_row_id` / `duration`，没有 `rows_read` 之类的计费字段；
 *   - `run()` 也允许 SELECT（真 D1 同样允许）。
 */
import {DatabaseSync} from 'node:sqlite'

/** D1 接受 boolean（转 0/1）与 undefined（转 NULL），node:sqlite 两个都会抛 */
function normalize(value) {
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value === undefined) return null
    if (value instanceof Date) return value.toISOString()
    return value
}

class ShimStatement {

    constructor(db, sql, params = []) {
        this.db = db
        this.sql = sql
        this.params = params
    }

    bind(...params) {
        return new ShimStatement(this.db, this.sql, params.map(normalize))
    }

    /** 每次执行都重新 prepare：node:sqlite 的语句对象不持有绑定值，重用没有收益 */
    #exec() {
        const stmt = this.db.prepare(this.sql)
        const started = performance.now()
        const rows = stmt.all(...this.params)
        return {rows, meta: {changes: this.db.changes ?? 0, duration: performance.now() - started}}
    }

    async all() {
        const {rows, meta} = this.#exec()
        return {results: rows, success: true, meta}
    }

    async first(column) {
        const {rows} = this.#exec()
        const row = rows[0]
        if (!row) return null
        return column === undefined ? row : row[column]
    }

    async run() {
        const stmt = this.db.prepare(this.sql)
        const started = performance.now()
        const info = stmt.run(...this.params)
        return {
            results: [],
            success: true,
            meta: {
                changes: Number(info.changes ?? 0),
                last_row_id: Number(info.lastInsertRowid ?? 0),
                duration: performance.now() - started,
            },
        }
    }

    async raw() {
        const {rows} = this.#exec()
        return rows.map((row) => Object.values(row))
    }
}

/** @returns {{db: object, close: () => void, sqlite: DatabaseSync}} D1 形状的替身 */
export function createD1() {

    const sqlite = new DatabaseSync(':memory:')
    // 外键约束真 D1 默认也是开的；不开的话「删邮件留下孤立附件」这类断言会失真
    sqlite.exec('PRAGMA foreign_keys = ON')

    const db = {
        prepare: (sql) => new ShimStatement(sqlite, sql),
        async batch(statements) {
            const out = []
            for (const statement of statements) out.push(await statement.all())
            return out
        },
        async exec(sql) {
            sqlite.exec(sql)
            return {count: 0, duration: 0}
        },
        dump() {
            throw new Error('dump() 没有实现：测试里用不到')
        },
    }

    return {db, sqlite, close: () => sqlite.close()}
}

/** KV 替身。`settingService` / `kvObjService` 只用 get / put / delete / list */
export function createKv() {

    const store = new Map()

    return {
        async get(key, options) {
            const hit = store.get(key)
            if (hit === undefined) return null
            if (options?.type === 'json' || options === 'json') return JSON.parse(hit.value)
            if (options?.type === 'arrayBuffer') return hit.value
            return hit.value
        },
        async getWithMetadata(key, options) {
            const hit = store.get(key)
            if (hit === undefined) return {value: null, metadata: null}
            return {value: await this.get(key, options), metadata: hit.metadata ?? null}
        },
        async put(key, value, options) {
            store.set(key, {value, metadata: options?.metadata ?? null})
        },
        async delete(key) {
            store.delete(key)
        },
        async list({prefix = ''} = {}) {
            const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({name}))
            return {keys, list_complete: true, cursor: undefined}
        },
        _store: store,
    }
}
