<script setup>
/**
 * MenuRadioItem — 单选菜单项（role="menuitemradio"）
 *
 * 指示器用实心圆点而不是勾：勾在「多选」里已经用掉了，同一个菜单里两种语义
 * 必须长得不一样，否则用户分不清「能同时选几个」。
 */
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'
import {MENU_SHORTCUT, menuItemVariants} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    value: {type: String, required: true},
    disabled: {type: Boolean, default: false},
    shortcut: {type: String, default: ''},
    textValue: {type: String, default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['select'])
const family = useMenuFamily('MenuRadioItem')
const classes = computed(() => cn(menuItemVariants(), props.class))
</script>

<template>
  <component
    :is="family.RadioItem"
    :value="value"
    :disabled="disabled"
    :text-value="textValue"
    :class="classes"
    @select="emit('select', $event)"
  >
    <span class="flex size-4 shrink-0 items-center justify-center">
      <component :is="family.ItemIndicator">
        <span class="size-2 rounded-full bg-accent" aria-hidden="true" />
      </component>
    </span>
    <slot />
    <span v-if="shortcut" :class="MENU_SHORTCUT">{{ shortcut }}</span>
  </component>
</template>
