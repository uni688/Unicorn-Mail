/**
 * useQuota 的判定分支。这一层是从旧顶栏（`layout/header/index.vue:100-159`）60 行模板
 * 内联 computed 里搬出来的，**分支一条都没改**，所以测试的意义就是「搬家没搬错」：
 *
 * - 发信 7 支里只有 `day` / `count` 有数字（`sendMetered`），其余五支画进度条都是假信息
 * - 优先级是「站长关掉 > 无权限 > 角色禁发/仅站内 > 无上限 > 有上限」，顺序错了会出现
 *   「站长已关闭发信，却显示还能发 47 封」
 * - 邮箱侧只知上限、不知已用，所以永远没有进度条（后端没这个数）
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useUserStore} from '@/store/user.js'
import {useSettingStore} from '@/store/setting.js'
import {useQuota} from './useQuota.js'

// 文案只要能区分分支就够，这里回显 key 本身；参数插值单独断言。
// 只能替掉 `useI18n` 一个导出：`store/setting.js` 顺着 axios 会拉起 `i18n/index.js`，
// 那里在模块顶层 `createI18n()` —— 整个模块替干净了它就 import 不下去。
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({
        t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    }),
}))

/** `hasPerm` 读的是 `userStore.user.permKeys`（`perm/perm.js`），不是 localStorage */
function setup({role = {}, user = {}, settings = {}, perms = ['email:send', 'account:add']} = {}) {
    setActivePinia(createPinia())
    const userStore = useUserStore()
    const settingStore = useSettingStore()
    userStore.user = {sendCount: 0, permKeys: perms, ...user, role}
    settingStore.settings = {send: 0, manyEmail: 0, addEmail: 0, ...settings}
    return useQuota()
}

beforeEach(() => {
    localStorage.clear()
})

describe('useQuota · 发信额度的 7 支', () => {
    it('站长关掉发信 → disabled，压过一切角色配置', () => {
        const q = setup({settings: {send: 1}, role: {sendType: 'day', sendCount: 50}})
        expect(q.sendState.value).toBe('disabled')
        expect(q.sendMetered.value).toBe(false)
    })

    it('没有 email:send → unauthorized（哪怕角色给了额度）', () => {
        const q = setup({perms: [], role: {sendType: 'day', sendCount: 50}})
        expect(q.sendState.value).toBe('unauthorized')
    })

    it('角色禁发 / 仅站内各自成一支', () => {
        expect(setup({role: {sendType: 'ban'}}).sendState.value).toBe('banned')
        expect(setup({role: {sendType: 'internal'}}).sendState.value).toBe('internal')
    })

    it('sendCount 为 0 或缺失都是 unlimited —— 不是「一封都不能发」', () => {
        expect(setup({role: {sendType: 'day', sendCount: 0}}).sendState.value).toBe('unlimited')
        expect(setup({role: {sendType: 'day'}}).sendState.value).toBe('unlimited')
        expect(setup({role: {}}).sendState.value).toBe('unlimited')
    })

    it('day / count 是唯二有数字的支，进度条与「还能发几封」都只在这里出现', () => {
        const day = setup({role: {sendType: 'day', sendCount: 50}, user: {sendCount: 3}})
        expect(day.sendState.value).toBe('day')
        expect(day.sendMetered.value).toBe(true)
        expect(day.sendLimit.value).toBe(50)
        expect(day.sendUsed.value).toBe(3)
        expect(day.sendLeft.value).toBe(47)
        expect(day.sendValueText.value).toBe('3 / 50')
        expect(day.sendHint.value).toBe('shell.quotaRemainDay:{"n":47}')

        const count = setup({role: {sendType: 'count', sendCount: 10}, user: {sendCount: 10}})
        expect(count.sendState.value).toBe('count')
        expect(count.sendHint.value).toBe('shell.quotaRemainTotal:{"n":0}')
    })

    it('已发超过上限时剩余夹到 0，不出现负数', () => {
        const q = setup({role: {sendType: 'day', sendCount: 5}, user: {sendCount: 9}})
        expect(q.sendLeft.value).toBe(0)
        expect(q.sendValueText.value).toBe('9 / 5')
    })

    it('没数字的支里，那句人话就等于状态词本身（不重复念一遍）', () => {
        const q = setup({role: {sendType: 'ban'}})
        expect(q.sendHint.value).toBe(q.sendLabel.value)
        expect(q.sendLabel.value).toBe('sendBanned')
    })

    it('状态 → 文案键的映射用的是既有顶层键，没有为同一句话再造一套', () => {
        expect(setup({settings: {send: 1}}).sendLabel.value).toBe('disabled')
        expect(setup({perms: []}).sendLabel.value).toBe('unauthorized')
        expect(setup({role: {}}).sendLabel.value).toBe('unlimited')
        expect(setup({role: {sendType: 'day', sendCount: 1}}).sendLabel.value).toBe('daily')
        expect(setup({role: {sendType: 'count', sendCount: 1}}).sendLabel.value).toBe('total')
    })
})

describe('useQuota · 邮箱额度', () => {
    it('站长关掉加邮箱（两个开关任一）→ disabled', () => {
        expect(setup({settings: {manyEmail: 1}}).accountState.value).toBe('disabled')
        expect(setup({settings: {addEmail: 1}}).accountState.value).toBe('disabled')
    })

    it('没有 account:add → unauthorized', () => {
        expect(setup({perms: ['email:send']}).accountState.value).toBe('unauthorized')
    })

    it('有上限是 limited，文案带数字；没上限是 unlimited', () => {
        const limited = setup({role: {accountCount: 20}})
        expect(limited.accountState.value).toBe('limited')
        expect(limited.accountLimit.value).toBe(20)
        expect(limited.accountLabel.value).toBe('totalUserAccount:{"msg":20}')

        const unlimited = setup({role: {accountCount: 0}})
        expect(unlimited.accountState.value).toBe('unlimited')
        expect(unlimited.accountLabel.value).toBe('unlimited')
    })

    it('邮箱侧不给已用数 —— 组件那边靠这一点决定不画进度条', () => {
        const q = setup({role: {accountCount: 20}})
        expect(q).not.toHaveProperty('accountUsed')
    })
})

describe('useQuota · 未登录', () => {
    /**
     * `/_ds` 是公开路由却挂了 MiniQuota；未登录时 `userStore.user` 就是 `{}`，
     * 连 `permKeys` 都没有。这一支要的是「两行都优雅退化成 unauthorized」，
     * 而不是 `hasPerm` 里解构出 undefined 再 `.includes` 抛异常（见 perm/perm.js）。
     */
    it('user 是空对象时两行都走 unauthorized，不抛异常', () => {
        setActivePinia(createPinia())
        useUserStore().user = {}
        useSettingStore().settings = {}
        const q = useQuota()
        expect(q.sendState.value).toBe('unauthorized')
        expect(q.accountState.value).toBe('unauthorized')
        expect(q.sendMetered.value).toBe(false)
    })
})
