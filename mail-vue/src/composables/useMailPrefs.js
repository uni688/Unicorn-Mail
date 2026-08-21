/**
 * useMailPrefs — 邮件区的「记住我上次的样子」（§7.4 密度、§7.5 阅读窗格、§7.6 远程图片）
 *
 * 一个模块级单例 + 一个 localStorage 键（`um-mail-prefs`），存 JSON。
 * 和 [[useBgEffect]] 的一键一值不同：这里五个字段总是一起读、经常一起写（换个密度顺手
 * 也会换窗格），拆五个键只会多五次 `try/catch`。
 *
 * 字段：
 *   - `density`  列表行高档位 'compact' | 'cozy' | 'roomy' → 44 / 56 / 72px（§7.4）
 *   - `pane`     阅读窗格位置 'right' | 'bottom' | 'off'（§7.5）；窄屏强制整页打开，
 *                那是布局层的事，不回写这里 —— 否则转一次屏设置就丢了
 *   - `timeSort` 0 倒序 / 1 正序（沿用后端 `list()` 的 `timeSort` 语义）
 *   - `showImages` 阅读窗格是否放行远程图片，默认 false（§7.6 默认屏蔽）
 *   - `recent`   最近用过的邮箱快照 `[{accountId, email, name}]`，≤5，给 Picker 的
 *                「最近」区用；存快照而不是只存 id，Picker 一打开就能画，不等分页回来
 *
 * 所有 setter 都做白名单校验：localStorage 是用户可改的，脏值不能让列表行高变成 NaN。
 */
import {reactive, computed} from 'vue'

const KEY = 'um-mail-prefs'

export const DENSITIES = ['compact', 'cozy', 'roomy']
export const PANES = ['right', 'bottom', 'off']
/** §7.4 三档行高；虚拟滚动按它算偏移，所以定义放这里统一 */
export const ROW_HEIGHT = {compact: 44, cozy: 56, roomy: 72}
export const RECENT_MAX = 5

const DEFAULTS = {density: 'cozy', pane: 'right', timeSort: 0, showImages: false, recent: []}

function sanitize(raw) {
    const out = {...DEFAULTS}
    if (!raw || typeof raw !== 'object') return out
    if (DENSITIES.includes(raw.density)) out.density = raw.density
    if (PANES.includes(raw.pane)) out.pane = raw.pane
    if (raw.timeSort === 1 || raw.timeSort === 0) out.timeSort = raw.timeSort
    out.showImages = raw.showImages === true
    out.recent = normalizeRecent(raw.recent)
    return out
}

/** 只留 `{accountId>0, email, name}` 三个字段：多存的字段迟早和后端对不上 */
function normalizeRecent(list) {
    if (!Array.isArray(list)) return []
    const seen = new Set()
    const out = []
    for (const item of list) {
        const accountId = Number(item?.accountId)
        if (!Number.isInteger(accountId) || accountId <= 0 || seen.has(accountId)) continue
        seen.add(accountId)
        out.push({accountId, email: String(item.email ?? ''), name: String(item.name ?? '')})
        if (out.length >= RECENT_MAX) break
    }
    return out
}

function read() {
    try {
        return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}'))
    } catch {
        return {...DEFAULTS}
    }
}

const prefs = reactive(read())

function persist() {
    try {
        localStorage.setItem(KEY, JSON.stringify({...prefs, recent: [...prefs.recent]}))
    } catch { /* 隐私模式：本次会话生效即可 */ }
}

function setDensity(value) {
    if (!DENSITIES.includes(value) || prefs.density === value) return
    prefs.density = value
    persist()
}

function setPane(value) {
    if (!PANES.includes(value) || prefs.pane === value) return
    prefs.pane = value
    persist()
}

function setTimeSort(value) {
    const next = Number(value) === 1 ? 1 : 0
    if (prefs.timeSort === next) return
    prefs.timeSort = next
    persist()
}

function setShowImages(value) {
    const next = value === true
    if (prefs.showImages === next) return
    prefs.showImages = next
    persist()
}

/** 最近使用置顶；重复的先摘掉再插到头部，超出 5 个丢尾巴 */
function pushRecent(account) {
    const accountId = Number(account?.accountId)
    if (!Number.isInteger(accountId) || accountId <= 0) return
    const next = [{accountId, email: account.email ?? '', name: account.name ?? ''}]
    for (const item of prefs.recent) {
        if (item.accountId !== accountId && next.length < RECENT_MAX) next.push(item)
    }
    prefs.recent = next
    persist()
}

/** 邮箱被删 / 改名后调用：留着的话「最近」会指向一个不存在的邮箱 */
function dropRecent(accountId) {
    const id = Number(accountId)
    const next = prefs.recent.filter(item => item.accountId !== id)
    if (next.length === prefs.recent.length) return
    prefs.recent = next
    persist()
}

/** 测试与「退出登录」用 */
function resetPrefs() {
    Object.assign(prefs, {...DEFAULTS, recent: []})
    try {
        localStorage.removeItem(KEY)
    } catch { /* 同上 */ }
}

const rowHeight = computed(() => ROW_HEIGHT[prefs.density] ?? ROW_HEIGHT.cozy)

export function useMailPrefs() {
    return {
        prefs, rowHeight,
        setDensity, setPane, setTimeSort, setShowImages,
        pushRecent, dropRecent, resetPrefs,
    }
}
