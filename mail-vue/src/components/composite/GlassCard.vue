<script setup>
/**
 * GlassCard — 玻璃材质容器（§6.2 / §4.12）
 *
 * 全站只有四个使用面：登录卡、命令面板、移动端 Sheet、模态遮罩（§5.1 末）。
 * 材质数值一个都不硬编码，全部来自 §4.12 的 `--um-glass-*`。
 *
 * **三层结构**（§6.2「`::before` 高光内描边 → 内容 → 外投影」）：
 * 底色 + `backdrop-filter` 只挂在根节点（避免嵌套模糊叠加），高光走 `::before` 且
 * `z-index: -10` —— 负层级的绝对定位子元素画在「根节点自己的背景之后、在流内内容之前」，
 * 正好是要的顺序，于是**不需要**为内容再套一层 div（套了会毁掉调用方传的 flex/grid）。
 * 根节点的 `isolate` 保证这条负层级不会穿到祖先的背景下面去。
 *
 * **不透明度**：`opacity` 缺省读 token；登录卡传站长的 `setting.login_opacity`（§5.3.1）。
 * 实际取 `max(opacity, --um-glass-min-alpha)`，所以两条硬规则永远压得住站长的值：
 * 没有 `backdrop-filter` 时退到 96%/94%，`prefers-contrast: more` 时退到实色（见 tokens.css）。
 */
import {computed} from 'vue'
import {Primitive} from 'reka-ui'
import {GLASS_ALPHA_MIN} from '@/design/glass.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 不透明度 0.55–1.00；缺省读 `--um-glass-alpha` @type {number|string|null} */
    opacity: {type: [Number, String], default: null},
    /** 模糊半径，数字按 px；缺省读 `--um-glass-blur`（Light 20 / Dark 24） @type {number|string|null} */
    blur: {type: [Number, String], default: null},
    /** @type {'lg'|'md'|'none'} lg = §4.12 的 `--um-glass-shadow` */
    elevation: {type: String, default: 'lg'},
    /** @type {'lg'|'xl'|'2xl'} 登录卡用 2xl（20px，全站唯一一处），其余玻璃面用 lg */
    radius: {type: String, default: 'lg'},
    as: {type: String, default: 'div'},
    asChild: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

/**
 * §5.3.1 对比度守卫：不透明度下限 0.55。
 * 注意这条只保证「压在纯色底上」够读；站长背景图的亮度是任意的，那种情况下限要
 * 抬到 0.88，由调用方（AuthLayout）用 `authCardAlpha()` 决定 —— 组件本身看不见背景图。
 */
const ALPHA_MIN = GLASS_ALPHA_MIN

const RADIUS = {lg: 'rounded-lg', xl: 'rounded-xl', '2xl': 'rounded-2xl'}
const ELEVATION = {lg: 'shadow-[var(--um-glass-shadow)]', md: 'shadow-md', none: 'shadow-none'}

const alpha = computed(() => {
    const raw = Number(props.opacity)
    if (props.opacity === null || props.opacity === '' || Number.isNaN(raw)) return 'var(--um-glass-alpha)'
    return String(Math.min(1, Math.max(ALPHA_MIN, raw)))
})

const style = computed(() => ({
    background: `rgb(var(--um-glass-tint) / max(${alpha.value}, var(--um-glass-min-alpha)))`,
    '--um-card-blur': props.blur === null || props.blur === ''
        ? 'var(--um-glass-blur)'
        : (typeof props.blur === 'number' ? `${props.blur}px` : props.blur),
}))

const rootClass = computed(() => cn(
    'relative isolate border border-(--um-glass-border)',
    RADIUS[props.radius] ?? RADIUS.lg,
    ELEVATION[props.elevation] ?? ELEVATION.lg,
    'backdrop-blur-(--um-card-blur) backdrop-saturate-(--um-glass-saturate)',
    // 高光：只在上缘一条 1px 内描边。禁止整圈流光（§5.3.1「廉价感的两个典型来源」之一）
    'before:pointer-events-none before:absolute before:inset-0 before:-z-10',
    'before:rounded-[inherit] before:shadow-[inset_0_1px_0_0_var(--um-glass-highlight)]',
    // 高对比：实色底（token 已把 alpha 抬到 1）+ 实线边框，模糊与高光一并撤掉
    'contrast-more:backdrop-filter-none contrast-more:border-line-strong contrast-more:before:hidden',
    props.class,
))
</script>

<template>
  <Primitive v-if="asChild" as-child :class="rootClass" :style="style">
    <slot />
  </Primitive>
  <Primitive v-else :as="as" :class="rootClass" :style="style">
    <slot />
  </Primitive>
</template>
