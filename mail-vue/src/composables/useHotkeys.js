/**
 * useHotkeys — 全站唯一的快捷键引擎（§7.1）
 *
 * 结构是「一个全局监听器 + 一张运行时注册表 + 一份静态目录」：
 *
 * - **全局监听器**：`useEventListener` 挂在 `window` 上，跑在**冒泡阶段**。不用捕获，
 *   因为浮层（Reka 的 DismissableLayer、vaul）要先吃掉 Esc；同理见到
 *   `event.defaultPrevented` 就直接放手，别和它们抢。监听器挂在一个 detached
 *   `effectScope` 里，所以第一个注册者卸载时不会顺手把它拆掉。
 * - **运行时注册表**：`useHotkeys()` 在组件里登记，`onScopeDispose` 自动注销。
 *   同一个键被多处登记时**后注册的赢**（列表页的 `x` 应该压住全局的），
 *   因为深层组件总是后挂载。
 * - **静态目录** `HOTKEY_CATALOG`：§7.1 那张表的全文。`?` 面板照它渲染，
 *   再用注册表判断「当前页是否可用」来决定是否置灰 —— 这样面板不会因为
 *   某个页面忘了注册就少一行，反过来也不会把没实现的键说成能用。
 *
 * §7.1 的硬性约束：**焦点在 `input/textarea/[contenteditable]` 或 IME 组合中时，
 * 单字母键全部失效**。实现在 `isTypingContext()` + `needsModifier()`：文本上下文里
 * 只放行带 Mod/Ctrl/Alt 的组合键和命名键（Esc、Enter、方向键…），
 * 任何「单个可打印字符」一律不响应，序列键（`g i`）也一样进不来。
 * `event.isComposing` 与 `keyCode === 229`（部分 IME 在 compositionstart 之前
 * 就发 keydown，此时 isComposing 还是 false）双重拦截。
 */
import {computed, effectScope, getCurrentScope, onScopeDispose, reactive, ref, unref} from 'vue'
import {useEventListener} from '@vueuse/core'

/** 序列键（`g` 之后再按一个）的等待窗口 */
const SEQUENCE_TIMEOUT = 1200
/** 同一个键连按算「双击」的窗口（§7.1 的 `⌘⇧E` 连按两次） */
const DOUBLE_TAP_WINDOW = 600
/** 整体开关的持久化键；P5 落库到 `user_setting` 后这里改成读 prefs（§7.1 末句） */
const ENABLED_KEY = 'um-hotkeys'

const isMac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

/* ------------------------------------------------------------------ 作用域 */

/** `?` 面板的分组顺序，与 §7.1 表格的行顺序一致 */
export const HOTKEY_SCOPES = ['global', 'sidebar', 'list', 'read', 'compose', 'table', 'dialog']

/**
 * §7.1 全文。`id` 是注册时的引用键，`keys` 用 Kbd 认得的写法（`Mod` 会按平台渲染），
 * `perm` 存在时无权限就**整行不出现**（§7.1：「无权限时不响应且不出现在 `?` 面板」）。
 * `label` 是 i18n key，落在 `hotkey.*`。
 */
