<script setup>
/**
 * MenuSub — 二级菜单（「移动到…」「标记为…」）
 *
 * 触发项右侧永远有 chevron，这是「还有下一层」的唯一线索，不做可配置。
 * 二级面板复用一级的外观（同圆角、同阴影），只把 side 换成 right —— 屏幕右侧
 * 不够时 reka 自己翻到左边。
 *
 * 层级别超过两层：三层菜单在触屏和键盘上都是灾难，需要更深就改用 Dialog/Sheet。
 */
import IconChevronRight from '~icons/lucide/chevron-right'
import {cn} from '@/utils/cn.js'
import {menuItemVariants, popoverPanelVariants} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    /** 触发项文案（也可用 #trigger 插槽） */
    label: {type: String, default: ''},
    disabled: {type: Boolean, default: false},
    /** 二级面板宽度，如 `w-48` */
    width: {type: String, default: undefined},
    sideOffset: {type: Number, default: 4},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const family = useMenuFamily('MenuSub')
</script>

<template>
  <component :is="family.Sub">
    <component :is="family.SubTrigger" :disabled="disabled" :class="cn(menuItemVariants(), 'data-[state=open]:bg-hover')">
      <slot name="icon" />
      <slot name="trigger">{{ label }}</slot>
      <IconChevronRight class="ml-auto size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
    </component>

    <component
      :is="family.SubContent"
      :side-offset="sideOffset"
      :class="cn(popoverPanelVariants(), 'min-w-40', width, props.contentClass)"
    >
      <slot />
    </component>
  </component>
</template>
