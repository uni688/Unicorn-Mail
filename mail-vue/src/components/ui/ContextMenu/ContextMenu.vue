<script setup>
/**
 * ContextMenu — L1 原语（Reka `ContextMenu`，§4.11 / §6.1）
 *
 * 邮件列表项右键菜单。菜单项与 DropdownMenu 完全共用 `Menu*` 那组组件，
 * 家族原语通过 `provideMenuFamily` 注入（见 `_shared/menu.family.js`）。
 *
 * 硬规则（§4.10）：右键菜单里的每一项都必须在别处有等价入口 —— 触屏没有右键，
 * 键盘只有部分设备有 ContextMenu 键。它是加速器，不是唯一通道。
 *
 * 位置由光标决定，所以没有 side / align / sideOffset：reka 的 ContextMenuContent
 * 直接把这几个 prop 从类型里 Omit 掉了。
 */
import {
    ContextMenuCheckboxItem, ContextMenuContent, ContextMenuGroup, ContextMenuItem,
    ContextMenuItemIndicator, ContextMenuLabel, ContextMenuPortal, ContextMenuRadioGroup,
    ContextMenuRadioItem, ContextMenuRoot, ContextMenuSeparator, ContextMenuSub,
    ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {popoverPanelVariants} from '../_shared/overlay.variants.js'
import {provideMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    /** 打开时是否锁住外部交互 */
    modal: {type: Boolean, default: true},
    /** 关掉整块区域的右键菜单（比逐项 disabled 便宜） */
    disabled: {type: Boolean, default: false},
    /** 键盘上下键是否首尾循环 */
    loop: {type: Boolean, default: true},
    /** 面板宽度，如 `w-56`；不给则按内容宽 */
    width: {type: String, default: undefined},
    contentClass: {type: [String, Array, Object], default: undefined},
    /** 触发区域自身的类名（它是一个真实存在的包裹元素） */
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])

provideMenuFamily({
    Item: ContextMenuItem,
    Label: ContextMenuLabel,
    Separator: ContextMenuSeparator,
    Group: ContextMenuGroup,
    CheckboxItem: ContextMenuCheckboxItem,
    RadioGroup: ContextMenuRadioGroup,
    RadioItem: ContextMenuRadioItem,
    ItemIndicator: ContextMenuItemIndicator,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
})
</script>

<template>
  <ContextMenuRoot :modal="modal" @update:open="emit('update:open', $event)">
    <!-- as-child 交给调用方：列表项自己就是一个元素时用 #trigger 里的根元素承载，
         没有 as-child 时 reka 会包一个 <span>，在 flex/grid 列表里会打乱布局 -->
    <ContextMenuTrigger :disabled="disabled" as-child :class="props.class">
      <slot name="trigger" />
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        :loop="loop"
        :class="cn(
          popoverPanelVariants(),
          'max-h-(--reka-context-menu-content-available-height) min-w-40 overflow-y-auto',
          width,
          props.contentClass,
        )"
      >
        <slot />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
