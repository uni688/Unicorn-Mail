/**
 * useTurnstile —— 注册页的 Cloudflare Turnstile 挂载与生命周期
 *
 * 与旧实现的两个差别：
 *
 * 1. **不再往 window 上挂四个全局回调**。旧代码把 `onTurnstileSuccess` / `onTurnstileError` /
 *    `loadAfter` / `loadBefore` 写进 `window`，再用容器上的 `data-callback` 之类的属性去引用
 *    （`login/index.vue:206-233`）。那四个函数在视图卸载后仍然留在 window 上，且拿的是
 *    第一次 setup 的闭包 —— 注册页来回进出几次之后，token 会写进一个已经死掉的作用域。
 *    这里改成 `turnstile.render(el, {...})` 的显式参数形式（官方支持，且 `index.html` 里的
 *    脚本没带 `render=explicit` 也不影响：自动扫描只认 `.cf-turnstile` 类名）。
 * 2. 多了 `expired-callback`。widget 的 token 只有 300 秒有效期，过期后原样提交会被后端
 *    判 400，旧代码于是走「重置 + 重新渲染」的绕路。这里过期就地清掉 token，下一次提交
 *    自然重新验证。
 *
 * 容器高度由调用方预留（§5.3.1「Turnstile 容器预留固定高度」），这里不碰样式。
 */
import {nextTick, onScopeDispose, ref} from 'vue'

/** 与旧实现一致：连续失败 4 次就不再自动重试，页面上留一行说明让用户刷新 */
const MAX_RETRY = 4
/** 失败后隔多久重挂一次 */
const RETRY_DELAY = 1500

export function useTurnstile(options = {}) {
    /** 挂载点，绑给容器 div 的 ref */
    const container = ref(null)
    /** 容器是否出现在 DOM 里（第一次提交被判定需要验证时才为 true） */
    const visible = ref(false)
    /** 脚本本身没加载出来：这时不能再提示「请完成验证」，得让用户刷新 */
    const scriptError = ref(false)
    /** 验证通过后的 token，提交时带给后端 */
    const token = ref('')

    let widgetId = null
    let errorCount = 0
    let retryTimer = null

    function clearTimer() {
        if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
        }
    }

    /** 失败重挂：先 reset 已有 widget，没有就重新 render */
    function scheduleRetry() {
        if (errorCount >= MAX_RETRY) return
        errorCount += 1
        clearTimer()
        retryTimer = setTimeout(() => {
            retryTimer = null
            nextTick(() => {
                if (widgetId !== null) window.turnstile?.reset(widgetId)
                else mount()
            })
        }, RETRY_DELAY)
    }

    /**
     * 真正调用 `turnstile.render`。sitekey 由站长在系统设置里配置；
     * `theme` 在渲染那一刻定下来，之后切主题不重挂 —— 重挂会把用户已经过了的挑战清掉。
     */
    function mount() {
        if (widgetId !== null || !container.value) return
        const sitekey = options.sitekey?.()
        if (!sitekey) return

        try {
            widgetId = window.turnstile.render(container.value, {
                sitekey,
                theme: options.theme?.() ?? 'auto',
                callback: (value) => {
                    token.value = value
                    scriptError.value = false
                },
                'error-callback': (error) => {
                    console.warn('[turnstile] 人机验证加载失败', error)
                    scheduleRetry()
                },
                'expired-callback': () => {
                    token.value = ''
                },
            })
        } catch (error) {
            // window.turnstile 不存在（脚本被拦 / 断网）：这条路上重试也没意义
            scriptError.value = true
            console.warn('[turnstile] 人机验证脚本未加载', error)
        }
    }

    /** 让容器出现并挂上 widget；已经挂过就什么都不做 */
    async function show() {
        visible.value = true
        await nextTick()
        mount()
    }

    /** 后端判 400（token 被用过/无效）时调用：清 token 并要求重新验证 */
    async function reset() {
        token.value = ''
        visible.value = true
        await nextTick()
        if (widgetId !== null) window.turnstile?.reset(widgetId)
        else mount()
    }

    /** 注册成功后收起：容器和 widget 一起丢掉，下次进来重新挂 */
    function teardown() {
        clearTimer()
        if (widgetId !== null) {
            try {
                window.turnstile?.remove(widgetId)
            } catch {
                // widget 已被脚本自己清掉，忽略
            }
            widgetId = null
        }
        token.value = ''
        visible.value = false
        errorCount = 0
    }

    onScopeDispose(teardown)

    return {container, visible, scriptError, token, show, reset, teardown}
}
