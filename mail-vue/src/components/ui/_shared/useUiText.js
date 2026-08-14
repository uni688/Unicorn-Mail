/**
 * L1 原语的文案解析（§6.3「文案零硬编码」）
 *
 * 规则：可见文案一律先看 props，再看 i18n 的 `ui.*`，最后才是内置兜底。
 * 不直接用 `useI18n()`：那个在没装 vue-i18n 的场景（单元测试、Storybook 式的
 * 独立挂载）会抛错，而原语必须能被任意宿主挂载。这里改读 globalProperties.$t，
 * 拿不到就退回兜底文案，永不抛错。
 */
import {getCurrentInstance} from 'vue'

/** 兜底文案：i18n 缺失时用它，键名与 i18n/zh.js 的 ui.* 一一对应 */
export const UI_TEXT_FALLBACK = {
    close: '关闭',
    clear: '清除',
    copy: '复制',
    copied: '已复制',
    copyFailed: '复制失败',
    loading: '加载中',
    select: '请选择',
    search: '搜索',
    noResults: '无匹配结果',
    increase: '增加',
    decrease: '减少',
    remove: '移除',
    expand: '展开',
    collapse: '收起',
    prevPage: '上一页',
    nextPage: '下一页',
    firstPage: '首页',
    lastPage: '末页',
    morePages: '更多页',
    page: '第 {n} 页',
    pagination: '分页',
    prevMonth: '上个月',
    nextMonth: '下个月',
    pickDate: '选择日期',
    today: '今天',
    unread: '未读',
    dismiss: '关闭提示',
    required: '必填',
    optional: '选填',
    dialog: '对话框',
    confirm: '确定',
    cancel: '取消',
    more: '更多',
    undo: '撤销',
    retry: '重试',
    notifications: '通知',
}

/**
 * 不依赖组件实例的版本，给 toast 这类模块级 API 用（它们没有 setup 上下文，
 * 只能拿到 i18n 实例本身）。
 *
 * @param {((path: string, params?: Record<string, unknown>) => string)|null|undefined} translate
 * @param {keyof typeof UI_TEXT_FALLBACK} key
 * @param {Record<string, unknown>} [params]
 */
export function resolveUiText(translate, key, params) {
    const fallback = UI_TEXT_FALLBACK[key] ?? key
    if (typeof translate !== 'function') {
        return interpolate(fallback, params)
    }
    const path = `ui.${key}`
    // vue-i18n 找不到键时原样返回路径，用它判断是否命中
    const translated = params ? translate(path, params) : translate(path)
    return translated === path ? interpolate(fallback, params) : translated
}

/**
 * @returns {(key: keyof typeof UI_TEXT_FALLBACK, params?: Record<string, unknown>) => string}
 */
export function useUiText() {
    const $t = getCurrentInstance()?.appContext.config.globalProperties.$t

    return (key, params) => resolveUiText($t, key, params)
}

function interpolate(template, params) {
    if (!params) {
        return template
    }
    return template.replace(/\{(\w+)}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}
