<script setup>
/**
 * Input — L1 原语（§4.11 / §6.3）
 *
 * - 外观来自 _shared/control.variants.js，与 Textarea / Select 触发器同源
 * - `inheritAttrs: false`：id / aria-describedby / autocomplete 这些必须落在真正的
 *   <input> 上，不能挂到外层包装 div（否则 Field 串起来的 id 关系全断）
 * - `clearable` 的清除按钮是 type="button" 且带 aria-label，不能用一个裸 <i> 了事
 * - 前缀/后缀图标对读屏隐身：它们是装饰，语义由 label 承担
 */
import {computed, ref, useSlots} from 'vue'
import IconX from '~icons/lucide/x'
import {cn} from '@/utils/cn.js'
import {CONTROL_ICON_SIZE, CONTROL_PAD, controlVariants} from '../_shared/control.variants.js'
import {useUiText} from '../_shared/useUiText.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    modelValue: {type: [String, Number], default: ''},
    /** @type {'text'|'email'|'password'|'search'|'url'|'tel'} */
    type: {type: String, default: 'text'},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    placeholder: {type: String, default: ''},
    disabled: {type: Boolean, default: false},
    readonly: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    clearable: {type: Boolean, default: false},
    /** 无可见 label 时的兜底无障碍名称 */
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'clear', 'enter'])
const slots = useSlots()
const t = useUiText()
const el = ref(null)

const showClear = computed(
    () => props.clearable && !props.disabled && !props.readonly && String(props.modelValue ?? '') !== '',
)
const hasSuffix = computed(() => Boolean(slots.suffix) || showClear.value)

function onInput(event) {
    emit('update:modelValue', event.target.value)
}

function onClear() {
    emit('update:modelValue', '')
    emit('clear')
    el.value?.focus()
}

defineExpose({focus: () => el.value?.focus(), select: () => el.value?.select()})
</script>

<template>
  <div :class="cn('relative flex w-full items-center', props.class)">
    <span
      v-if="slots.prefix"
      :class="cn('pointer-events-none absolute left-2 flex text-fg-subtle', CONTROL_ICON_SIZE[size])"
      aria-hidden="true"
    >
      <slot name="prefix" />
    </span>

    <input
      ref="el"
      v-bind="$attrs"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder || undefined"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel || undefined"
      :class="cn(
        controlVariants({size, invalid}),
        slots.prefix && CONTROL_PAD[size].prefix,
        hasSuffix && CONTROL_PAD[size].suffix,
      )"
      @input="onInput"
      @keydown.enter="emit('enter', $event)"
    >

    <span v-if="hasSuffix" class="absolute right-1 flex items-center gap-0.5">
      <button
        v-if="showClear"
        type="button"
        :aria-label="t('clear')"
        class="flex size-5 items-center justify-center rounded-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        @click="onClear"
      >
        <IconX class="size-3.5" aria-hidden="true" />
      </button>
      <span
        v-if="slots.suffix"
        :class="cn('pointer-events-none flex text-fg-subtle', CONTROL_ICON_SIZE[size])"
        aria-hidden="true"
      >
        <slot name="suffix" />
      </span>
    </span>
  </div>
</template>
