/**
 * L1 原语的当前语言（`Intl` / `@internationalized/date` 需要 BCP-47 标签）
 *
 * 和 `useUiText` 一个思路：不用 `useI18n()`（没装 vue-i18n 的宿主会抛错），
 * 改读 `globalProperties.$i18n`。composition 模式下它的 `locale` 是 ref，
 * legacy 模式下是普通字符串，两种都吃下来。
 */
import {computed, getCurrentInstance, isRef} from 'vue'

/** i18n 缺失时的兜底语言：本项目默认中文 */
export const UI_LOCALE_FALLBACK = 'zh-CN'

/** @returns {import('vue').ComputedRef<string>} */
export function useUiLocale() {
    const i18n = getCurrentInstance()?.appContext.config.globalProperties.$i18n

    return computed(() => {
        const locale = isRef(i18n?.locale) ? i18n.locale.value : i18n?.locale
        // 'zh' / 'en' 这类短标签 Intl 认，但 'zh' 的日期格式与 'zh-CN' 一致，不必特判
        return locale || UI_LOCALE_FALLBACK
    })
}
