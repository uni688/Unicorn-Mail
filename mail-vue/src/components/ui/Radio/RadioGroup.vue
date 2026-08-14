<script setup>
/**
 * RadioGroup — L1 原语（Reka `RadioGroupRoot`，§4.11）
 *
 * `options` 是给 90% 的场景准备的（老代码里的 el-radio-group + el-radio 全是静态选项），
 * 需要自定义排版时改用默认插槽塞 `<Radio>`。
 * 组本身用 role="radiogroup"（reka 提供），可见组标题请用 <Field> 包一层。
 */
import {RadioGroupRoot} from 'reka-ui'
import RadioItem from './Radio.vue'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    modelValue: {type: [String, Number, Boolean, Object], default: undefined},
    /**
     * 简写选项：[{label, value, hint?, disabled?}]
     * @type {Array<{label: string, value: any, hint?: string, disabled?: boolean}>}
     */
    options: {type: Array, default: () => []},
    /** @type {'vertical'|'horizontal'} */
    orientation: {type: String, default: 'vertical'},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    /** 原生表单提交用的 name */
    name: {type: String, default: undefined},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <RadioGroupRoot
    :model-value="modelValue"
    :orientation="orientation"
    :disabled="disabled"
    :name="name"
    :aria-label="ariaLabel || undefined"
    :class="cn(
      'flex',
      orientation === 'horizontal' ? 'flex-row flex-wrap gap-x-5 gap-y-2' : 'flex-col gap-2',
      props.class,
    )"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot>
      <RadioItem
        v-for="option in options"
        :key="String(option.value)"
        :value="option.value"
        :label="option.label"
        :hint="option.hint || ''"
        :size="size"
        :disabled="disabled || option.disabled === true"
      />
    </slot>
  </RadioGroupRoot>
</template>
