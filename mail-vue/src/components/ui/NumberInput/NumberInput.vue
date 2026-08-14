<script setup>
/**
 * NumberInput — L1 原语（Reka `NumberField`，§4.11）
 *
 * 用 NumberField 而不是 `<input type="number">`：后者的滚轮改值、上下箭头的
 * 无障碍名称、locale 千分位都得自己补，而 NumberField 已经处理好。
 * 加减按钮必须有 aria-label（走 useUiText），否则读屏只念「按钮 按钮」。
 */
import IconMinus from '~icons/lucide/minus'
import IconPlus from '~icons/lucide/plus'
import {NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {controlVariants} from '../_shared/control.variants.js'
import {useUiText} from '../_shared/useUiText.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    modelValue: {type: Number, default: undefined},
    min: {type: Number, default: undefined},
    max: {type: Number, default: undefined},
    step: {type: Number, default: 1},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    placeholder: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
const t = useUiText()

const STEP_BTN = [
    'flex h-full w-7 shrink-0 items-center justify-center text-fg-muted',
    'transition-colors hover:bg-hover hover:text-fg',
    'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent',
].join(' ')
</script>

<template>
  <NumberFieldRoot
    :model-value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :class="cn(
      controlVariants({size, invalid}),
      'flex w-full items-stretch overflow-hidden p-0',
      'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2',
      props.class,
    )"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <NumberFieldDecrement :aria-label="t('decrease')" :class="cn(STEP_BTN, 'border-r border-line')">
      <IconMinus class="size-3.5" aria-hidden="true" />
    </NumberFieldDecrement>
    <NumberFieldInput
      v-bind="$attrs"
      :placeholder="placeholder || undefined"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel || undefined"
      class="min-w-0 flex-1 bg-transparent px-2 text-center text-body text-fg tabular-nums outline-none placeholder:text-fg-muted disabled:text-fg-disabled"
    />
    <NumberFieldIncrement :aria-label="t('increase')" :class="cn(STEP_BTN, 'border-l border-line')">
      <IconPlus class="size-3.5" aria-hidden="true" />
    </NumberFieldIncrement>
  </NumberFieldRoot>
</template>