export const HOTKEY_CATALOG = [
    {id: 'palette', scope: 'global', keys: 'Mod+K', label: 'palette'},
    {id: 'search', scope: 'global', keys: '/', label: 'search'},
    {id: 'compose', scope: 'global', keys: 'c', label: 'compose'},
    {id: 'go-inbox', scope: 'global', keys: 'g i', label: 'goInbox'},
    {id: 'go-sent', scope: 'global', keys: 'g s', label: 'goSent'},
    {id: 'go-draft', scope: 'global', keys: 'g d', label: 'goDraft'},
    {id: 'go-star', scope: 'global', keys: 'g t', label: 'goStar'},
    {id: 'go-trash', scope: 'global', keys: 'g x', label: 'goTrash'},
    {id: 'settings', scope: 'global', keys: ',', label: 'settings'},
    {id: 'go-mailboxes', scope: 'global', keys: 'g m', label: 'goMailboxes'},
    {id: 'go-keys', scope: 'global', keys: 'g k', label: 'goKeys'},
    {id: 'go-admin', scope: 'global', keys: 'g a', label: 'goAdmin', perm: 'setting:query'},
    {id: 'mailbox-picker', scope: 'global', keys: 'Mod+Shift+E', label: 'mailboxPicker'},
    {id: 'theme', scope: 'global', keys: 'Mod+Shift+L', label: 'theme'},
    {id: 'shortcuts', scope: 'global', keys: '?', label: 'shortcuts'},
    {id: 'escape', scope: 'global', keys: 'Esc', label: 'escape'},

    {id: 'folder-up', scope: 'sidebar', keys: 'Alt+Up', label: 'folderUp'},
    {id: 'folder-down', scope: 'sidebar', keys: 'Alt+Down', label: 'folderDown'},
    {id: 'group-collapse', scope: 'sidebar', keys: 'Alt+Left', label: 'groupCollapse'},
    {id: 'group-expand', scope: 'sidebar', keys: 'Alt+Right', label: 'groupExpand'},
    {id: 'folder-menu', scope: 'sidebar', keys: 'Shift+F10', label: 'folderMenu'},

    {id: 'next-mail', scope: 'list', keys: 'j', label: 'nextMail'},
    {id: 'prev-mail', scope: 'list', keys: 'k', label: 'prevMail'},
    {id: 'open-mail', scope: 'list', keys: 'Enter', label: 'openMail'},
    {id: 'toggle-check', scope: 'list', keys: 'x', label: 'toggleCheck'},
    {id: 'range-check', scope: 'list', keys: 'Shift+X', label: 'rangeCheck'},
    {id: 'check-all', scope: 'list', keys: 'a', label: 'checkAll'},
    {id: 'star', scope: 'list', keys: 's', label: 'star'},
    {id: 'toggle-unread', scope: 'list', keys: 'u', label: 'toggleUnread'},
    {id: 'delete', scope: 'list', keys: '#', label: 'delete'},
    {id: 'pane', scope: 'list', keys: 'v', label: 'pane'},
    {id: 'density', scope: 'list', keys: 'Shift+D', label: 'density'},

    {id: 'read-prev', scope: 'read', keys: '[', label: 'readPrev'},
    {id: 'read-next', scope: 'read', keys: ']', label: 'readNext'},
    {id: 'reply', scope: 'read', keys: 'r', label: 'reply'},
    {id: 'copy-sender', scope: 'read', keys: 'y', label: 'copySender'},

    {id: 'send', scope: 'compose', keys: 'Mod+Enter', label: 'send'},
    {id: 'save-draft', scope: 'compose', keys: 'Mod+S', label: 'saveDraft'},

    {id: 'new', scope: 'table', keys: 'n', label: 'new'},

    {id: 'submit', scope: 'dialog', keys: 'Mod+Enter', label: 'submit'},
    {id: 'cancel', scope: 'dialog', keys: 'Esc', label: 'cancel'},
]

const CATALOG_BY_ID = new Map(HOTKEY_CATALOG.map((entry) => [entry.id, entry]))

/* -------------------------------------------------------------- 键位归一化 */

/** 命名键的别名 → `event.key` 的小写形式 */
const KEY_ALIAS = {
    esc: 'escape',
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    space: ' ',
    plus: '+',
    del: 'delete',
    menu: 'contextmenu',
    return: 'enter',
}

/**
 * 把一段定义（`'Mod+Shift+E'`）变成签名（`'mod+shift+e'`）。
 *
 * 非 mac 上 `Mod` 与 `Ctrl` 是同一个物理键，所以定义里的 `Ctrl` 也折叠成 `mod`，
 * 否则 `Ctrl+K` 与 `Mod+K` 会算成两个不同的签名，而事件只会命中其中一个。
 */
function normalizeCombo(combo) {
    const mods = {mod: false, ctrl: false, alt: false, shift: false}
    let key = ''
    for (const raw of String(combo).split('+')) {
        const part = raw.trim().toLowerCase()
        if (!part) continue
        if (part === 'mod' || part === 'cmd' || part === 'meta' || part === 'command') mods.mod = true
        else if (part === 'ctrl' || part === 'control') (isMac ? mods.ctrl = true : mods.mod = true)
        else if (part === 'alt' || part === 'option') mods.alt = true
        else if (part === 'shift') mods.shift = true
        else key = KEY_ALIAS[part] ?? part
    }
    // 单个非字母可打印字符（`?` `/` `#` `,` `[`）自带 shift 语义，不记 shift，
    // 否则 `?` 永远匹配不上（它只能由 Shift+/ 打出来）
    if (key.length === 1 && !/[a-z0-9]/.test(key)) mods.shift = false
    return signature(mods, key)
}

/** 用空格分隔的序列（`'g i'`）→ `'g i'` 的归一化签名 */
function normalizeKeys(keys) {
    return String(keys).trim().split(/\s+/).map(normalizeCombo).join(' ')
}

function signature(mods, key) {
    let out = ''
    if (mods.mod) out += 'mod+'
    if (mods.ctrl) out += 'ctrl+'
    if (mods.alt) out += 'alt+'
    if (mods.shift) out += 'shift+'
    return out + key
}

