/**
 * 主题：light / dark / system（§9.1）
 *
 * - 存储：localStorage['um-theme']，首次运行自动从旧的 pinia 持久化值 ui.dark 迁移
 * - 应用：<html class="dark"> + <html data-theme="light|dark">，用 classList 而非
 *   setAttribute('class', …)，避免像原 switchDark 那样清掉 <html> 上的其它类
 * - system：监听 matchMedia 实时切换
 * - 切换动画：复用 style.css 迁来的 View Transitions 径向扩散（design/view-transition.css）
 * - uiStore.dark 继续同步维护，tiny-editor / analysis / login 等旧代码不用改
 *
 * 注意：index.html 里的防闪白内联脚本必须与本文件的 THEME_COLOR 保持一致。
 */
import {computed, ref} from 'vue'
import {useUiStore} from '@/store/ui.js'

export const THEME_KEY = 'um-theme'
export const THEME_MODES = ['light', 'dark', 'system']

/** 与 index.html 内联脚本重复的唯一一处常量，改这里也要改那里 */
const THEME_COLOR = {
    dark: {mobile: '#0A0A0B', desktop: '#101012'},
    light: {mobile: '#FFFFFF', desktop: '#FAFAFB'},
}

const mode = ref(readStoredMode())
const systemDark = ref(prefersDark())
const isDark = computed(() => mode.value === 'system' ? systemDark.value : mode.value === 'dark')

let uiStore = null
let mediaBound = false
/**
 * 同一时刻只允许一个 View Transition。连点主题按钮时，后一次直接切换：
 * 两次径向扩散互相打断会让 startViewTransition().finished 以 InvalidStateError
 * reject（浏览器控制台里的 Uncaught (in promise)），观感也是乱的。
 */
let transitioning = false

function prefersDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function isMobileViewport() {
    return !window.matchMedia('(pointer: fine) and (hover: hover)').matches
}

function readStoredMode() {
    const stored = localStorage.getItem(THEME_KEY)
    if (THEME_MODES.includes(stored)) {
        return stored
    }
    // 迁移：旧版把 dark 存在 pinia 持久化的 ui 里
    try {
        const legacy = JSON.parse(localStorage.getItem('ui') || 'null')
        if (legacy && typeof legacy.dark === 'boolean') {
            return legacy.dark ? 'dark' : 'light'
        }
    } catch {
        /* 忽略损坏的历史数据 */
    }
    return 'system'
}

/** 把当前 mode 落到 DOM 与 uiStore（幂等，可重复调用） */
function applyTheme() {
    const root = document.documentElement
    const dark = isDark.value

    root.classList.toggle('dark', dark)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.themeMode = mode.value

    const meta = document.getElementById('theme-color-meta')
    if (meta) {
        const palette = THEME_COLOR[dark ? 'dark' : 'light']
        meta.setAttribute('content', isMobileViewport() ? palette.mobile : palette.desktop)
    }

    if (uiStore) {
        uiStore.dark = dark
    }
}

function bindSystemListener() {
    if (mediaBound) {
        return
    }
    mediaBound = true
    window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', (e) => {
            systemDark.value = e.matches
            if (mode.value === 'system') {
                applyTheme()
            }
        })
}

/**
 * 在 main.js 里、pinia 装好之后调用一次。
 * 内联脚本已经写好了首帧 class，这里只是把状态对齐并接上监听。
 */
export function initTheme() {
    uiStore = useUiStore()
    bindSystemListener()
    localStorage.setItem(THEME_KEY, mode.value)
    applyTheme()
}

export function useTheme() {
    /**
     * 切主题。带鼠标事件时用 View Transitions 从点击点径向扩散，
     * 不支持或用户要求减少动效时直接切。
     * @param {'light'|'dark'|'system'} next
     * @param {MouseEvent} [event]
     */
    function setMode(next, event) {
        if (!THEME_MODES.includes(next)) {
            return
        }

        const wasDark = isDark.value
        const commit = () => {
            mode.value = next
            localStorage.setItem(THEME_KEY, next)
            applyTheme()
        }

        const willDark = next === 'system' ? systemDark.value : next === 'dark'
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const root = document.documentElement

        if (!document.startViewTransition || reduceMotion || willDark === wasDark || transitioning) {
            commit()
            return
        }

        const x = event?.clientX ?? window.innerWidth / 2
        const y = event?.clientY ?? 0
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y),
        )

        // 标记切换目标，供 view-transition.css 的选择器使用
        root.setAttribute('data-theme-to', willDark ? 'dark' : 'light')
        root.style.setProperty('--vt-x', `${x}px`)
        root.style.setProperty('--vt-y', `${y}px`)
        root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

        transitioning = true
        const cleanup = () => {
            transitioning = false
            root.removeAttribute('data-theme-to')
        }
        const transition = document.startViewTransition(commit)
        // 过渡被跳过（标签页不可见、被打断）时 ready / updateCallbackDone 都会 reject，
        // 没人接手就是控制台里的 Uncaught (in promise) InvalidStateError
        transition.ready.catch(() => {})
        transition.updateCallbackDone.catch(() => {})
        // finished 用 then(cleanup, cleanup) 而不是 finally：
        // finally 会把 rejection 继续往下传，同样变成未捕获的 Promise 异常
        transition.finished.then(cleanup, cleanup)
    }

    /** 明暗互切（system 时按当前解析结果取反），保持原顶栏按钮的交互 */
    function toggle(event) {
        setMode(isDark.value ? 'light' : 'dark', event)
    }

    return {mode, isDark, systemDark, setMode, toggle}
}
