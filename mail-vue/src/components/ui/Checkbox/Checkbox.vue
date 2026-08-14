<script setup>
/**
 * Checkbox — L1 原语（Reka `Checkbox`，§4.11）
 *
 * - 支持 `indeterminate`（列表全选/半选），reka 用 modelValue='indeterminate' 表达
 * - 有可见文字时必须走 `label` / 默认插槽（内部用 <Label for> 关联，点文字也能勾选）；
 *   没有可见文字时必须传 `ariaLabel`，否则读屏只念「复选框」
 * - 勾选框本体 16px，但外面的点击热区靠 label 一起撑到 ≥24px（§4.10 触达尺寸）
 */
import {computed, useId} from 'vue'
import {CheckboxIndicator, CheckboxRoot, Label} from 'reka-ui'
import IconCheck from '~icons/lucide/check'
import IconMinus from '~icons/lucide/minus'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** true | false | 'indeterminate' */
    modelValue: {type: [Boolean, String], default: false},
    label: {type: String, default: ''},
    /** 标签下方的补充说明 */
    hint: {type: String, default: ''},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    id: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])

const uid = useId()
const controlId = computed(() => props.id || `${uid}-checkbox`)
const hintId = computed(() => `${uid}-hint`)

const BOX = {sm: 'size-3.5', md: 'size-4'}
const ICON = {sm: 'size-2.5', md: 'size-3'}
</script>

<template>
  <div :class="cn('flex items-start gap-2', props.class)">
    <CheckboxRoot
      :id="controlId"
      :model-value="modelValue"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel || undefined"
      :aria-describedby="hint ? hintId : undefined"
      :class="cn(
        'flex shrink-0 items-center justify-center rounded-xs border transition-colors',
        'mt-0.5',
        BOX[size],
        'border-line-strong bg-surface text-on-accent',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'hover:border-accent-line',
        invalid && 'border-danger',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-inset disabled:text-fg-disabled',
        'data-[state=checked]:disabled:border-line data-[state=checked]:disabled:bg-inset',
      )"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <CheckboxIndicator class="flex items-center justify-center">
        <IconMinus v-if="modelValue === 'indeterminate'" :class="ICON[size]" aria-hidden="true" />
        <IconCheck v-else :class="ICON[size]" aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxRoot>

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
