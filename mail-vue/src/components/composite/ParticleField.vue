<script setup>
/**
 * ParticleField — 粒子背板（§8.5；自写 Canvas 2D，零新增依赖）
 *
 * 只出现在认证页（全屏）与应用内空状态插画区（局部，点数减半由调用方传 `density`）。
 * 邮件三栏、列表、表格、表单区域一律不绘制。
 *
 * 铁律是「关掉它品质感不下降，开着它性能与可读性不下降」，所以这里几乎全是**约束**：
 *
 * - 点数 `min(72, w*h/22000)`，平板上限 40，移动端直接不启动 canvas（只留柔光层）
 * - 形态：半径 0.6–1.6px 的单色圆点。不连线、不跟随鼠标、不发光、不彩色、不呼吸
 * - 运动：匀速直线 2–6 px/s（初始化时定一次），边界环绕，无加速度、无点击特效
 * - 30fps 节流 + `devicePixelRatio` 上限 2
 * - 暂停：页面不可见 / 离屏 / 窗口失焦；`prefers-reduced-motion` 画一帧静态点阵后停 RAF
 *   （不是整层不渲染 —— 运动一停就少一层会让页面「空一块」）
 * - 自我降级：连续 20 帧超 8ms → 点数减半 → 再触发 → 退成纯柔光并记一条 `console.debug`
 * - 尺寸变化：`ResizeObserver` + 200ms 防抖**重算点数**，不重建实例
 * - 主题切换只换颜色，不重建 canvas
 * - 卸载必须 `cancelAnimationFrame` + 断开两个 observer
 *   （`views/email/index.vue` 的长轮询就是「路由走了循环还在跑」的现成反例）
 */
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useEventListener, useMediaQuery} from '@vueuse/core'
import {useBreakpoint} from '@/composables/useBreakpoint.js'
import {useTheme} from '@/composables/useTheme.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'off'|'static'|'animated'} `static` = 只画一帧（reduced-motion） */
    mode: {type: String, default: 'animated'},
    /** 点数；缺省按面积算 `min(72, w*h/22000)` @type {number|null} */
    density: {type: Number, default: null},
    /** 点色：`r g b` 三元组或整段 CSS 颜色；缺省读 `--um-particle-color` @type {string|null} */
    color: {type: String, default: null},
    class: {type: [String, Array, Object], default: undefined},
})

/* 以下数值全部来自 §8.5 的规格表 —— 改这里等于改规格 */
const MAX_POINTS = 72
const AREA_PER_POINT = 22000
const TABLET_MAX = 40
const FRAME_MS = 1000 / 30
const DPR_MAX = 2
const RADIUS = [0.6, 1.6]
const SPEED = [2 / 1000, 6 / 1000] // px/ms
const BUDGET_MS = 8
const BUDGET_STREAK = 20
const RESIZE_DEBOUNCE = 200
/** 单帧步进上限：标签页切回来时 `ts` 会跳一大截，不夹住点会瞬移 */
const DT_MAX = 100

const canvasRef = ref(null)
const {isMobile, isTablet} = useBreakpoint()
const {isDark} = useTheme()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

/** 两次降档后本次会话彻底退出（纯柔光），不再试探 */
const bailed = ref(false)

const effectiveMode = computed(() => {
    if (props.mode === 'off' || bailed.value) return 'off'
    // 移动端点数为 0，挂一张永远空的 canvas 没有意义
    if (isMobile.value) return 'off'
    return reducedMotion.value ? 'static' : props.mode
})

/* 每帧都要碰的状态一律不进 ref：这里交响应式的税只会拖慢绘制 */
let ctx = null
let width = 0
let height = 0
let dpr = 1
let points = []
let rafId = 0
let lastFrame = 0
let overBudget = 0
let halved = false
let fill = 'rgb(110 86 207 / 0.08)'
let resizeTimer = 0
let resizeObserver = null
let viewObserver = null
let onscreen = true
let focused = true

