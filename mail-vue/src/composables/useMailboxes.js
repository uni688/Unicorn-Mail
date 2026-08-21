/**
 * useMailboxes — MailboxPicker 的数据源（§7.2 + §10.5 增量 6）
 *
 * 模块级单例，和 [[useCounts]] 同一套写法：侧栏顶部的 Picker、命令面板的「切换邮箱」、
 * 写信页的发信人下拉都读这一份，一次会话里 200 个邮箱只分页拉一次。
 *
 * 三条来自 §7.2 的硬约束：
 * 1. **首屏只拉第一页**（30 条，`accountService.list()` 的上限），剩下的滚动到底再拉。
 *    Picker 里塞 200 个邮箱是压测场景，不是让它一次性 DOM 化的理由。
 * 2. **搜索走服务端**（`/account/search`），120ms 防抖 + `AbortController`。本地
 *    `filter(mailboxes)` 只能搜到已经拉下来的那几页，用户搜第 137 个邮箱会搜不到。
 * 3. **`select()` 的副作用必须和命令面板一字不差**（`useCommandPalette.js:355`）：
 *    写 `currentAccountId` + `currentAccount`，再让调用方决定跳不跳路由。
 *
 * 缓存 60 秒，新增 / 删除 / 改名 / 置顶后调用 `invalidate()` 立刻失效 —— 邮箱列表变动
 * 都是用户自己刚做的操作，还看到旧列表会以为没生效。
 */
import {reactive, ref, computed} from 'vue'
import {accountList, accountSearch} from '@/request/account.js'
import {useAccountStore} from '@/store/account.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'

const PAGE_SIZE = 30
const SEARCH_SIZE = 20
const SEARCH_DEBOUNCE = 120
const TTL = 60_000

const mailboxes = reactive([])
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)

const keyword = ref('')
const results = reactive([])
const searching = ref(false)

let cursor = {sort: NaN, accountId: 0}
let fetchedAt = 0
let inflight = null
let searchTimer = null
let searchAbort = null
let searchSeq = 0
/** 被后一次输入取代的那个 promise 也要结掉，否则每敲一个字符都留一个永不 settle 的 promise */
let searchResolve = null

/**
 * 拉一页。游标是 `(sort DESC, accountId ASC)` 的最后一行 —— 后端 `list()` 就是按这两个
 * 字段做 keyset 分页的，用 offset 会在「置顶」改了 sort 之后漏项或重项。
 */
async function fetchPage(reset) {

    const first = reset || mailboxes.length === 0

    if (first) loading.value = true
    else loadingMore.value = true

    try {
        const list = await accountList(
            first ? 0 : cursor.accountId,
            PAGE_SIZE,
            first ? undefined : cursor.sort
        ) ?? []

        if (reset) mailboxes.length = 0
        mailboxes.push(...list)

        const last = list.at(-1)
        if (last) cursor = {sort: last.sort, accountId: last.accountId}

        hasMore.value = list.length >= PAGE_SIZE
        fetchedAt = Date.now()
        error.value = null
        return mailboxes
    } catch (e) {
        error.value = e
        return mailboxes
    } finally {
        loading.value = false
        loadingMore.value = false
    }
}

/** Picker 打开时调；缓存没过期就直接用，同一时刻只有一个请求在飞 */
function ensureFirstPage({force = false} = {}) {

    const fresh = mailboxes.length > 0 && Date.now() - fetchedAt < TTL

    if (!force && fresh) return Promise.resolve(mailboxes)
    if (inflight) return inflight

    inflight = fetchPage(true).finally(() => {
        inflight = null
    })

    return inflight
}

/** 滚动到底部触发 */
function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value || inflight) {
        return Promise.resolve(mailboxes)
    }
    return fetchPage(false)
}

/**
 * 搜索。防抖 120ms + 取消上一个请求 + `searchSeq` 兜底：
 * abort 不是同步生效的，慢的那个请求仍可能在快的之后 resolve，只靠 abort 会把旧结果画上去。
 */
