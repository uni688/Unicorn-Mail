<script setup>
/**
 * Badge — L1 原语（§4.11）
 *
 * - 6 色调 × solid/subtle/outline × sm/md
 * - `dot`：文字前面一个 6px 圆点，用于「状态 + 文案」这类标签（solid 下点是白的）
 * - 纯展示元素，默认渲染 `<span>`；需要它可点时由调用方套 Button 或传 `as="button"`
 *
 * 模板里 asChild 单独走一支：reka 的 Slot 只把样式合并到「第一个非注释子节点」上，
 * 而 `v-if="dot"` 关掉时留下的注释节点会让子节点变成多根，宿主节点就拿不到 badge 样式。
 * 那一支因此只透传默认插槽，圆点和 icon 由调用方自己排（渲染权已经交给它了）。
 */
import {computed} from 'vue'
import {Primitive} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {badgeVariants} from './badge.variants.js'

const props = defineProps({
    /** @type {'neutral'|'accent'|'success'|'warning'|'danger'|'info'} */
    tone: {type: String, default: 'neutral'},
    /** @type {'solid'|'subtle'|'outline'} */
    appearance: {type: String, default: 'subtle'},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    /** 文字前的状态圆点 */
    dot: {type: Boolean, default: false},
    as: {type: String, default: 'span'},
    asChild: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

// solid 底上圆点用白色（currentColor 就是白字），其余用该色调的 500 档
const DOT_TONE = {
    neutral: 'bg-fg-subtle',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
}

const rootClass = computed(() =>
    cn(badgeVariants({tone: props.tone, appearance: props.appearance, size: props.size}), props.class),
)
</script>

<template>
  <Primitive
    v-if="asChild"
    as-child
    :data-tone="tone"
    :data-appearance="appearance"
    :class="rootClass"
  >
    <slot />
  </Primitive>
  <Primitive
    v-else
    :as="as"
    :data-tone="tone"
    :data-appearance="appearance"
    :class="rootClass"
  >
    <span
      v-if="dot"
      class="size-1.5 shrink-0 rounded-full"
      :class="appearance === 'solid' ? 'bg-current' : DOT_TONE[tone]"
      aria-hidden="true"
    />
    <slot name="icon" />
    <slot />
  </Primitive>
</template>
