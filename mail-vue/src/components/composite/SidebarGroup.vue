<script setup>
/**
 * SidebarGroup — 侧栏分组（§6.2「结构：`nav > ul > li`，分组用 `Collapsible`」）
 *
 * 折叠态（56px 图标）下**不渲染组头**：一行只有 36px 宽，组头文字放不下，
 * 而组与组之间的间距已经足够表达分界。此时组名进 `<ul aria-label>`，读屏不丢信息。
 *
 * `open` 是可控的，因为 §7.1 的 `Alt+←/→` 要能从外面收起/展开当前分组。
 */
import {Collapsible} from '@/components/ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    title: {type: String, required: true},
    /** 受控展开态；可 v-model:open @type {boolean|undefined} */
    open: {type: Boolean, default: undefined},
    defaultOpen: {type: Boolean, default: true},
    /** 56px 图标态：只剩条目本身 */
    collapsed: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])
</script>

<template>
  <ul v-if="collapsed" :aria-label="title" :class="cn('grid justify-items-center gap-0.5', props.class)">
    <slot />
  </ul>

  <Collapsible
    v-else
    :open="open"
    :default-open="defaultOpen"
    :title="title"
    trigger-class="text-micro text-fg-muted uppercase"
    :class="props.class"
    @update:open="emit('update:open', $event)"
  >
    <ul class="grid gap-0.5">
      <slot />
    </ul>
  </Collapsible>
</template>