function search(next) {

    keyword.value = String(next ?? '')
    const kw = keyword.value.trim()

    clearTimeout(searchTimer)
    searchTimer = null
    searchResolve?.(results)
    searchResolve = null
    searchAbort?.abort()
    searchAbort = null
    searchSeq++

    if (!kw) {
        results.length = 0
        searching.value = false
        return Promise.resolve(results)
    }

    searching.value = true

    return new Promise(resolve => {
        searchResolve = resolve
        searchTimer = setTimeout(() => {
            searchTimer = null
            searchResolve = null
            runSearch(kw).then(resolve)
        }, SEARCH_DEBOUNCE)
    })
}

async function runSearch(kw) {

    const mySeq = ++searchSeq
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    searchAbort = controller

    try {
        const list = await accountSearch(kw, SEARCH_SIZE, controller?.signal) ?? []
        if (mySeq !== searchSeq) return results
        results.length = 0
        results.push(...list)
        return results
    } catch {
        // 取消导致的报错和真失败一样处理：清空结果，不弹提示（accountSearch 已 noMsg）
        if (mySeq === searchSeq) results.length = 0
        return results
    } finally {
        if (mySeq === searchSeq) {
            searching.value = false
            searchAbort = null
        }
    }
}

/** 新增 / 删除 / 改名 / 置顶后调用：下次打开 Picker 重新拉第一页 */
function invalidate({reload = false} = {}) {
    fetchedAt = 0
    cursor = {sort: NaN, accountId: 0}
    hasMore.value = true
    results.length = 0
    keyword.value = ''
    return reload ? ensureFirstPage({force: true}) : Promise.resolve(mailboxes)
}

/** 测试与「退出登录」用：邮箱列表是账号私有数据，换人登录必须清掉 */
function resetMailboxes() {
    clearTimeout(searchTimer)
    searchTimer = null
    searchResolve?.(results)
    searchResolve = null
    searchAbort?.abort()
    searchAbort = null
    searchSeq++
    mailboxes.length = 0
    results.length = 0
    keyword.value = ''
    hasMore.value = true
    loading.value = false
    loadingMore.value = false
    searching.value = false
    error.value = null
    fetchedAt = 0
    inflight = null
    cursor = {sort: NaN, accountId: 0}
}

/** 「全部邮箱」这一项：accountId 0 → `/email/list` 走 `allReceive=1`，后端不需要改 */
export const ALL_MAILBOXES = {accountId: 0, email: '', name: '', all: true}

export function useMailboxes() {

    const accountStore = useAccountStore()
    const {prefs, pushRecent, dropRecent} = useMailPrefs()

    const currentAccountId = computed(() => Number(accountStore.currentAccountId) || 0)

    /**
     * 「最近」区：以 prefs 里的快照为顺序，但字段优先取分页拿回来的实时行
     * （改过名的邮箱不能在这里还显示旧名字）。当前邮箱不重复出现在最近里。
     */
    const recent = computed(() => prefs.recent
        .filter(item => item.accountId !== currentAccountId.value)
        .map(item => mailboxes.find(row => row.accountId === item.accountId) ?? item))

    /**
     * 选中一个邮箱。副作用和 `useCommandPalette.js:355` 完全一致（两个入口选出来的状态
     * 必须一模一样），额外记一笔「最近」。跳路由留给调用方 —— 命令面板要 `go('email')`，
     * 侧栏的 Picker 已经在邮件页上了，再跳一次会把 `:emailId` 冲掉。
     */
    function select(account) {

        const target = account ?? ALL_MAILBOXES
        const accountId = Number(target.accountId) || 0

        accountStore.currentAccountId = accountId
        accountStore.currentAccount = accountId > 0 ? target : {}

        if (accountId > 0) pushRecent(target)
        return target
    }

    /** 邮箱被删：列表、最近、当前选中三处都要摘掉，否则会停在一个不存在的邮箱上 */
    function remove(accountId) {
        const id = Number(accountId)
        const idx = mailboxes.findIndex(row => row.accountId === id)
        if (idx > -1) mailboxes.splice(idx, 1)
        dropRecent(id)
        if (currentAccountId.value === id) select(ALL_MAILBOXES)
    }

    return {
        mailboxes, recent, results, keyword,
        hasMore, loading, loadingMore, searching, error,
        currentAccountId,
        ensureFirstPage, loadMore, search, invalidate, select, remove, resetMailboxes,
    }
}
