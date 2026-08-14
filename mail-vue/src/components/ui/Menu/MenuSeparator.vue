<script setup>
/**
 * MenuSeparator — 菜单分隔线（reka 会挂 role="separator"）
 *
 * 负外边距是故意的：面板有 4px 内边距，分隔线要顶满两侧才不像断开的短横。
 */
import {cn} from '@/utils/cn.js'
import {MENU_SEPARATOR} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const family = useMenuFamily('MenuSeparator')
</script>

<template>
  <component :is="family.Separator" :class="cn(MENU_SEPARATOR, props.class)" />
</template>
