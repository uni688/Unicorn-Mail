/**
 * useComposer — 写信入口的交接台（§7.7「写信是全屏页而不是弹窗」）
 *
 * 写信从「一个 `position: fixed` 的浮层 + `uiStore.writerRef` 全局 ref」变成一个真正的路由页
 * （`/mail/compose`），于是「回复这封邮件」要把上下文交给下一个页面。URL 里塞不进一封邮件，
 * 所以这里是一个模块级的交接台：调用方放下 prefill 再跳路由，页面挂载时取走。
 *
 * 取走即清空（`takePrefill()`）：留着的话用户在写信页刷新一次就会又拿到一遍旧的引用内容。
 * 页面自己会把内容存进草稿，刷新后从草稿里恢复才是对的路径。
 */
import {ref} from 'vue'
import router from '@/router/index.js'

/** @type {import('vue').Ref<null | {mode: 'new'|'reply'|'forward'|'draft', email?: Object, draft?: Object}>} */
const prefill = ref(null)

/** 供路由守卫 / 页面判断「有没有人刚放下东西」 */
export function hasPrefill() {
    return prefill.value !== null
}

export function takePrefill() {
    const value = prefill.value
    prefill.value = null
    return value
}

/**
 * 打开写信页。`mode` 决定页面怎么预填：
 *   new     空白
 *   reply   收件人 = 发件人，主题加 `Re:`，正文引用原文
 *   forward 主题加 `Fwd:`，正文带上原文，收件人留空
 *   draft   直接把草稿铺开（草稿列表点进来）
 */
export function openCompose(mode = 'new', payload = {}) {
    prefill.value = {mode, ...payload}
    return router.push({name: 'compose'})
}

export function useComposer() {
    return {openCompose, takePrefill, hasPrefill}
}
