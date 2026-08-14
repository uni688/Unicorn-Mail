/**
 * toast() — Toast 的调用入口（§6.1 的 `Toast`，规格见 §「Toast（替换 87 处 ElMessage）」）
 *
 * 只包一层的理由是「默认值必须由设计系统给，不由 87 个调用点各写一遍」：
 * - 时长：success/info 2.5s、warning 3s、error 4s，loading 受控（不自动关）
 * - error 自带关闭按钮（4s 可能读不完，得能手动留住/关掉）
 * - `toast.undo()` 是撤销的唯一载体，固定 5s 窗口
 *
 * 去重不在这里做：同类网络错误的聚合（同 code 1s 内只弹一次）是 axios 拦截器的
 * 活。需要「同一件事只占一条」时给稳定的 `id`，sonner 会原地更新而不是再堆一条。
 *
 * 文案：`Toaster` 挂载时通过 `setToastText` 把带 i18n 的解析器交进来；
 * 在那之前（比如单元测试直接调 toast）用内置兜底文案，不抛错。
 */
import {toast as sonner} from 'vue-sonner'
import {resolveUiText} from '../_shared/useUiText.js'

/** @type {(key: string, params?: Record<string, unknown>) => string} */
let text = (key, params) => resolveUiText(null, key, params)

/** 由 `Toaster.vue` 在 setup 里调用，把 i18n 解析器交给模块作用域 */
export function setToastText(resolver) {
    if (typeof resolver === 'function') {
        text = resolver
    }
}

/** §Toast 规定的时长（毫秒）；loading 由调用方自己关 */
const DURATION = {
    default: 2500,
    success: 2500,
    info: 2500,
    warning: 3000,
    error: 4000,
}

/** 撤销窗口：5s，与 §9.5 乐观更新的回滚窗口一致 */
export const UNDO_WINDOW = 5000

function withDefaults(type, options = {}) {
    const extra = {}
    if (type === 'error') {
        // 4s 读不完的场景（一长串失败原因）必须能手动关
        extra.closeButton = options.closeButton ?? true
    }
    return {duration: DURATION[type] ?? DURATION.default, ...extra, ...options}
}

/**
 * 普通提示（无类型、无图标）
 * @param {string|object} message
 * @param {object} [options] 透传 vue-sonner 的 ExternalToast
 */
function base(message, options) {
    return sonner(message, withDefaults('default', options))
}

/**
 * 带撤销按钮的提示 —— 删除、批量操作、偏好改动后用它
 *
 * @param {string} message 已发生的事实（「已删除 3 封」），不是疑问句
 * @param {object} options
 * @param {() => void} options.onUndo 点撤销时执行；执行完 toast 自动关闭
 * @param {string} [options.actionLabel] 覆盖按钮文案，默认 i18n 的 `ui.undo`
 */
function undo(message, options = {}) {
    const {onUndo, actionLabel, ...rest} = options
    return sonner(message, {
        duration: UNDO_WINDOW,
        action: {
            label: actionLabel || text('undo'),
            onClick: () => onUndo?.(),
        },
        ...rest,
    })
}

export const toast = Object.assign(base, {
    success: (message, options) => sonner.success(message, withDefaults('success', options)),
    error: (message, options) => sonner.error(message, withDefaults('error', options)),
    warning: (message, options) => sonner.warning(message, withDefaults('warning', options)),
    info: (message, options) => sonner.info(message, withDefaults('info', options)),
    /** 受控：不自动关，拿返回的 id 交给 `toast.dismiss` 或 `toast.success` 顶掉 */
    loading: (message, options) => sonner.loading(message, {duration: Infinity, ...options}),
    /** 一条 toast 跟随 promise 的三态，自己会切图标与时长 */
    promise: (promise, data) => sonner.promise(promise, data),
    /** 自定义内容（组件）；布局与配色就都归调用方了 */
    custom: (component, options) => sonner.custom(component, options),
    dismiss: (id) => sonner.dismiss(id),
    undo,
})

export default toast
