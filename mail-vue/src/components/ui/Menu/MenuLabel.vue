<script setup>
/**
 * MenuLabel — 菜单里的分组标题（不可聚焦、不可点）
 *
 * 只做视觉分组时用它；如果这组项要被读屏当成一组念出来，
 * 用 `<MenuGroup label="…">`（那个会把标题连到 group 的 aria-labelledby 上）。
 */
import {cn} from '@/utils/cn.js'
import {MENU_LABEL} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const family = useMenuFamily('MenuLabel')
</script>

<template>
  <component :is="family.Label" :class="cn(MENU_LABEL, props.class)">
    <slot />
  </component>
</template>
