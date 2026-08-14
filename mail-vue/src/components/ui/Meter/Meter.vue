<script setup>
/**
 * Meter — L1 原语（§4.11；配额场景见 §6.2 MiniQuota / QuotaMeter）
 *
 * 与 Progress 的区别：Progress 表达「事情做到哪了」，Meter 表达「某个量在区间里的位置」，
 * 因此用 role="meter" 并带 aria-valuetext（读屏会念「已发 3 / 50」而不是「3%」）。
 *
 * `tone="auto"`：≥90% 转 danger、≥70% 转 warning。颜色只是冗余提示，
 * 真正的信息在 valueText 里，符合「不靠颜色单独表意」（§4.2）。
 */
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    value: {type: Number, default: 0},
    min: {type: Number, default: 0},
    max: {type: Number, default: 100},
    /** @type {'auto'|'accent'|'success'|'warning'|'danger'|'info'} */
    tone: {type: String, default: 'auto'},
    /** @type {'xs'|'sm'|'md'} */
    size: {type: String, default: 'xs'},
    /** 无障碍名称，如「今日发信」 */
    label: {type: String, default: ''},
    /** 读屏播报的人话，如「已发 3 / 50」；不给就退化成百分比 */
    valueText: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const TONE = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
}

const HEIGHT = {xs: 'h-0.5', sm: 'h-1', md: 'h-1.5'}

const percent = computed(() => {
    const span = props.max - props.min
    if (!Number.isFinite(span) || span <= 0) return 0
    return Math.min(100, Math.max(0, ((props.value - props.min) / span) * 100))
})

const resolvedTone = computed(() => {
    if (props.tone !== 'auto') return props.tone
    if (percent.value >= 90) return 'danger'
    if (percent.value >= 70) return 'warning'
    return 'accent'
})
</script>

<template>
  <div
    role="meter"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuetext="valueText || `${Math.round(percent)}%`"
    :aria-label="label || undefined"
    :data-tone="resolvedTone"
    :class="cn('w-full overflow-hidden rounded-full bg-inset', HEIGHT[size], props.class)"
  >
    <div
      :class="cn('h-full rounded-full transition-[width,background-color] duration-300 ease-out', TONE[resolvedTone])"
      :style="{width: `${percent}%`}"
    />
  </div>
</template>
