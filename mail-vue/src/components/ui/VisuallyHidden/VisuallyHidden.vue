<script setup>
/**
 * VisuallyHidden — L1 原语（§4.11）
 *
 * 不用 reka 的同名组件：它两种 feature 都会打上 `aria-hidden="true"`，而且没有任何
 * 聚焦恢复的样式——那个实现是给「隐藏标题给 aria-labelledby 引用」这类场景准备的
 * （Dialog/Sheet 里仍然直接用 reka 的版本），拿来做 Skip link 会是 axe 的
 * aria-hidden-focus 违规。
 *
 * - `focusable`（默认）：内容留在无障碍树里，键盘聚焦（自身或内部任意节点）时恢复可见
 * - `fully-hidden`：连读屏也别念，同时 `tabindex="-1"` 移出 Tab 序列
 *
 * 纯静态的读屏补充文案（例如 CopyButton 里的播报区）继续用 Tailwind 的 `sr-only` 即可。
 */
import {computed} from 'vue'
import {Primitive} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'focusable'|'fully-hidden'} */
    feature: {type: String, default: 'focusable'},
    as: {type: String, default: 'span'},
    asChild: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const isFullyHidden = computed(() => props.feature === 'fully-hidden')

const rootClass = computed(() =>
    cn('um-visually-hidden', !isFullyHidden.value && 'um-visually-hidden-focusable', props.class),
)
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :aria-hidden="isFullyHidden ? 'true' : undefined"
    :data-hidden="isFullyHidden ? '' : undefined"
    :tabindex="isFullyHidden ? '-1' : undefined"
    :class="rootClass"
  >
    <slot />
  </Primitive>
</template>
