/**
 * useSearchQuery — 顶栏搜索框 / 命令面板共用的查询解析器（§7.5）
 *
 * 一个输入框两种形态（顶栏下拉 + ⌘K 大浮层）必须共用一套语法，否则会长出两种搜索。
 * 所以这里只做三件纯粹的事，不发请求、不碰路由以外的状态：
 *
 *   `parseQuery(text)`   文本 → 结构化条件
 *   `stringifyQuery(q)`  结构化条件 → 文本（漏斗面板勾「有附件」时要回写 `has:att`）
 *   `toListParams(q)`    结构化条件 → 后端 query 参数
 *
 * 支持的语法糖（§7.5）：
 *   `from:` `to:` `subject:` `has:att|code` `is:unread|read|star` `in:inbox|trash|sent`
 *   `after:YYYY-MM-DD` `before:YYYY-MM-DD`，其余全部并成全文关键词。
 *
 * 两个刻意的设计：
 * - **解析永不抛错**。搜索框是边打边解析的，`after:` 打到一半（`after:2026-0`）是
 *   常态而不是错误输入；解析不出来的日期就当这一条不存在，不能让整个面板红一片。
 * - **`stringifyQuery(parseQuery(s))` 收敛**（不保证等于原串，保证再解析结果相同），
 *   漏斗和输入框双向同步靠的就是这个性质。
 */
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {toUtc, tzDayjs} from '@/utils/day.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'

/** 文件夹名要和路由 `/mail/:folder` 对齐，不然 `in:trash` 和侧栏会各说各话 */
export const FOLDERS = ['inbox', 'unread', 'star', 'code', 'sent', 'trash', 'draft']

export const EMPTY_QUERY = {
    keyword: '',
    from: '',
    to: '',
    subject: '',
    hasAtt: false,
    hasCode: false,
    unread: null,
    star: false,
    folder: '',
    after: '',
    before: '',
}

/** `key:value`，value 可用引号包住空格：`subject:"发票 8 月"` */
const TOKEN = /(\w+):("([^"]*)"|[^\s]+)/g
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseQuery(text) {

    const q = {...EMPTY_QUERY}
    const raw = String(text ?? '')
    const words = []
    let cursor = 0

    TOKEN.lastIndex = 0

    for (let m = TOKEN.exec(raw); m; m = TOKEN.exec(raw)) {
        words.push(raw.slice(cursor, m.index))
        cursor = m.index + m[0].length
        // 无法识别的 key 不吞掉，原样退回全文关键词（`http://a` 里的 `http:` 就是这种）
        if (!applyToken(q, m[1].toLowerCase(), m[3] ?? m[2])) words.push(m[0])
    }

    words.push(raw.slice(cursor))
    q.keyword = words.join(' ').replace(/\s+/g, ' ').trim()

    return q
}

/**
 * 落一个 token。返回 false 表示「这不是语法糖」，调用方把原文退回全文关键词
 * —— 粘一个 `https://x` 进来时 `https:` 不该被当成筛选条件。
 */
function applyToken(q, key, value) {

    const v = String(value ?? '').trim()

    switch (key) {
        case 'from':
        case 'to':
        case 'subject':
            if (!v) return false
            q[key] = v
            return true
        case 'has':
            if (v === 'att' || v === 'attachment') return (q.hasAtt = true)
            if (v === 'code') return (q.hasCode = true)
            return false
        case 'is':
            if (v === 'unread') return ((q.unread = true), true)
            if (v === 'read') return ((q.unread = false), true)
            if (v === 'star' || v === 'starred') return (q.star = true)
            return false
        case 'in':
            if (!FOLDERS.includes(v)) return false
            q.folder = v
            return true
        case 'after':
        case 'before':
            // 打字打到一半的日期（`after:2026-0`）照样吃掉，只是暂时不生效
            if (DATE.test(v)) q[key] = v
            return true
        default:
            return false
    }
}

/** 有空格的值补引号，否则再解析就断成两截 */
function quote(value) {
    return /\s/.test(value) ? `"${value}"` : value
}

export function stringifyQuery(query) {

    const q = {...EMPTY_QUERY, ...(query ?? {})}
    const out = []

    if (q.folder) out.push(`in:${q.folder}`)
    if (q.from) out.push(`from:${quote(q.from)}`)
    if (q.to) out.push(`to:${quote(q.to)}`)
    if (q.subject) out.push(`subject:${quote(q.subject)}`)
    if (q.hasAtt) out.push('has:att')
    if (q.hasCode) out.push('has:code')
    if (q.unread === true) out.push('is:unread')
    if (q.unread === false) out.push('is:read')
    if (q.star) out.push('is:star')
    if (q.after) out.push(`after:${q.after}`)
    if (q.before) out.push(`before:${q.before}`)
    if (q.keyword) out.push(q.keyword)

    return out.join(' ')
}

/** 只有文件夹（等于「没在搜」）也算空：切文件夹不该进搜索结果视图 */
export function isEmptyQuery(query) {
    const q = {...EMPTY_QUERY, ...(query ?? {})}
    return !q.keyword && !q.from && !q.to && !q.subject
        && !q.hasAtt && !q.hasCode && !q.star && q.unread === null
        && !q.after && !q.before
}

