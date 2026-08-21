/**
 * 邮件列表行的纯函数格式化（P3 §7.4）。
 *
 * 这三个函数是从 `components/email-scroll/index.vue:554-583` 原样搬出来的（`htmlToText` /
 * `cleanSpace` 一个字符都没改，只是挪了位置），加上列表分组需要的 `dateGroupOf`。
 * 抽成 util 的原因：`useMailList()` 与它的单测都要用，而且 `email-scroll` 在 P3-4 换模板
 * 之前还得继续用自己那份，两边不能互相牵连。
 */
import {tzDayjs} from '@/utils/day.js'

/**
 * 零宽 / 不可见字符表。用 hex 码点在运行时拼 alternation，而不是写成字符类：
 * ZWJ（200D）与 CGJ（034F）出现在字符类里会踩 eslint `no-misleading-character-class`
 * （这两个字符的用途就是把前后字素连起来，落在字符类里通常是笔误）。
 * 顺带好处是这个文件里没有一个不可见字符 —— 源码里看不见的东西没法 review。
 */
const INVISIBLE = new RegExp(
    ['200B', '200C', '200D', '200E', '200F', 'FEFF', '034F', '00A0', '3000', '00AD']
        .map(hex => String.fromCharCode(parseInt(hex, 16)))
        .join('|'),
    'g'
)

/** 移除零宽字符并把连续空白压成一个空格 */
export function cleanSpace(text) {
    return text
        .replace(INVISIBLE, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * 取邮件正文的一行摘要。优先用 HTML（剥掉媒体标签与 script/style/title 再取 textContent），
 * 没有 HTML 才退回纯文本字段。
 *
 * 注意这里是「取文本」而不是「渲染」：innerHTML 只写进一个游离的 div，从不插入文档，
 * 媒体标签在正则阶段就被删掉了，所以不会触发远程请求（阅读窗格的隔离另见 MailReader）。
 */
export function htmlToText(email) {
    if (email.content) {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = email.content.replace(
            /<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, ''
        )
        tempDiv.querySelectorAll('script, style, title').forEach(el => el.remove())
        const text = tempDiv.textContent || tempDiv.innerText || ''
        return cleanSpace(text)
    }
    return email.text ? cleanSpace(email.text) : ''
}

/**
 * 列表日期分组（§7.4：分组头是虚拟列表里的一种 28px 行，CSS sticky 在虚拟容器里不成立）。
 *
 * 按「本地日历日」分组，返回稳定的 key（`YYYY-MM-DD`）和标签种类：
 *   today / yesterday → 由调用方翻译成「今天 / 昨天」
 *   date             → 调用方直接用 label（同年 `M月D日`，跨年 `YYYY/M/D`）
 *
 * 只用日历日、不用「本周 / 本月」这类跨度分组：邮件按 emailId 倒序（≈时间倒序）排列时，
 * 跨度分组会在时间排序被用户反转（timeSort=1）后变成乱序标题，日历日不会。
 */
export function dateGroupOf(time, lang = 'zh') {

    // `dayjs.utc(undefined)` 是「现在」而不是无效值 —— 缺字段的邮件会被分到今天，
    // 所以空值必须先挡掉再交给 dayjs。
    if (!time) {
        return {key: 'unknown', kind: 'date', label: ''}
    }

    const d = tzDayjs(time)

    if (!d.isValid()) {
        return {key: 'unknown', kind: 'date', label: ''}
    }

    const now = tzDayjs(new Date().toISOString())
    const key = d.format('YYYY-MM-DD')

    if (key === now.format('YYYY-MM-DD')) {
        return {key, kind: 'today', label: ''}
    }

    if (key === now.subtract(1, 'day').format('YYYY-MM-DD')) {
        return {key, kind: 'yesterday', label: ''}
    }

    const sameYear = d.year() === now.year()

    // `day.js` 在模块加载时按站点语言设了**全局** locale，所以只换 format 串不够：
    // `'MMM D'` 在 zh-cn 下会输出「8月 8」。这里显式指定实例 locale，两种语言都不受
    // 全局设置影响。'zh-cn' 与 'en' 都已由 day.js 注册（'en' 是 dayjs 内置）。
    const dd = d.locale(lang === 'en' ? 'en' : 'zh-cn')

    if (lang === 'en') {
        return {key, kind: 'date', label: dd.format(sameYear ? 'MMM D' : 'MMM D, YYYY')}
    }

    return {key, kind: 'date', label: dd.format(sameYear ? 'M月D日' : 'YYYY/M/D')}
}
