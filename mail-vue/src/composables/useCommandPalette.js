/**
 * useCommandPalette — 顶栏搜索与 ⌘K 命令面板**共用**的解析器 + 数据源（§6.2 / §7.2 / §7.5）
 *
 * 一个输入框、四种意图（§5.1 Topbar）：
 *
 * | 前缀 | 模式 | 内容 |
 * |---|---|---|
 * | 无 | `all` | 全部分组一起模糊过滤 |
 * | `>` | `command` | 只剩动作 |
 * | `@` | `mailbox` | 邮箱 |
 * | `#` | `settings` | 设置中心条目 |
 *
 * `open` / `query` 是**模块单例**：顶栏入口、`⌘K`、`/`、头像菜单都要能开它，而面板
 * 本身全站只挂一份。数据源得用 `useCommandPalette()` 在组件里取，因为它要 router、
 * store 和 i18n。
 *
 * 分组顺序固定「动作 → 转到 → 邮件 → 设置」（§6.2）。「邮件搜索结果」要等 P3 的
 * `MailList` 与搜索解析器，这里**不占位** —— 摆一个永远空的分组比没有更糟。
 *
 * 过滤是自实现 fuzzy（§6.2「自实现 fuzzy，无需额外依赖」）：子串命中给高分，否则退化为
 * 按序子序列匹配。中文只能走子串（拼音不在范围内），所以每个条目都带 `keywords`
 * 把英文别名写进去。
 *
 * 「转到」与「设置」两组都用 `router.hasRoute()` 判定而不是 `hasPerm()`：管理页是
 * `permsToRouter()` 动态注入的，路由在不在比权限键在不在更接近「点了会不会 404」。
 */
import {computed, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconSquarePen from '~icons/lucide/square-pen'
import IconInbox from '~icons/lucide/inbox'
import IconSend from '~icons/lucide/send'
import IconFileText from '~icons/lucide/file-text'
import IconStar from '~icons/lucide/star'
import IconAtSign from '~icons/lucide/at-sign'
import IconMails from '~icons/lucide/mails'
import IconSettings from '~icons/lucide/settings'
import IconSunMoon from '~icons/lucide/sun-moon'
import IconLanguages from '~icons/lucide/languages'
import IconSparkles from '~icons/lucide/sparkles'
import IconCopy from '~icons/lucide/copy'
import IconKeyboard from '~icons/lucide/keyboard'
import IconLogOut from '~icons/lucide/log-out'
import IconChartPie from '~icons/lucide/chart-pie'
import IconUsers from '~icons/lucide/users'
import IconShield from '~icons/lucide/shield'
import IconTicket from '~icons/lucide/ticket'
import IconServerCog from '~icons/lucide/server-cog'
import IconUser from '~icons/lucide/user'
import {useTheme} from '@/composables/useTheme.js'
import {useBgEffect, USER_BG_MODES} from '@/composables/useBgEffect.js'
import {useUserStore} from '@/store/user.js'
import {useAccountStore} from '@/store/account.js'
import {useSettingStore} from '@/store/setting.js'
import {toast} from '@/components/ui/Toast/toast.js'
import {logout} from '@/request/login.js'
import {endSession} from '@/utils/session.js'
import {setExtend} from '@/utils/day.js'
import {openShortcuts} from '@/composables/useShortcutsDialog.js'
import {useMailboxes} from '@/composables/useMailboxes.js'
import {openCompose} from '@/composables/useComposer.js'

/* -------------------------------------------------------------- 单例状态 */

/** 前缀 → 模式（§5.1 Topbar「输入 `>` = 执行命令，`@` = 找邮箱，`#` = 跳设置」） */
export const PALETTE_PREFIX = {'>': 'command', '@': 'mailbox', '#': 'settings'}

const open = ref(false)
const query = ref('')

/** 把原始输入拆成「模式 + 净词」。前缀后允许有空格：`> 主题` 与 `>主题` 等价 */
export function parseQuery(raw) {
    const value = String(raw ?? '')
    const mode = PALETTE_PREFIX[value[0]]
    if (!mode) return {mode: 'all', term: value.trim()}
    return {mode, term: value.slice(1).trim()}
}

export function usePaletteState() {
    const parsed = computed(() => parseQuery(query.value))
    return {
        open,
        query,
        mode: computed(() => parsed.value.mode),
        term: computed(() => parsed.value.term),
    }
}

/** @param {string} [prefill] 预填输入（`'>'` 直接进命令模式） */
export function openPalette(prefill = '') {
    query.value = prefill
    open.value = true
}

export function closePalette() {
    open.value = false
    // 不清 query：关掉再 ⌘K 打开时保留上次的词，跟 VS Code 一致
}

export function togglePalette(prefill = '') {
    if (open.value) closePalette()
    else openPalette(prefill)
}

/* ---------------------------------------------------------------- 最近访问 */

const RECENT_KEY = 'um-recent-routes'
const RECENT_MAX = 5

const recentRoutes = ref(readRecent())

function readRecent() {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
        return Array.isArray(raw) ? raw.filter((r) => r && r.name).slice(0, RECENT_MAX) : []
    } catch {
        return []
    }
}

