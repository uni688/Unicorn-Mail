<script setup>
/**
 * DropdownMenu — L1 原语（Reka `DropdownMenu`，§4.11 / §6.1）
 *
 * 替换 el-dropdown。菜单项用 `Menu*` 那组组件写（和 ContextMenu 共用），
 * 家族原语通过 `provideMenuFamily` 往下传。
 *
 * 触发器必须是一个真按钮：`<slot name="trigger">` 走 as-child，
 * 所以里面放 `<Button>` / `<IconButton>` 即可，aria-haspopup、aria-expanded
 * 由 reka 挂上去。图标按钮记得自己给 aria-label（§4.10）。
 */
import {
    DropdownMenuArrow, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
    DropdownMenuItem, DropdownMenuItemIndicator, DropdownMenuLabel, DropdownMenuPortal,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuRoot, DropdownMenuSeparator,
    DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {popoverPanelVariants} from '../_shared/overlay.variants.js'
import {provideMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    open: {type: Boolean, default: undefined},
    defaultOpen: {type: Boolean, default: false},
    /** 打开时是否锁住外部交互（默认 true，与 EP 行为一致） */
    modal: {type: Boolean, default: true},
    /** @type {'top'|'right'|'bottom'|'left'} */
    side: {type: String, default: 'bottom'},
    /** @type {'start'|'center'|'end'} */
    align: {type: String, default: 'start'},
    sideOffset: {type: Number, default: 6},
    alignOffset: {type: Number, default: 0},
    /** 键盘上下键是否首尾循环 */
    loop: {type: Boolean, default: true},
    arrow: {type: Boolean, default: false},
    /** 面板宽度，如 `w-56`；不给则按内容宽 */
    width: {type: String, default: undefined},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])

provideMenuFamily({
    Item: DropdownMenuItem,
    Label: DropdownMenuLabel,
    Separator: DropdownMenuSeparator,
    Group: DropdownMenuGroup,
    CheckboxItem: DropdownMenuCheckboxItem,
    RadioGroup: DropdownMenuRadioGroup,
    RadioItem: DropdownMenuRadioItem,
    ItemIndicator: DropdownMenuItemIndicator,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
})
</script>

<template>
  <DropdownMenuRoot
    :open="open"
    :default-open="defaultOpen"
    :modal="modal"
    @update:open="emit('update:open', $event)"
  >
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :align-offset="alignOffset"
        :loop="loop"
        :class="cn(
          popoverPanelVariants(),
          'max-h-(--reka-dropdown-menu-content-available-height) min-w-40 overflow-y-auto',
          width,
          props.contentClass,
        )"
      >
        <slot />
        <DropdownMenuArrow v-if="arrow" class="fill-raised stroke-line" :width="10" :height="5" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
