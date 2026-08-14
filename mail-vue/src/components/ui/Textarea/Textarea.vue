<script setup>
/**
 * Textarea — L1 原语（§4.11）
 *
 * `autosize` 用 scrollHeight 直接量：CSS 的 field-sizing: content 在 Firefox/Safari
 * 还没落地，而写信框、备注框这些地方「跟着内容长高」是刚需，不能只在 Chrome 生效。
 * 量之前先把 height 归零，否则内容删短时高度只会涨不会缩。
 */
import {nextTick, onMounted, ref, watch} from 'vue'
import {cn} from '@/utils/cn.js'
import {controlVariants} from '../_shared/control.variants.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    modelValue: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    placeholder: {type: String, default: ''},
    rows: {type: Number, default: 3},
    disabled: {type: Boolean, default: false},
    readonly: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    /** 跟随内容长高 */
    autosize: {type: Boolean, default: false},
    /** autosize 的上限行数，超过后内部滚动 */
    maxRows: {type: Number, default: 12},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
const el = ref(null)

function resize() {
    const node = el.value
    if (!node || !props.autosize) return
    const styles = getComputedStyle(node)
    const lineHeight = parseFloat(styles.lineHeight) || 20
    const vertical = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
        + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth)
    node.style.height = 'auto'
    const max = lineHeight * props.maxRows + vertical
    const next = Math.min(node.scrollHeight, max)
    node.style.height = `${next}px`
    node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden'
}

function onInput(event) {
    emit('update:modelValue', event.target.value)
    resize()
}

onMounted(resize)
watch(() => props.modelValue, () => nextTick(resize))

defineExpose({focus: () => el.value?.focus(), resize})
</script>

<template>
  <textarea
    ref="el"
    v-bind="$attrs"
    :value="modelValue"
    :rows="autosize ? 1 : rows"
    :placeholder="placeholder || undefined"
    :disabled="disabled"
    :readonly="readonly"
    :aria-invalid="invalid || undefined"
    :aria-label="ariaLabel || undefined"
    :class="cn(
      controlVariants({size, invalid, auto: true}),
      'resize-y py-1.5 leading-5',
      autosize && 'resize-none',
      props.class,
    )"
    @input="onInput"
  />
</template>
