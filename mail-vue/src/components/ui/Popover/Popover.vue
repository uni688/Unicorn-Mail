<script setup>
/**
 * Popover — L1 原语（Reka `Popover`，§4.11）
 *
 * 承载「点开才看的小块内容」：筛选面板、邮箱详情卡、快捷设置。
 * 与 Tooltip 的分工：Popover 可交互、可聚焦、点击触发；Tooltip 只读、hover/focus 触发。
 *
 * 面板的可访问名称由 reka 决定，且**改不了**：`PopoverContentImpl` 把
 * `aria-labelledby` 硬写成触发器的 id，任何从外面传进来的同名属性都会在
 * FocusScope → DismissableLayer → PopperContent 这一串 as-child 传递里被它盖掉
 * （`aria-label` 也没用 —— 有 labelledby 时它按 ARIA 优先级直接失效）。
 * 于是：**面板的名字 = 触发器的名字**，图标触发器必须自己带 `aria-label`。
 * `title` 只负责可见标题（读屏进面板后作为首个内容念到），不参与命名。
 */
import {PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger} from 'reka-ui'
import IconX from '~icons/lucide/x'
import {cn} from '@/utils/cn.js'
import {popoverPanelVariants} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    /** 受控开关，可 v-model:open */
    open: {type: Boolean, default: undefined},
    defaultOpen: {type: Boolean, default: false},
    /** 面板里的可见标题 */
    title: {type: String, default: ''},
    /** @type {'top'|'right'|'bottom'|'left'} */
    side: {type: String, default: 'bottom'},
    /** @type {'start'|'center'|'end'} */
    align: {type: String, default: 'start'},
    sideOffset: {type: Number, default: 6},
    /** 小箭头指回触发器 */
    arrow: {type: Boolean, default: false},
    /** 右上角关闭按钮 */
    closable: {type: Boolean, default: false},
    /** 面板宽度类，默认按内容 */
    width: {type: String, default: ''},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])
const t = useUiText()
</script>

<template>
  <PopoverRoot
    :open="open"
    :default-open="defaultOpen"
    @update:open="emit('update:open', $event)"
  >
    <PopoverTrigger as-child :class="props.class">
      <slot name="trigger" />
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :class="cn(
          popoverPanelVariants({padding: 'content'}),
          'max-w-(--reka-popover-content-available-width)',
          width,
          props.contentClass,
        )"
      >
        <div v-if="title || closable" class="mb-2 flex items-start justify-between gap-3">
          <p v-if="title" class="text-body-strong text-fg">{{ title }}</p>
          <PopoverClose
            v-if="closable"
            :aria-label="t('close')"
            class="-mt-0.5 -mr-0.5 shrink-0 rounded-sm p-0.5 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <IconX class="size-3.5" aria-hidden="true" />
          </PopoverClose>
        </div>

        <slot />

        <PopoverArrow v-if="arrow" class="fill-raised stroke-line" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
