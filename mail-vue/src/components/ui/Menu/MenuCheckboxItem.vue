<script setup>
/**
 * MenuCheckboxItem — 可勾选的菜单项（role="menuitemcheckbox"）
 *
 * 用在「显示已读/未读」这类开关式过滤。勾选后菜单默认会关 —— 连续勾多项时
 * 在 `@select` 里 `event.preventDefault()` 把菜单留住（reka 支持）。
 * 勾选框槽位固定 16px 并且一直占位，避免勾上/取消时文字左右跳。
 */
import {computed} from 'vue'
import IconCheck from '~icons/lucide/check'
import {cn} from '@/utils/cn.js'
import {MENU_SHORTCUT, menuItemVariants} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    /** 支持 `'indeterminate'`（部分选中） */
    modelValue: {type: [Boolean, String], default: false},
    disabled: {type: Boolean, default: false},
    shortcut: {type: String, default: ''},
    textValue: {type: String, default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'select'])
const family = useMenuFamily('MenuCheckboxItem')
const classes = computed(() => cn(menuItemVariants(), props.class))
</script>

<template>
  <component
    :is="family.CheckboxItem"
    :model-value="modelValue"
    :disabled="disabled"
    :text-value="textValue"
    :class="classes"
    @update:model-value="emit('update:modelValue', $event)"
    @select="emit('select', $event)"
  >
    <span class="flex size-4 shrink-0 items-center justify-center">
      <component :is="family.ItemIndicator">
        <IconCheck class="size-4 text-accent" aria-hidden="true" />
      </component>
    </span>
    <slot />
    <span v-if="shortcut" :class="MENU_SHORTCUT">{{ shortcut }}</span>
  </component>
</template>
