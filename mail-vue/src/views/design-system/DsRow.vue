<script setup>
/**
 * 一行演示：左边写「这行在演示哪个参数」，右边放实物。
 *
 * 变体必须**横向并列**才看得出差别（尺寸阶梯、色调阶梯），所以右侧默认
 * `flex-wrap`；表单类需要限宽竖排的场合用 `stack` 换成纵向窄列。
 */
defineProps({
    /** 演示的 prop 或组合，如 `variant × size` */
    label: {type: String, default: ''},
    /** 补充说明：约束、无障碍要求、已知取舍 */
    note: {type: String, default: ''},
    /** 竖排窄列（表单控件用，避免被拉成一整行） */
    stack: {type: Boolean, default: false},
})
</script>

<template>
  <div class="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:gap-6">
    <div class="sm:w-40 sm:shrink-0 lg:w-48">
      <code class="font-mono text-mono text-fg-muted">{{ label }}</code>
      <p v-if="note" class="mt-1 text-caption text-fg-muted">{{ note }}</p>
    </div>
    <div
      class="min-w-0 flex-1"
      :class="stack ? 'flex max-w-(--um-form-max-w) flex-col gap-3' : 'flex flex-wrap items-center gap-3'"
    >
      <slot />
    </div>
  </div>
</template>