/**
 * 记一次访问 —— 由 `AppShell` 的路由 watch 调用（唯一调用点）。
 * 空输入时命令面板显示这一组（§6.2「空输入时显示『最近访问』+ 5 个高频动作」）。
 */
export function recordVisit(route) {
    if (!route?.name || !route.meta?.title) return
    const entry = {name: String(route.name), title: route.meta.title}
    const next = [entry, ...recentRoutes.value.filter((r) => r.name !== entry.name)].slice(0, RECENT_MAX)
    recentRoutes.value = next
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch { /* 隐私模式：内存里有就够了 */ }
}

/* -------------------------------------------------------------------- fuzzy */

/**
 * 打分：命中返回分数（越大越靠前），不命中返回 `null`。
 * 子串命中给 1000 起底 —— 中文只有这条路能命中，必须压过一切子序列噪音。
 */
export function fuzzyScore(text, term) {
    if (!term) return 0
    const hay = String(text || '').toLowerCase()
    const needle = term.toLowerCase()
    if (!hay) return null

    const at = hay.indexOf(needle)
    if (at >= 0) return 1000 - at * 2 + (at === 0 ? 200 : 0)

    let cursor = 0
    let score = 0
    let prev = -2
    for (const ch of needle) {
        const found = hay.indexOf(ch, cursor)
        if (found < 0) return null
        score += found === prev + 1 ? 12 : 4
        if (found === 0 || /[\s·/@#>_-]/.test(hay[found - 1])) score += 8
        prev = found
        cursor = found + 1
    }
    return score
}

/** 条目参与匹配的文本：label + hint + keywords（与 `Command.vue` 的 haystack 同构） */
function haystack(item) {
    return [item.label, item.hint, Array.isArray(item.keywords) ? item.keywords.join(' ') : item.keywords]
        .filter(Boolean).join(' ')
}

/** 过滤 + 按分数降序；`limit` 用于「最多 6 条」这类硬上限 */
export function fuzzyFilter(items, term, limit = Infinity) {
    if (!term) return items.slice(0, limit)
    return items
        .map((item) => ({item, score: fuzzyScore(haystack(item), term)}))
        .filter((row) => row.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((row) => row.item)
}

/* ------------------------------------------------------------------ 数据源 */

/** 「转到」组：文件夹 → 路由名 + 图标（路由名沿用旧名，`push({name})` 的调用点不用改） */
const GOTO = [
    {name: 'email', label: 'inbox', icon: IconInbox, keywords: 'inbox shoujianxiang', shortcut: 'g i'},
    {name: 'send', label: 'sent', icon: IconSend, keywords: 'sent yifasong', shortcut: 'g s'},
    {name: 'draft', label: 'drafts', icon: IconFileText, keywords: 'draft caogao', shortcut: 'g d'},
    {name: 'star', label: 'starred', icon: IconStar, keywords: 'star xingbiao', shortcut: 'g t'},
]

/**
 * 「设置」组：P2 先索引到现有页面；P5 拆出 9 个 section 后在这里补三级项（§7.2）。
 *
 * `group` 只给 Topbar 的 ⚙ 菜单分栏用（`account` = 我的，`admin` = 管理），
 * 命令面板本身不分栏 —— 面板里一次只看一个平铺列表，再分组反而更难扫。
 * 两处共用同一份表，是为了「⚙ 里有的 `#` 也搜得到」永远成立。
 */
export const SETTINGS = [
    {name: 'setting', label: 'settings', icon: IconUser, group: 'account', keywords: 'profile account gerenshezhi'},
    {name: 'analysis', label: 'analytics', icon: IconChartPie, group: 'admin', keywords: 'overview admin fenxi'},
    {name: 'user', label: 'allUsers', icon: IconUsers, group: 'admin', keywords: 'users admin yonghu'},
    {name: 'role', label: 'permissions', icon: IconShield, group: 'admin', keywords: 'roles perms quanxian'},
    {name: 'reg-key', label: 'inviteCode', icon: IconTicket, group: 'admin', keywords: 'invite regkey yaoqingma'},
    {name: 'all-email', label: 'allMail', icon: IconMails, group: 'admin', keywords: 'all mail quanbuyoujian'},
    {name: 'sys-setting', label: 'SystemSettings', icon: IconServerCog, group: 'admin', keywords: 'system admin xitongshezhi'},
]

/**
 * 面板内容。必须在组件 setup 里调用（要 router / i18n / store）。
 *
 * @returns 面板渲染所需的一切：`groups` 已经按模式裁过、按 fuzzy 排过序，
 *   直接喂给 `Command` 并把它的内置 `filter` 关掉。
 */
export function useCommandPalette() {
    const router = useRouter()
    const {t, locale} = useI18n()
    const userStore = useUserStore()
    const accountStore = useAccountStore()
    const settingStore = useSettingStore()
    const {mode: themeMode, toggle: toggleTheme} = useTheme()
    const {adminPolicy, userPref: bgPref, setUserPref: setBgPref} = useBgEffect()
    const {mode, term} = usePaletteState()

    /**
     * `@` 模式的数据源。P3 起换成 `useMailboxes()`（§10.5 增量 6）：与侧栏 Picker 共用
     * 同一份分页缓存与**服务端搜索**，所以 200 个邮箱时面板也能搜到第 137 个 ——
     * 之前这里是「首页 30 条 + 客户端过滤」，搜不到的就只能点「更多邮箱」去旧浮层。
     */
    const {
        mailboxes: mailboxPage, results: mailboxResults, loading: mailboxPageLoading,
        searching: mailboxSearching, ensureFirstPage: ensureMailboxes, search: searchMailboxes,
        select: selectMailbox,
    } = useMailboxes()

    const mailboxLoading = computed(() => mailboxPageLoading.value || mailboxSearching.value)

    /** 只有真的注册了的路由才进列表：管理页是动态注入的，权限键在不代表路由在 */
    function go(name) {
        if (!router.hasRoute(name)) return
        router.push({name})
    }

    function withRoute(rows, group) {
        return rows
            .filter((row) => router.hasRoute(row.name))
            .map((row) => ({
                value: `${group}:${row.name}`,
                label: t(row.label),
                keywords: row.keywords,
                shortcut: row.shortcut,
                icon: row.icon,
                run: () => go(row.name),
            }))
    }

    async function copyMyEmail() {
        const email = userStore.user?.email
        if (!email) return
        try {
            await navigator.clipboard.writeText(email)
            toast.success(t('shell.copied', {value: email}))
        } catch {
            toast.error(t('copyFailMsg'))
        }
    }

    function toggleLang() {
        const next = settingStore.lang === 'en' ? 'zh' : 'en'
        setExtend(next === 'en' ? 'en' : 'zh-cn')
        settingStore.lang = next
        locale.value = next
    }

    function cycleBgEffect() {
        const i = USER_BG_MODES.indexOf(bgPref.value)
        setBgPref(USER_BG_MODES[(i + 1) % USER_BG_MODES.length])
    }

    async function doLogout() {
        try {
            await logout()
        } finally {
            // 与 `Topbar.vue` 同一个出口：跳登录页 + 清 token / store / 模块单例（审计 P2-5）
            await endSession()
        }
    }

    /** 动作组（§7.2）。「创建 API Key」「刷新收件箱」要等 P4/P3 的页面与命令条，先不列。 */
    const actions = computed(() => {
        const out = []
        if (router.hasRoute('compose')) {
            out.push({
                value: 'act:compose', label: t('shell.compose'), icon: IconSquarePen,
                keywords: 'compose write new xiexin', shortcut: 'c',
                run: () => openCompose(),
            })
        }
        if (settingStore.settings.manyEmail === 0) {
            out.push({
                value: 'act:mailboxes', label: t('shell.switchMailbox'), icon: IconAtSign,
                keywords: 'mailbox switch account qiehuanyouxiang', shortcut: 'Mod+Shift+E',
                // P3 起邮箱切换在命令面板自己的 `@` 模式里（下面 mailboxes 那一组），
                // 不再弹旧的账号浮层
                run: () => openPalette('@'),
            })
        }
        out.push(
            {
                value: 'act:theme', label: t('shell.toggleTheme'), icon: IconSunMoon,
                hint: t(`shell.theme_${themeMode.value}`), keywords: 'theme dark light zhuti',
                shortcut: 'Mod+Shift+L', run: (event) => toggleTheme(event),
            },
            {
                value: 'act:lang', label: t('shell.toggleLang'), icon: IconLanguages,
                hint: settingStore.lang === 'en' ? 'English' : '中文',
                keywords: 'language locale yuyan', run: toggleLang,
            },
        )
        // 站长强制 on/off 时用户改不动，命令面板里就别给这一条（设置页才需要「置灰 + 说明」）
        if (adminPolicy.value === 'optional') {
            out.push({
                value: 'act:bg', label: t('shell.toggleBgEffect'), icon: IconSparkles,
                hint: t(`shell.bg_${bgPref.value}`), keywords: 'background particles beijing',
                run: cycleBgEffect,
            })
        }
        out.push(
            {
                value: 'act:copy-email', label: t('shell.copyMyEmail'), icon: IconCopy,
                hint: userStore.user?.email, keywords: 'copy email address fuzhi', run: copyMyEmail,
            },
            {
                value: 'act:shortcuts', label: t('shell.shortcuts'), icon: IconKeyboard,
                keywords: 'shortcut keyboard help kuaijiejian', shortcut: '?', run: openShortcuts,
            },
            {
                value: 'act:logout', label: t('logOut'), icon: IconLogOut,
                keywords: 'logout signout tuichu', tone: 'danger', run: doLogout,
            },
        )
        return out
    })

    const gotoItems = computed(() => withRoute(GOTO, 'goto'))

    const settingsItems = computed(() => [
        ...withRoute(SETTINGS, 'set'),
    ])

    /**
     * 邮箱组。P2 只有 `GET /account/list` 的首页（30 条）+ 客户端过滤；
     * §10.5 增量 6（`GET /account/search`）上线后把这里换成服务端搜索即可，
     * 面板其余部分不用动。
     */
    const mailboxItems = computed(() => {
        const source = term.value.trim() ? mailboxResults : mailboxPage
        const rows = source.map((account) => ({
            value: `mbx:${account.accountId}`,
            label: account.email,
            hint: account.accountId === accountStore.currentAccountId ? t('shell.current') : undefined,
            keywords: account.name,
            icon: IconAtSign,
            run: () => {
                // 副作用与侧栏 Picker 完全一致（同一个 `select()`），两个入口不会选出不同状态
                selectMailbox(account)
                go('email')
            },
        }))
        return rows
    })

    const recentItems = computed(() => recentRoutes.value
        .filter((r) => router.hasRoute(r.name))
        .map((r) => ({
            value: `recent:${r.name}`,
            label: t(r.title),
            icon: [...GOTO, ...SETTINGS].find((row) => row.name === r.name)?.icon ?? IconSettings,
            run: () => go(r.name),
        })))

    // 进 `@` 模式才拉邮箱：不能因为「打开了面板」就多发一个请求
    watch([open, mode], ([isOpen, m]) => {
        if (isOpen && m === 'mailbox') ensureMailboxes()
    }, {immediate: true})

    // `@` 模式下的输入走服务端搜索（`useMailboxes` 自己做 120ms 防抖 + 取消旧请求）
    watch([open, mode, term], ([isOpen, m, q]) => {
        if (!isOpen || m !== 'mailbox') return
        searchMailboxes(q)
    })

    /**
     * 分组顺序：最近（仅空输入）→ 动作 → 转到 → 设置 → 邮箱。
     * §6.2 的「邮件搜索结果」插在「转到」与「设置」之间，等 P3 有数据了再加。
     */
    const groups = computed(() => {
        const q = term.value
        const m = mode.value
        const out = []

        const push = (label, items, limit) => {
            const rows = fuzzyFilter(items, q, limit)
            if (rows.length) out.push({label, options: rows})
        }

        if (m === 'command') {
            push(t('shell.groupActions'), actions.value)
            return out
        }
        if (m === 'settings') {
            push(t('shell.groupSettings'), settingsItems.value)
            return out
        }
        if (m === 'mailbox') {
            push(t('shell.groupMailboxes'), mailboxItems.value, 9)
            return out
        }

        if (!q && recentItems.value.length) push(t('shell.groupRecent'), recentItems.value)
        push(t('shell.groupActions'), actions.value, q ? Infinity : 5)
        push(t('shell.groupGoto'), gotoItems.value)
        push(t('shell.groupSettings'), settingsItems.value)
        // `all` 模式下只用**已经拉到的**邮箱，避免为了一次搜索去打接口
        if (q && mailboxItems.value.length) push(t('shell.groupMailboxes'), mailboxItems.value, 6)
        return out
    })

    /** `Command` 的 `select` 回调：执行条目自带的 `run` 并关面板 */
    function run(value, item, event) {
        if (!item?.run) return
        closePalette()
        item.run(event)
    }

    return {open, query, mode, term, groups, run, mailboxLoading, ensureMailboxes}
}