/** 颜色从元素自身的计算样式读，所以主题一变重读一次就够（不必重建 canvas） */
function readFill() {
    const el = canvasRef.value
    if (!el) return fill
    const cs = getComputedStyle(el)
    const alpha = cs.getPropertyValue('--um-particle-alpha').trim() || '0.08'
    const raw = (props.color || cs.getPropertyValue('--um-particle-color')).trim() || '110 86 207'
    // 调用方也可以直接给整段颜色（空状态插画区想换色时）
    return /[(#]/.test(raw) ? raw : `rgb(${raw} / ${alpha})`
}

function targetCount() {
    const base = props.density ?? Math.floor((width * height) / AREA_PER_POINT)
    const n = Math.min(base, isTablet.value ? TABLET_MAX : MAX_POINTS)
    return Math.max(0, halved ? Math.floor(n / 2) : n)
}

function spawn() {
    const angle = Math.random() * Math.PI * 2
    const speed = SPEED[0] + Math.random() * (SPEED[1] - SPEED[0])
    return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: RADIUS[0] + Math.random() * (RADIUS[1] - RADIUS[0]),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
    }
}

/** 只增删尾部：已有的点保持原位与原速，尺寸变化时画面不会整层重排 */
function syncPoints() {
    const n = targetCount()
    if (points.length > n) points.length = n
    else while (points.length < n) points.push(spawn())
}

function measure() {
    const el = canvasRef.value
    if (!el) return
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX)
    width = el.clientWidth
    height = el.clientHeight
    el.width = Math.max(1, Math.round(width * dpr))
    el.height = Math.max(1, Math.round(height * dpr))
    // 改 width/height 会重置变换，所以每次 measure 之后都要重设
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** 所有点同色，攒成一条 path 一次 fill —— 58 个点也只有一次绘制调用 */
function draw() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = fill
    ctx.beginPath()
    for (const p of points) {
        // 每段 arc 前先 moveTo，否则相邻两点之间会连出一条线
        ctx.moveTo(p.x + p.r, p.y)
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    }
    ctx.fill()
}

function advance(dt) {
    for (const p of points) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        // 环绕留一个半径的余量，点不会在边缘半个身子地闪
        if (p.x < -p.r) p.x = width + p.r
        else if (p.x > width + p.r) p.x = -p.r
        if (p.y < -p.r) p.y = height + p.r
        else if (p.y > height + p.r) p.y = -p.r
    }
}

/** 帧预算守卫：连续 20 帧超 8ms → 减半 → 再触发 → 纯柔光（只记 debug，不弹 Toast） */
function guard(cost) {
    if (cost <= BUDGET_MS) {
        overBudget = 0
        return
    }
    if (++overBudget < BUDGET_STREAK) return
    overBudget = 0
    if (!halved) {
        halved = true
        syncPoints()
        return
    }
    console.debug('[ParticleField] 帧预算连续超标，已退化为纯柔光')
    bailed.value = true // → effectiveMode 'off' → canvas 卸载 → teardown
}

function step(ts) {
    rafId = requestAnimationFrame(step)
    const elapsed = ts - lastFrame
    if (elapsed < FRAME_MS) return
    lastFrame = ts
    const t0 = performance.now()
    advance(Math.min(elapsed, DT_MAX))
    draw()
    guard(performance.now() - t0)
}

function shouldAnimate() {
    return effectiveMode.value === 'animated' && onscreen && focused
        && document.visibilityState === 'visible'
}

function start() {
    if (rafId || !ctx) return
    lastFrame = performance.now() - FRAME_MS
    rafId = requestAnimationFrame(step)
}

function stop() {
    if (!rafId) return
    cancelAnimationFrame(rafId)
    rafId = 0
}

function syncLoop() {
    if (shouldAnimate()) start()
    else stop()
}

function setup(el) {
    ctx = el.getContext('2d')
    if (!ctx) return
    fill = readFill()
    measure()
    syncPoints()
    draw() // static 模式就停在这一帧

    resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
            measure()
            syncPoints()
            draw()
        }, RESIZE_DEBOUNCE)
    })
    resizeObserver.observe(el)

    viewObserver = new IntersectionObserver(([entry]) => {
        onscreen = entry.isIntersecting
        syncLoop()
    })
    viewObserver.observe(el)

    syncLoop()
}

function teardown() {
    stop()
    clearTimeout(resizeTimer)
    resizeObserver?.disconnect()
    viewObserver?.disconnect()
    resizeObserver = null
    viewObserver = null
    ctx = null
    points = []
}

// flush post：要等 canvas 真的进了 DOM 才量得到 clientWidth
watch(canvasRef, (el) => (el ? setup(el) : teardown()), {flush: 'post'})
watch(effectiveMode, syncLoop)
watch(isDark, () => {
    fill = readFill()
    draw()
})
watch([isTablet, () => props.density], () => {
    syncPoints()
    draw()
})

useEventListener(document, 'visibilitychange', syncLoop)
useEventListener(window, 'blur', () => {
    focused = false
    syncLoop()
})
useEventListener(window, 'focus', () => {
    focused = true
    syncLoop()
})

onBeforeUnmount(teardown)




</script>

<template>
  <canvas
    v-if="effectiveMode !== 'off'"
    ref="canvasRef"
    :class="cn('pointer-events-none absolute inset-0 block h-full w-full', props.class)"
    aria-hidden="true"
  />
</template>
