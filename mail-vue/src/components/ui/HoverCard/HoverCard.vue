<script setup>
/**
 * HoverCard — L1 原语（Reka `HoverCard`，§4.11）
 *
 * 用在「悬停预览」：发件人卡片、域名健康摘要。和 Tooltip 的区别是里面可以有富内容，
 * 但**不能承载唯一入口**——纯 hover 触发的东西键盘和触屏都到不了，
 * 所以卡片里的操作必须在别处也有等价入口（§4.10）。
 */
import {HoverCardArrow, HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {popoverPanelVariants} from '../_shared/overlay.variants.js'

const props = defineProps({
    open: {type: Boolean, default: undefined},
    /** @type {'top'|'right'|'bottom'|'left'} */
    side: {type: String, default: 'bottom'},
    /** @type {'start'|'center'|'end'} */
    align: {type: String, default: 'start'},
    sideOffset: {type: Number, default: 6},
    openDelay: {type: Number, default: 300},
    closeDelay: {type: Number, default: 150},
    arrow: {type: Boolean, default: false},
    width: {type: String, default: 'w-72'},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])
</script>

<template>
  <HoverCardRoot
    :open="open"
    :open-delay="openDelay"
    :close-delay="closeDelay"
    @update:open="emit('update:open', $event)"
  >
    <HoverCardTrigger as-child>
      <slot name="trigger" />
    </HoverCardTrigger>

    <HoverCardPortal>
      <HoverCardContent
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :class="cn(popoverPanelVariants({padding: 'content'}), width, props.contentClass)"
      >
        <slot />
        <HoverCardArrow v-if="arrow" class="fill-raised stroke-line" :width="10" :height="5" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
