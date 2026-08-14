<script setup>
/**
 * Radio — L1 原语（Reka `RadioGroup` 的单项，§4.11）
 *
 * 必须放在 `<RadioGroup>` 里用：单选组的键盘行为（左右/上下切换 + 组内只有一个 tab stop）
 * 由 RadioGroupRoot 提供，脱离组之后 radio 语义是不完整的。
 * 指示器用一个实心圆点而不是 ::after，方便 forced-colors 模式下也能看见。
 */
import {computed, useId} from 'vue'
import {Label, RadioGroupIndicator, RadioGroupItem} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 该项的取值，与 RadioGroup 的 modelValue 比较 */
    value: {type: [String, Number, Boolean, Object], required: true},
    label: {type: String, default: ''},
    hint: {type: String, default: ''},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    id: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const uid = useId()
const controlId = computed(() => props.id || `${uid}-radio`)
const hintId = computed(() => `${uid}-hint`)

const BOX = {sm: 'size-3.5', md: 'size-4'}
const DOT = {sm: 'size-1.5', md: 'size-2'}
</script>

<template>
  <div :class="cn('flex items-start gap-2', props.class)">
    <RadioGroupItem
      :id="controlId"
      :value="value"
      :disabled="disabled"
      :aria-describedby="hint ? hintId : undefined"
      :class="cn(
        'flex shrink-0 items-center justify-center rounded-full border transition-colors',
        'mt-0.5 border-line-strong bg-surface',
        BOX[size],
        'hover:border-accent-line',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-inset',
        'data-[state=checked]:disabled:border-line data-[state=checked]:disabled:bg-inset',
      )"
    >
      <RadioGroupIndicator
        :class="cn('rounded-full bg-surface', DOT[size], disabled && 'bg-fg-disabled')"
      />
    </RadioGroupItem>

    <div v-if="label || hint || $slots.default" class="flex min-w-0 flex-col gap-0.5">
      <Label
        :for="controlId"
        :class="cn(
          'cursor-pointer text-body text-fg select-none',
          disabled && 'cursor-not-allowed text-fg-disabled',
        )"
      >
        <slot>{{ label }}</slot>
      </Label>
      <p v-if="hint" :id="hintId" class="text-caption text-fg-muted">{{ hint }}</p>
    </div>
  </div>
</template>
