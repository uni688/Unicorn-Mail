/**
 * 断点：收敛为 5 个（§4.4），取代散落各处的 19 个 media query 与
 * layout/index.vue:34-45、layout/main:93-100、router:163-171 的 window.innerWidth 判断。
 *
 * 与 design/tokens.css 的 --breakpoint-* 同源，改一处必须改两处。
 * 用 matchMedia 而不是 resize + innerWidth：没有 resize 抖动、不需要防抖。
 */
import {computed, ref} from 'vue'

export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
}

const ORDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl']

/** 各断点的 matchMedia 单例，多个组件共用同一批监听器 */
const queries = new Map()

function matches(minWidth) {
    if (!queries.has(minWidth)) {
        const mql = window.matchMedia(`(min-width: ${minWidth}px)`)
        const state = ref(mql.matches)
        const onChange = (e) => {
            state.value = e.matches
        }
        mql.addEventListener('change', onChange)
        queries.set(minWidth, state)
    }
    return queries.get(minWidth)
}

export function useBreakpoint() {
    const smAndUp = matches(BREAKPOINTS.sm)
    const mdAndUp = matches(BREAKPOINTS.md)
    const lgAndUp = matches(BREAKPOINTS.lg)
    const xlAndUp = matches(BREAKPOINTS.xl)
    const xxlAndUp = matches(BREAKPOINTS['2xl'])

    /** 当前命中的最大断点名：xs | sm | md | lg | xl | 2xl */
    const current = computed(() => {
        if (xxlAndUp.value) return '2xl'
        if (xlAndUp.value) return 'xl'
        if (lgAndUp.value) return 'lg'
        if (mdAndUp.value) return 'md'
        if (smAndUp.value) return 'sm'
        return 'xs'
    })

    return {
        current,
        smAndUp, mdAndUp, lgAndUp, xlAndUp, xxlAndUp,
        /** 单列 + 底部 Tab（< md） */
        isMobile: computed(() => !mdAndUp.value),
        /** 双列，侧栏为 Drawer（md ~ lg） */
        isTablet: computed(() => mdAndUp.value && !lgAndUp.value),
        /** 侧栏常驻（≥ lg） */
        isDesktop: lgAndUp,
        /** 三栏常驻（≥ xl） */
        isWide: xlAndUp,
        /** name 及以上 */
        greaterOrEqual: (name) => computed(() => ORDER.indexOf(current.value) >= ORDER.indexOf(name)),
        /** 小于 name */
        smallerThan: (name) => computed(() => ORDER.indexOf(current.value) < ORDER.indexOf(name)),
    }
}

/** 非组件上下文（router guard 等）用的一次性同步判断 */
export function breakpointNow() {
    const w = window.innerWidth
    if (w >= BREAKPOINTS['2xl']) return '2xl'
    if (w >= BREAKPOINTS.xl) return 'xl'
    if (w >= BREAKPOINTS.lg) return 'lg'
    if (w >= BREAKPOINTS.md) return 'md'
    if (w >= BREAKPOINTS.sm) return 'sm'
    return 'xs'
}
