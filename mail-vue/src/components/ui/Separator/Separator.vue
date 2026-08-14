<script setup>
/**
 * Separator — L1 原语（§4.11）
 *
 * 默认 `decorative`：分隔线在读屏里通常是噪音。只有当它真的在表达「上下是两组
 * 不同内容」时才传 `:decorative="false"`，那时 reka 会渲染 role="separator"。
 */
import {Separator as RekaSeparator} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'horizontal'|'vertical'} */
    orientation: {type: String, default: 'horizontal'},
    decorative: {type: Boolean, default: true},
    /** 用 border-line-strong 而不是 border-line */
    strong: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})
</script>

<template>
  <RekaSeparator
    :orientation="orientation"
    :decorative="decorative"
    :class="cn(
      'shrink-0',
      strong ? 'bg-line-strong' : 'bg-line',
      orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
      props.class,
    )"
  />
</template>
