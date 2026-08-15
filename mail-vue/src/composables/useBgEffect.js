/**
 * useBgEffect — 背景效果的两级开关（§8.5 末段，判定表见 §0.3）
 *
 * 站长策略优先，`optional` 时才看用户偏好：
 *
 * ```
 * pref = admin==='off' ? 'off' : admin==='on' ? 'particles' : (user ?? 'glow')
 * glowVisible  = pref !== 'off'
 * particleMode = pref !== 'particles' ? 'off'
 *              : reducedMotion || isMobile || isLowEnd ? 'static' : 'animated'
 * ```
 *
 * 两个数据源都还没落库（§10.5 增量 4/5 排在 P5）：
 * - `admin` 读 `settingStore.settings.bgEffect`，字段还不存在时按 `'optional'` 处理
 *   —— 未登录的登录页也拿得到，因为它会进 `websiteConfig` 白名单。
 * - `user` 暂存 localStorage（`um-bg-effect`），P5 接 `GET/PUT /user/prefs` 后
 *   这里只需把 `readUserPref/writeUserPref` 换成读 store，调用方不用改。
 *
 * `adminLocked` 给设置页用：站长选了 `on`/`off` 时用户侧那组单选要**置灰而不是隐藏**
 * （§8.5：隐藏会让用户以为功能坏了）。
 */
import {computed, ref} from 'vue'
import {useMediaQuery} from '@vueuse/core'
import {useSettingStore} from '@/store/setting.js'
import {useBreakpoint} from '@/composables/useBreakpoint.js'

/** 用户侧三选一（站长侧是 off / on / optional，语义不同，别混用） */
export const USER_BG_MODES = ['off', 'glow', 'particles']

const USER_KEY = 'um-bg-effect'

const userPref = ref(readUserPref())

function readUserPref() {
    try {
        const raw = localStorage.getItem(USER_KEY)
        return USER_BG_MODES.includes(raw) ? raw : null
    } catch {
        return null
    }
}

/**
 * 低端设备判定（§8.5）：直接退到纯柔光，连 canvas 都不启动。
 * 只在模块加载时算一次 —— 这两个值不会在一次会话里变。
 */
const isLowEnd = (() => {
    if (typeof navigator === 'undefined') return false
    if ((navigator.hardwareConcurrency || 8) <= 4) return true
    return !!navigator.connection?.saveData
})()

export function useBgEffect() {
    const settingStore = useSettingStore()
    const {isMobile} = useBreakpoint()
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

    /** 站长策略：'off' | 'on' | 'optional'（字段缺失 = 还没上增量 5 = 交给用户决定） */
    const adminPolicy = computed(() => {
        const raw = settingStore.settings?.bgEffect
        return raw === 'off' || raw === 'on' ? raw : 'optional'
    })

    const adminLocked = computed(() => adminPolicy.value !== 'optional')

    const pref = computed(() => {
        if (adminPolicy.value === 'off') return 'off'
        if (adminPolicy.value === 'on') return 'particles'
        return userPref.value ?? 'glow'
    })

    const glowVisible = computed(() => pref.value !== 'off')

    const particleMode = computed(() => {
        if (pref.value !== 'particles') return 'off'
        // 低端设备与移动端「不启动 canvas」（§8.5），柔光层照旧，视觉上不缺一块
        if (isLowEnd || isMobile.value) return 'off'
        // reduced-motion 画一帧静态点阵后停 RAF —— 减少动效 ≠ 减少装饰
        if (reducedMotion.value) return 'static'
        return 'animated'
    })

    function setUserPref(mode) {
        if (!USER_BG_MODES.includes(mode)) return
        userPref.value = mode
        try {
            localStorage.setItem(USER_KEY, mode)
        } catch { /* 隐私模式：本次会话生效即可 */ }
    }

    return {
        pref,
        glowVisible,
        particleMode,
        adminPolicy,
        adminLocked,
        userPref: computed(() => userPref.value ?? 'glow'),
        setUserPref,
        isLowEnd,
        reducedMotion,
    }
}
