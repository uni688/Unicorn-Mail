<script setup>
/**
 * Spinner — L1 原语（§4.11）
 *
 * 单独的等待指示器（Button 内部的 spinner 是它的简化版，不复用这个组件是为了
 * 避免多一层 DOM）。默认对读屏隐身：
 * - 不给 `label`：纯装饰，容器自己挂 aria-busy
 * - 给 `label`：role="status"，读屏会播报一次「加载中…」
 */
import IconLoader from '~icons/lucide/loader-circle'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'xs'|'sm'|'md'|'lg'} */
    size: {type: String, default: 'sm'},
    /** 可读说明；留空则纯装饰 */
    label: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const SIZE = {xs: 'size-3', sm: 'size-4', md: 'size-5', lg: 'size-6'}
</script>

<template>
  <span
    :role="label ? 'status' : undefined"
    :aria-hidden="label ? undefined : true"
    :class="cn('inline-flex items-center gap-2 align-middle', props.class)"
  >
    <IconLoader :class="cn('shrink-0 animate-spin text-fg-muted', SIZE[size])" aria-hidden="true" />
    <span v-if="label" class="sr-only">{{ label }}</span>
  </span>
</template>
