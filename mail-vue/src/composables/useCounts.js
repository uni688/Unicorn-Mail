/**
 * useCounts — 侧栏 / Picker 的角标（P3 增量 1，§10.5）。
 *
 * 一个模块级单例：侧栏、命令条、Picker 都读同一份数字，切一次邮箱只发一个请求。
 *
 * 规则来自 §10.5：
 *   - 计数的过滤条件必须和 `/email/list` 完全一致（后端 `emailService.counts` 里就是照
 *     `list()` 抄的谓词），所以这里不做任何本地推算，只显示后端给的数；
 *   - 不缓存到 KV（后端）也不设 TTL（前端）：删除 / 已读 / 星标之后 `refresh()` 重新取，
 *     宁可多一个请求也不要「侧栏 3 封未读、点进去 0 封」；
 *   - 草稿是 Dexie 本地库，后端没有也不该有草稿计数，`draft` 由 `useDraftCount` 那边算。
 *
 * 切邮箱时会先把数字清成 null（显示成没有角标），而不是留着上一个邮箱的数 —— 角标停留
 * 在旧值一两百毫秒，比没有角标更容易让人误判。
 */
import {reactive, ref} from 'vue'
import {emailCounts} from '@/request/email.js'
import {useAccountStore} from '@/store/account.js'

const EMPTY = {inbox: null, unread: null, star: null, code: null, trash: null, sent: null}

const counts = reactive({...EMPTY})
/** accountId → 未读数，只给 Picker 的「最近」用（§10.5：只有最近列表显示未读角标） */
const unreadMap = reactive({})
const loading = ref(false)
const error = ref(null)

let scopeKey = ''
let inflight = null
let debounceTimer = null

function assign(data) {
    counts.inbox = Number(data.inbox ?? 0)
    counts.unread = Number(data.unread ?? 0)
    counts.star = Number(data.star ?? 0)
    counts.code = Number(data.code ?? 0)
    counts.trash = Number(data.trash ?? 0)
    counts.sent = Number(data.sent ?? 0)
}

/**
 * 立刻取一次。accountId 为 0 / 'all' 时取全部邮箱聚合。
 * 同一 scope 已有请求在飞就复用，不重复发。
 */
function fetchNow() {

    const accountStore = useAccountStore()
    const accountId = Number(accountStore.currentAccountId) || 0
    const params = accountId > 0 ? {accountId} : {all: 1}
    const key = JSON.stringify(params)

    if (inflight && key === scopeKey) return inflight

    if (key !== scopeKey) {
        Object.assign(counts, EMPTY)
    }

    scopeKey = key
    loading.value = true

    const req = emailCounts(params).then(data => {
        // 期间又切了邮箱：这次的结果作废
        if (scopeKey !== key) return counts
        assign(data ?? {})
        error.value = null
        return counts
    }).catch(e => {
        if (scopeKey === key) error.value = e
        return counts
    }).finally(() => {
        if (inflight === req) inflight = null
        if (scopeKey === key) loading.value = false
    })

    inflight = req
    return req
}

/**
 * 合并短时间内的多次请求（删一批邮件会连着触发列表、阅读窗格、命令条三处刷新）。
 * force 用于「切邮箱」这类必须立刻反映的场合。
 */
function refresh({force = false, delay = 250} = {}) {

    if (force) {
        clearTimeout(debounceTimer)
        debounceTimer = null
        return fetchNow()
    }

    if (debounceTimer) return Promise.resolve(counts)

    return new Promise(resolve => {
        debounceTimer = setTimeout(() => {
            debounceTimer = null
            fetchNow().then(resolve)
        }, delay)
    })
}

/**
 * 批量未读数，给 Picker 的「最近」区（最多 5 个，后端也只接 5 个）。
 * 失败就静默：角标没有比角标错更好。
 */
function refreshUnread(accountIds = []) {

    const ids = accountIds.map(Number).filter(id => Number.isInteger(id) && id > 0).slice(0, 5)

    if (ids.length === 0) return Promise.resolve(unreadMap)

    return emailCounts({accountIds: ids.join(',')}).then(data => {
        Object.assign(unreadMap, data?.unreadMap ?? {})
        return unreadMap
    }).catch(() => unreadMap)
}

/** 测试与「退出登录」用：把单例恢复成初始状态 */
function resetCounts() {
    clearTimeout(debounceTimer)
    debounceTimer = null
    inflight = null
    scopeKey = ''
    loading.value = false
    error.value = null
    Object.assign(counts, EMPTY)
    Object.keys(unreadMap).forEach(k => delete unreadMap[k])
}

export function useCounts() {
    return {counts, unreadMap, loading, error, refresh, refreshUnread, resetCounts}
}
