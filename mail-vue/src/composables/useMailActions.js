/**
 * useMailActions — 命令条与当前邮件列表之间的那一根线（§6.2 + §7.4）
 *
 * `CommandBar` 挂在 `AppShell` 里，邮件列表挂在路由视图里，两者没有父子关系。P2 时命令条的
 * 四个上下文动作因此恒为 disabled（那份缺口写在 `CommandBar.vue` 的注释里）。
 *
 * 这里用一个模块级单例把它们接上，规则只有两条：
 * 1. **同一时刻只有一个列表是「当前列表」**。收件箱 / 星标 / 已发送 / 回收站不会同屏，
 *    所以后注册的覆盖先注册的；卸载时只有「自己还是当前」才清空 —— 否则路由切换时
 *    新视图先 mount、旧视图后 unmount，会把新的清掉。
 * 2. **命令条不认识业务**。它只发 `mark-read` / `star` / `delete` / `copy-code`，
 *    具体做什么由注册方（`MailWorkspace`）决定，回收站注册的「删除」就是彻底删除。
 */
import {computed, reactive} from 'vue'

let token = 0

const state = reactive({
    /** 当前列表勾选了多少封；0 时命令条的上下文动作 disabled */
    count: 0,
    /** 有没有可复制的验证码（只有勾选单封且它带 code 时才有意义） */
    hasCode: false,
    owner: null,
    handlers: null,
})

/**
 * 注册当前列表。返回一个 `unregister`，调用方在 `onUnmounted` 里调。
 * @param {{markRead: Function, star: Function, delete: Function, copyCode?: Function}} handlers
 */
export function registerMailActions(handlers) {

    const id = ++token
    state.owner = id
    state.handlers = handlers

    return () => {
        if (state.owner !== id) return
        state.owner = null
        state.handlers = null
        state.count = 0
        state.hasCode = false
    }
}

/** 注册方把选中数量同步过来（`watch` 一行的活，不值得再抽一层） */
export function setMailSelection({count = 0, hasCode = false} = {}) {
    state.count = count
    state.hasCode = hasCode
}

export function useMailActions() {

    const run = (id) => {
        const handler = state.handlers?.[id]
        if (handler) handler()
    }

    return {
        count: computed(() => state.count),
        hasCode: computed(() => state.hasCode),
        available: computed(() => !!state.handlers),
        run,
    }
}
