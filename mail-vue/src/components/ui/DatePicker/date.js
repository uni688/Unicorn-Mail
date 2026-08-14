/**
 * 日期在 UI 与业务之间的唯一约定：**`YYYY-MM-DD` 字符串**（区间是 `{start, end}`）
 *
 * 为什么不是 `Date`：`Date` 是「时间点」，日历选的是「日历日」。用 `Date` 传值，
 * 只要有人不小心走了一次 UTC（`toISOString()`、后端按 UTC 存），东八区的 8 月 12 日
 * 就会变成 8 月 11 日 —— 这类 off-by-one 在旧代码里已经靠 `toUtc(...).add(1,'day')`
 * 打过补丁了（见 `views/all-email/index.vue` 的批量清理）。字符串没有时区，
 * 能直接进 URL query、能被 dayjs 解析、`===` 就能比较。
 *
 * 对外宽进严出：`toCalendarDate` 吃 `YYYY-MM-DD` / `Date` / reka 的 DateValue，
 * 对外一律发 `toDateKey` 的规范字符串。
 */
import {CalendarDate, DateFormatter, getLocalTimeZone, parseDate, today} from '@internationalized/date'

/**
 * @param {string|Date|{year:number,month:number,day:number}|null|undefined} value
 * @returns {CalendarDate|undefined}
 */
export function toCalendarDate(value) {
    if (value === undefined || value === null || value === '') {
        return undefined
    }
    if (typeof value === 'object') {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime())
                ? undefined
                : new CalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
        }
        // 已经是 DateValue（CalendarDate / CalendarDateTime / ZonedDateTime），只取日历日
        if (typeof value.year === 'number' && typeof value.month === 'number') {
            return new CalendarDate(value.year, value.month, value.day)
        }
        return undefined
    }
    try {
        // 容忍 '2026-08-12T00:00:00Z' 这种 ISO 串：只认前 10 位的日历日
        return parseDate(String(value).slice(0, 10))
    } catch {
        return undefined
    }
}

/**
 * @param {{toString: () => string}|null|undefined} date
 * @returns {string|null} `YYYY-MM-DD`
 */
export function toDateKey(date) {
    return date ? date.toString().slice(0, 10) : null
}

/** 今天的 `YYYY-MM-DD`（本地时区，不是 UTC） */
export function todayKey() {
    return toDateKey(today(getLocalTimeZone()))
}

/**
 * 按语言格式化成给人看的日期。
 * @param {string} locale
 * @param {string|null|undefined} key `YYYY-MM-DD`
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatDateKey(locale, key, options = {dateStyle: 'medium'}) {
    const date = toCalendarDate(key)
    if (!date) {
        return ''
    }
    // DateFormatter 内部缓存 Intl 实例，逐格调用也不会有构造开销
    return new DateFormatter(locale, options).format(date.toDate(getLocalTimeZone()))
}