/** 从事件算签名。字母统一小写并把大写还原成 `shift+` 前缀（`⇧x` → `shift+x`） */
function eventSignature(event) {
    const raw = event.key
    if (!raw) return ''
    // 非 mac 上的 Win/Super 组合是系统级的，不参与匹配（否则 Win+K 会被当成裸 `k`）
    if (!isMac && event.metaKey) return ''
    const named = raw.length > 1
    const key = raw.toLowerCase()
    const mods = {
        mod: isMac ? event.metaKey : event.ctrlKey,
        ctrl: isMac ? event.ctrlKey : false,
        alt: event.altKey,
        // 可打印的非字母数字字符（`?` `#`）不记 shift，与 normalizeCombo 对齐
        shift: event.shiftKey && (named || /[a-z0-9]/.test(key)),
    }
    return signature(mods, key)
}

/** 只有修饰键本身被按下时不参与匹配，否则 `Mod` 按下的瞬间就会清空序列缓冲 */
function isModifierOnly(event) {
    return ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Process'].includes(event.key)
}

/** 焦点是否在可输入元素里（§7.1 的单字母失效条件） */
export function isTypingContext(event) {
    if (event.isComposing || event.keyCode === 229) return true
    const el = event.target
    if (!el || el.nodeType !== 1) return false
    if (el.isContentEditable) return true
    const tag = el.tagName
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (tag === 'INPUT') {
        // checkbox / radio / button 这类不吃字符的 input 不算文本上下文
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
            (el.type || 'text').toLowerCase(),
        )
    }
    return false
}

/** 文本上下文里唯一放行的两类：带 Mod/Ctrl/Alt 的组合键，和命名键（Esc/Enter/方向键） */
function allowedWhileTyping(sig) {
    const [, mods = '', key = sig] = sig.match(/^((?:mod\+|ctrl\+|alt\+|shift\+)*)(.*)$/) || []
    if (/mod\+|ctrl\+|alt\+/.test(mods)) return true
    return key.length > 1
}

/* ------------------------------------------------------------ 全局注册表 */

/** signature → 按注册顺序排列的 binding 数组（取最后一个可用的） */
const bindings = new Map()
/** 触发一次以让 `?` 面板与 `enabled` 计算重算 */
const registryVersion = ref(0)
/** id → 引用计数（`?` 面板判断「当前页可用」） */
const activeIds = reactive(new Map())

/** 整体开关（设置 → 外观），默认开 */
export const hotkeysEnabled = ref(readEnabled())

function readEnabled() {
    try {
        return localStorage.getItem(ENABLED_KEY) !== '0'
    } catch {
        return true
    }
}

export function setHotkeysEnabled(value) {
    hotkeysEnabled.value = !!value
    try {
        localStorage.setItem(ENABLED_KEY, value ? '1' : '0')
    } catch { /* 隐私模式下写不进去，不影响本次会话 */ }
}

const listenerScope = effectScope(true)
let listenerInstalled = false

let pendingPrefix = ''
let pendingTimer = null
let lastFired = {sig: '', at: 0}

function clearPending() {
    pendingPrefix = ''
    if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
    }
}

function resolve(sig) {
    const list = bindings.get(sig)
    if (!list) return null
    // 后注册的（更深的组件）优先
    for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]
        if (unref(b.enabled) === false) continue
        if (typeof b.when === 'function' && !b.when()) continue
        return b
    }
    return null
}

/** sig 是否是某个「还没走完」的序列的前缀 */
function isSequencePrefix(sig) {
    const probe = `${sig} `
    for (const [key, list] of bindings) {
        if (!key.startsWith(probe)) continue
        if (list.some((b) => unref(b.enabled) !== false && (typeof b.when !== 'function' || b.when()))) return true
    }
    return false
}

function onKeydown(event) {
    if (!hotkeysEnabled.value) return
    // 浮层（Reka/vaul）已经处理掉的键不再抢；输入法候选窗也走这条
    if (event.defaultPrevented) return
    if (isModifierOnly(event)) return

    const sig = eventSignature(event)
    if (!sig) return

    const typing = isTypingContext(event)
    if (typing && !allowedWhileTyping(sig)) {
        clearPending()
        return
    }

    // 1) 正在等序列的第二个键
    if (pendingPrefix) {
        const seq = `${pendingPrefix} ${sig}`
        clearPending()
        const hit = resolve(seq)
        if (hit) {
            fire(hit, event, seq)
            return
        }
        // 序列没走通就算这一次作废，不把第二个键再当独立快捷键用
        // （刚按过 `g` 的人按 `x` 想去回收站，不该变成「勾选」）
        return
    }

    // 2) 单键 / 组合键
    const hit = resolve(sig)
    if (hit) {
        fire(hit, event, sig)
        return
    }

    // 3) 序列的第一个键：吞掉并等第二个
    if (!typing && isSequencePrefix(sig)) {
        pendingPrefix = sig
        pendingTimer = setTimeout(clearPending, SEQUENCE_TIMEOUT)
        event.preventDefault()
    }
}

