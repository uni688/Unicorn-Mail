<script setup>
/**
 * `/_ds` 的分节容器：标题 + 一句「什么时候用它」+ 一叠演示行。
 *
 * 每节自带 `id` 供顶部导航跳转；`scroll-mt` 是给 sticky 顶栏留位，
 * 否则锚点跳过去标题会被顶栏盖住。
 */
defineProps({
    id: {type: String, required: true},
    title: {type: String, required: true},
    /** 组件名下面那行小字：用途、约束、踩过的坑 */
    note: {type: String, default: ''},
})
</script>

<template>
  <section :id="id" class="scroll-mt-20">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 class="font-mono text-title text-fg">{{ title }}</h3>
      <p v-if="note" class="text-caption text-fg-muted">{{ note }}</p>
    </div>
    <div class="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      <slot />
    </div>
  </section>
</template>