/**
 * 结构化条件 → 后端 query 参数（§7.5 末段）。
 *
 * 时间的坑：DB 里 `create_time` 存的是 UTC 字符串，后端拿 `gte/lte` 直接比字符串
 * （`email-service.js:959`），所以这里必须把用户输入的**本地日历日**转成 UTC 再格式化成
 * `YYYY-MM-DD HH:mm:ss` —— 和管理端 `all-email/index.vue:197` 同一个写法。
 * `after` 取当天 00:00:00，`before` 取当天 23:59:59（含当天，符合「before:8-1 = 8月1日及以前」
 * 的直觉）。
 *
 * `unread` 传的是**列值**（`entity-const.js:54` 里 UNREAD=0 / READ=1，名字和直觉相反），
 * 后端直接 `eq(email.unread, Number(unread))` 就行，两边都不做取反 —— 取反写在哪一侧
 * 都会有人踩。
 */
export function toListParams(query) {

    const q = {...EMPTY_QUERY, ...(query ?? {})}
    const params = {}

    if (q.keyword) params.keyword = q.keyword
    if (q.from) params.from = q.from
    if (q.to) params.to = q.to
    if (q.subject) params.subject = q.subject
    if (q.hasAtt) params.hasAtt = 1
    if (q.hasCode) params.hasCode = 1
    if (q.star) params.star = 1
    if (q.unread === true) params.unread = EmailUnreadEnum.UNREAD
    if (q.unread === false) params.unread = EmailUnreadEnum.READ
    if (q.after) params.startTime = toUtc(`${q.after} 00:00:00`).format('YYYY-MM-DD HH:mm:ss')
    if (q.before) params.endTime = toUtc(`${q.before} 23:59:59`).format('YYYY-MM-DD HH:mm:ss')

    return params
}

/**
 * 本地兜底谓词（§0.5 末句「Dexie 本地索引兜底最近 500 封的即时搜索」）。
 * 用途只有一个：请求还没回来时先把已加载的行过一遍，让面板立刻有东西可看。
 * 它**不是**权威结果 —— 判定范围只有已加载的部分，所以调用方必须同时发服务端查询。
 */
export function matchesQuery(email, query) {

    if (!email) return false

    const q = {...EMPTY_QUERY, ...(query ?? {})}
    const has = (field, needle) => String(field ?? '').toLowerCase().includes(needle.toLowerCase())

    if (q.from && !(has(email.sendEmail, q.from) || has(email.name, q.from))) return false
    if (q.to && !has(email.toEmail, q.to)) return false
    if (q.subject && !has(email.subject, q.subject)) return false
    if (q.hasAtt && !(email.attList?.length > 0)) return false
    if (q.hasCode && !email.code) return false
    if (q.star && !email.isStar) return false
    if (q.unread === true && email.unread !== EmailUnreadEnum.UNREAD) return false
    if (q.unread === false && email.unread !== EmailUnreadEnum.READ) return false

    return matchesText(email, q) && matchesRange(email, q)
}

function matchesText(email, q) {
    if (!q.keyword) return true
    const needle = q.keyword.toLowerCase()
    return [email.subject, email.sendEmail, email.name, email.toEmail, email.text]
        .some(field => String(field ?? '').toLowerCase().includes(needle))
}

function matchesRange(email, q) {
    if (!q.after && !q.before) return true
    const day = tzDayjs(email.createTime).format('YYYY-MM-DD')
    if (q.after && day < q.after) return false
    if (q.before && day > q.before) return false
    return true
}

/**
 * 和路由 `?q=` 双向绑定（§7.5「筛选态同步到 URL，可分享、可后退、keep-alive 恢复」）。
 *
 * `text` 是唯一的真源：写它就是 `router.replace`，读它就是读 URL。不另存一份本地副本 ——
 * 存了就要和后退按钮同步，那是一类必然会漏的 bug。输入框自己维护 draft 值，
 * 停止输入后再 `commit()`。
 */
export function useSearchQuery() {

    const route = useRoute()
    const router = useRouter()

    const text = computed(() => String(route.query.q ?? ''))
    const query = computed(() => parseQuery(text.value))
    const active = computed(() => !isEmptyQuery(query.value))
    const listParams = computed(() => toListParams(query.value))

    /** 提交搜索文本。`replace` 默认为真：连续改条件不该在历史里堆一串 */
    function commit(next, {replace = true} = {}) {
        const value = String(next ?? '').trim()
        if (value === text.value) return Promise.resolve()
        const q = {...route.query}
        if (value) q.q = value
        else delete q.q
        return router[replace ? 'replace' : 'push']({path: route.path, query: q})
    }

    /** 漏斗面板用：只改一个条件，其余原样回写 */
    function patch(partial, options) {
        return commit(stringifyQuery({...query.value, ...partial}), options)
    }

    function clear(options) {
        return commit('', options)
    }

    return {text, query, active, listParams, commit, patch, clear}
}