function fire(binding, event, sig) {
    const now = Date.now()
    const isDouble = binding.onRepeat && lastFired.sig === sig && now - lastFired.at < DOUBLE_TAP_WINDOW
    lastFired = {sig, at: now}
    if (binding.preventDefault !== false) event.preventDefault()
    const run = isDouble ? binding.onRepeat : binding.run
    run?.(event)
}

function ensureListener() {
    if (listenerInstalled || typeof window === 'undefined') return
    listenerInstalled = true
    // detached scope：第一个注册者卸载时不会把全局监听一起带走
    listenerScope.run(() => useEventListener(window, 'keydown', onKeydown))
}

/* ---------------------------------------------------------------- 对外 API */

/**
 * 登记一组快捷键，随调用方所在的 scope 自动注销。
 *
 * @param {Array|Object} defs 数组形式 `[{id?, keys, run, scope?, when?, onRepeat?}]`，
 *   或对象速写 `{'Mod+K': fn, 'g i': fn}`。`id` 命中 `HOTKEY_CATALOG` 时
 *   `keys`/`scope` 可省略，由目录补齐（也就顺带保证了 `?` 面板与实现不会走偏）。
 * @param {Object} [options]
 * @param {import('vue').Ref<boolean>|boolean} [options.enabled] 整组开关（响应式）
 * @param {string} [options.scope] 缺省作用域，只影响 `?` 面板分组
 * @returns {{stop: () => void}}
 */
export function useHotkeys(defs, options = {}) {
    ensureListener()

    const list = Array.isArray(defs)
        ? defs
        : Object.entries(defs).map(([keys, run]) => ({keys, run}))

    const registered = []
    for (const def of list) {
        const catalog = def.id ? CATALOG_BY_ID.get(def.id) : null
        const keys = def.keys ?? catalog?.keys
        if (!keys || typeof def.run !== 'function') {
            if (import.meta.env?.DEV) console.warn('[useHotkeys] 跳过无效定义', def)
            continue
        }
        const sig = normalizeKeys(keys)
        const binding = {
            ...def,
            id: def.id,
            scope: def.scope ?? catalog?.scope ?? options.scope ?? 'global',
            enabled: def.enabled ?? options.enabled,
        }
        if (!bindings.has(sig)) bindings.set(sig, [])
        bindings.get(sig).push(binding)
        registered.push([sig, binding])
        if (binding.id) activeIds.set(binding.id, (activeIds.get(binding.id) || 0) + 1)
    }
    registryVersion.value++

    const stop = () => {
        for (const [sig, binding] of registered) {
            const arr = bindings.get(sig)
            if (!arr) continue
            const i = arr.indexOf(binding)
            if (i >= 0) arr.splice(i, 1)
            if (!arr.length) bindings.delete(sig)
            if (binding.id) {
                const n = (activeIds.get(binding.id) || 1) - 1
                if (n > 0) activeIds.set(binding.id, n)
                else activeIds.delete(binding.id)
            }
        }
        registered.length = 0
        registryVersion.value++
    }

    if (getCurrentScope()) onScopeDispose(stop)
    return {stop}
}

/** 某个目录项此刻是否被注册且可用 —— `?` 面板据此决定置灰 */
export function isHotkeyActive(id) {
    return activeIds.has(id)
}

/**
 * `?` 面板的数据源：按 §7.1 的作用域分组，标注可用性。
 *
 * @param {(perm: string) => boolean} [hasPerm] 传入权限判定；无权限的条目**整行剔除**
 */
export function useHotkeyCatalog(hasPerm) {
    return computed(() => {
        void registryVersion.value
        return HOTKEY_SCOPES.map((scope) => ({
            scope,
            items: HOTKEY_CATALOG
                .filter((entry) => entry.scope === scope)
                .filter((entry) => !entry.perm || !hasPerm || hasPerm(entry.perm))
                .map((entry) => ({...entry, available: activeIds.has(entry.id)})),
        })).filter((group) => group.items.length > 0)
    })
}

/** 单元测试用：把注册表清空（不卸掉监听器，它是幂等的） */
export function __resetHotkeys() {
    bindings.clear()
    activeIds.clear()
    clearPending()
    lastFired = {sig: '', at: 0}
    registryVersion.value++
}

/** 测试与调试用的内部工具，不要在业务代码里引 */
export const __internals = {normalizeKeys, eventSignature, allowedWhileTyping, isMac}
