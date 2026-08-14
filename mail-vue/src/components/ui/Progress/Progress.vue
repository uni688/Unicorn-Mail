<script setup>
/**
 * Progress — L1 原语（§4.11）
 *
 * - `modelValue = null` 表示不确定进度（一条 40% 宽的条来回扫）
 * - 语义由 reka 的 ProgressRoot 提供（role="progressbar" + aria-value*），
 *   这里只负责几何与配色；`label` 会写进 aria-label。
 *   注意用 `v-bind` 条件展开而不是 `:aria-label="label || undefined"`——
 *   显式传 undefined 会盖掉 reka 自带的 `getValueLabel`（那句「40%」），
 *   结果是不给 label 时进度条一个可访问名字都没有。
 * - 进度条是「非文字元素」，底色用 bg-inset、条用 -solid 档，3:1 已由 token 测试覆盖
 */
import {computed} from 'vue'
import {ProgressIndicator, ProgressRoot} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 0..max；null = 不确定 */
    modelValue: {type: Number, default: null},
    max: {type: Number, default: 100},
    /** @type {'accent'|'success'|'warning'|'danger'|'info'} */
    tone: {type: String, default: 'accent'},
    /** @type {'xs'|'sm'|'md'} */
    size: {type: String, default: 'sm'},
    /** 无障碍名称 */
    label: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const TONE = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
}

const HEIGHT = {xs: 'h-1', sm: 'h-1.5', md: 'h-2'}

const isIndeterminate = computed(() => props.modelValue === null || props.modelValue === undefined)

const percent = computed(() => {
    if (isIndeterminate.value) return 0
    const max = props.max > 0 ? props.max : 100
    return Math.min(100, Math.max(0, (props.modelValue / max) * 100))
})
</script>

<template>
  <ProgressRoot
    :model-value="modelValue"
    :max="max"
    v-bind="label ? {'aria-label': label} : {}"
    :class="cn('relative w-full overflow-hidden rounded-full bg-inset', HEIGHT[size], props.class)"
  >
    <ProgressIndicator
      v-if="!isIndeterminate"
      :class="cn('h-full rounded-full transition-[width] duration-300 ease-out', TONE[tone])"
      :style="{width: `${percent}%`}"
    />
    <ProgressIndicator
      v-else
      :class="cn('h-full w-2/5 rounded-full animate-progress-indeterminate', TONE[tone])"
    />
  </ProgressRoot>
</template>
