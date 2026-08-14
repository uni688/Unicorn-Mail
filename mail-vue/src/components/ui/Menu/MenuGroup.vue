<script setup>
/**
 * MenuGroup — 一组菜单项（role="group"）
 *
 * 给了 `label` 就渲染组标题，并把标题 id 接到 group 的 aria-labelledby 上，
 * 不连的话读屏只念「分组」，「标记为」这类上下文就丢了。
 *
 * 这里显式接管 aria-labelledby 是**为了没标题的那种用法**：reka 的 MenuGroup
 * 无条件挂 `aria-labelledby="reka-menu-group-x"`（它把 id 塞进 context 等
 * MenuLabel 来取），组里没有标题时这个引用就悬空了 —— axe 的
 * aria-valid-attr-value 会判 serious。我们传下去的同名属性会盖掉它，
 * 所以没 label 时干脆不挂。
 */
import {useId} from 'vue'
import {cn} from '@/utils/cn.js'
import {MENU_LABEL} from '../_shared/overlay.variants.js'
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    label: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const family = useMenuFamily('MenuGroup')
const uid = useId()
</script>

<template>
  <component
    :is="family.Group"
    :aria-labelledby="label ? `${uid}-label` : undefined"
    :class="cn(props.class)"
  >
    <component :is="family.Label" v-if="label" :id="`${uid}-label`" :class="MENU_LABEL">
      {{ label }}
    </component>
    <slot />
  </component>
</template>
