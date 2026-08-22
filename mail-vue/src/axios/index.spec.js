/**
 * axios 拦截器单测（审计 P2-6）。
 *
 * 只测两条**改过**的路径，其余分支（网络错误 / 超时 / 502 文案）没动：
 *
 * 1. HTTP 层 403：从前是 `location.reload(); return;` —— `return undefined` 让一个
 *    **被拒绝**的请求变成 resolved undefined，调用方的 `.then(d => d.list)` 以 TypeError
 *    收场而不是走 `.catch`；而且 403 稳定复现时会 reload → 再 403 → 再 reload 无限刷。
 *    现在：一次会话最多自动刷一次（sessionStorage 哨兵），永远 reject。
 * 2. 业务 401：除了删 token，还要走 `endSession()` 把账号私有状态清掉（P2-5）。
 *
 * `ElMessage` 在应用里由 unplugin-auto-import 注入，测试环境没有那个插件，
 * 所以模块里的自由变量会落到 globalThis —— 这里直接给它一个 spy。
 *
 * jsdom 的 `location.reload` 是 read-only 且不可 redefine（`{w:false,c:false}`），
 * 换不成 spy；所以只有一个用例真的走到刷新那一步，它会在跑测试时留下一条
 * "Not implemented: navigation to another Document" —— 那是 jsdom 的日志，不是失败。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'

const replace = vi.fn(() => Promise.resolve())

vi.mock('@/router', () => ({default: {replace: (to) => replace(to)}}))

const http = (await import('@/axios/index.js')).default

/** axios 把拦截器存在 handlers 里，直接取出来当普通函数调 */
const handlers = http.interceptors.response.handlers[0]
const onFulfilled = (res) => handlers.fulfilled(res)
const onRejected = (error) => handlers.rejected(error)

const RELOAD_KEY = 'um-403-reloaded'

beforeEach(() => {
    replace.mockClear()
    sessionStorage.clear()
    localStorage.setItem('token', 'tok-a')
    globalThis.ElMessage = vi.fn()
})

afterEach(() => {
    delete globalThis.ElMessage
})

describe('HTTP 403', () => {

    it('第一次 403：记下哨兵（允许刷一次），但依旧 reject —— 不再变成 resolved undefined', async () => {
        const error = {status: 403, config: {noMsg: true}}
        await expect(onRejected(error)).rejects.toBe(error)
        expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1')
    })

    it('哨兵还在就不再刷，但仍然 reject 并弹提示（403 稳定复现时不无限刷）', async () => {
        sessionStorage.setItem(RELOAD_KEY, '1')
        const error = {status: 403, config: {}, message: 'Request failed', response: {status: 403}}
        await expect(onRejected(error)).rejects.toBe(error)
        expect(globalThis.ElMessage).toHaveBeenCalled()
    })

    it('请求恢复正常后撤掉哨兵：下一次真 403 还允许刷一次', async () => {
        sessionStorage.setItem(RELOAD_KEY, '1')
        await onFulfilled({data: {code: 200, data: {ok: 1}}, config: {}})
        expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
    })

    it('axios 内部错误（没有 config）也不炸 —— 旧代码读 error.config.noMsg', async () => {
        sessionStorage.setItem(RELOAD_KEY, '1')
        const error = {status: 403, message: 'Request aborted'}
        await expect(onRejected(error)).rejects.toBe(error)
    })
})

describe('业务 401', () => {

    it('删 token + 跳登录页（清状态由 endSession 负责）', async () => {
        const data = {code: 401, message: '登录已过期'}

        await expect(onFulfilled({data, config: {}})).rejects.toBe(data)

        expect(localStorage.getItem('token')).toBeNull()
        // dropSession 里是动态 import，等一轮微任务它才落地
        await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    })
})
