<script setup>
/**
 * BrandMark — 站点字标（§3.3「20px 单色线性图标 + 文字，不再使用渐变胶囊」）
 *
 * 单色：`currentColor`，颜色由调用方给（顶栏给 `text-accent`，登录页给 `text-fg`）。
 * 这里**不放**渐变、阴影或多色 —— §3.3 明确否掉了旧 `aside/index.vue:85-121` 那枚
 * 渐变胶囊，§3.2 也把「大面积霓虹渐变」列为禁用项。
 *
 * 图形是「六边形轮廓 + 一道斜向的角」，对应 §5.1 线框里的 `⬡`：几何近似的独角兽角，
 * 而不是插画。最终品牌资产（真正描出来的独角兽线稿）属于设计交付物而不是代码，
 * 到时候只需替换这一个文件的 `<path>`，全站引用点不用动。
 */
defineProps({
    class: {type: [String, Array, Object], default: undefined},
})
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :class="$props.class"
  >
    <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
    <path d="M9 14.5 15.5 8" />
  </svg>
</template>
