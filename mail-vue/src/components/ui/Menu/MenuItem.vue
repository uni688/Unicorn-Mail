<script setup>
/**
 * MenuItem — DropdownMenu / ContextMenu 共用的菜单项（§6.1）
 *
 * 家族原语由 Root 注入（见 `_shared/menu.family.js`），样式只在这里写一遍。
 *
 * 破坏性操作用 `tone="danger"`，并且文案要动词化（「删除」而不是「确定」）。
 * `shortcut` 只是视觉提示，真正的按键绑定在别处注册 —— 菜单项不负责监听键盘。
 */
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'
import {MENU_SHORTCUT, menuItemVariants} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    /** @type {'default'|'danger'} */
    tone: {type: String, default: 'default'},
    /** 左侧留出勾选/图标槽位，用于和同组的 CheckboxItem 对齐 */
    inset: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** 右侧的快捷键提示，如 `⌘⏎` */
    shortcut: {type: String, default: ''},
    /** 打字跳转用的文本；默认插槽不是纯文本时必须给 */
    textValue: {type: String, default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['select'])
const family = useMenuFamily('MenuItem')
const classes = computed(() => cn(menuItemVariants({tone: props.tone, inset: props.inset}), props.class))
</script>

<template>
  <component
    :is="family.Item"
    :disabled="disabled"
    :text-value="textValue"
    :class="classes"
    @select="emit('select', $event)"
  >
    <slot name="icon" />
    <slot />
    <span v-if="shortcut" :class="MENU_SHORTCUT">{{ shortcut }}</span>
  </component>
</template>
