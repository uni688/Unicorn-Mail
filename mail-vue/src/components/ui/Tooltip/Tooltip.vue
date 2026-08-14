<script setup>
/**
 * Tooltip — L1 原语（Reka `Tooltip`，§4.11）
 *
 * 只放纯文字说明：tooltip 里不能有可点内容（键盘用户到不了），
 * 需要可交互就换 Popover。图标按钮的名字也不能只靠 tooltip —— 那是 aria-label 的活。
 *
 * 这里自带 TooltipProvider：reka 的 TooltipRoot 强制要求祖先有 provider，
 * 不自带就会在任何「单独挂一个 Tooltip」的场景（测试、独立页）直接抛错。
 * 代价是跨 tooltip 的 skipDelay 协同失效（移动到相邻按钮仍要重新等 delay），
 * 与「组件必须能被任意宿主挂载」相比这点损失可以接受。
 */
import {TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 提示文案（也可用默认插槽 #content） */
    text: {type: String, default: ''},
    open: {type: Boolean, default: undefined},
    /** @type {'top'|'right'|'bottom'|'left'} */
    side: {type: String, default: 'top'},
    /** @type {'start'|'center'|'end'} */
    align: {type: String, default: 'center'},
    sideOffset: {type: Number, default: 6},
    /** 悬停多久才出，默认 400ms（§8.1 没规定，取 reka 默认的手感） */
    delay: {type: Number, default: 400},
    disabled: {type: Boolean, default: false},
    arrow: {type: Boolean, default: true},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])
</script>

<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot
      :open="open"
      :disabled="disabled"
      :delay-duration="delay"
      @update:open="emit('update:open', $event)"
    >
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          :side="side"
          :align="align"
          :side-offset="sideOffset"
          :class="cn(
            'z-50 max-w-64 rounded-md bg-neutral-strong px-2 py-1 text-caption text-on-strong shadow-md',
            'origin-(--reka-tooltip-content-transform-origin)',
            'data-[state=delayed-open]:animate-popover-in data-[state=instant-open]:animate-popover-in',
            'data-[state=closed]:animate-popover-out',
            props.contentClass,
          )"
        >
          <slot name="content">{{ text }}</slot>
          <TooltipArrow v-if="arrow" class="fill-neutral-strong" :width="8" :height="4" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
