<script setup>
/**
 * Code — L1 原语（§4.11）
 *
 * - `inline`：句子里的一小段代码，字号跟随 `text-mono`（0.78125rem，与 14px 正文视觉等高）
 * - `block`：整块代码，自己滚动、不换行；语法高亮不在 L1 范围内（L3 `CodeSnippet` 负责）
 * - block 用 `tabindex="0"`：可横向滚动的区域必须能被键盘聚焦滚动（§4.10）
 */
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'inline'|'block'} */
    variant: {type: String, default: 'inline'},
    /** block 下是否软换行 */
    wrap: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})
</script>

<template>
  <code
    v-if="variant === 'inline'"
    :class="cn(
      'rounded-xs border border-line bg-inset px-1 py-px font-mono text-mono text-fg',
      props.class,
    )"
  ><slot /></code>
  <pre
    v-else
    tabindex="0"
    :class="cn(
      'overflow-x-auto rounded-md border border-line bg-inset p-3 font-mono text-mono text-fg',
      wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
      props.class,
    )"
  ><code><slot /></code></pre>
</template>
