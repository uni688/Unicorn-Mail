<script setup>
/**
 * Switch — L1 原语（Reka `Switch`，§4.11）
 *
 * 与 Checkbox 的分工：Switch 表示「立即生效的开关」（切换即落库），
 * Checkbox 表示「等提交的选择」。所以 Switch 不做 invalid 态——它没有校验语义。
 * 轨道 checked 用 bg-accent（白色滑块压在上面 ≥4.5:1 由 accent-solid 的测试覆盖）。
 */
import {computed, useId} from 'vue'
import {Label, SwitchRoot, SwitchThumb} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    modelValue: {type: Boolean, default: false},
    label: {type: String, default: ''},
    hint: {type: String, default: ''},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    /** 切换中（例如正在写库）：吞掉交互但保留焦点 */
    loading: {type: Boolean, default: false},
    id: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])

const uid = useId()
const controlId = computed(() => props.id || `${uid}-switch`)
const hintId = computed(() => `${uid}-hint`)

const TRACK = {
    sm: 'h-4 w-7',
    md: 'h-5 w-9',
}

const THUMB = {
    sm: 'size-3 data-[state=checked]:translate-x-3',
    md: 'size-4 data-[state=checked]:translate-x-4',
}

function onUpdate(value) {
    if (props.loading) return
    emit('update:modelValue', value)
}
</script>

<template>
  <div :class="cn('flex items-start gap-2.5', props.class)">
    <SwitchRoot
      :id="controlId"
      :model-value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      :aria-describedby="hint ? hintId : undefined"
      :aria-busy="loading || undefined"
      :data-loading="loading ? '' : undefined"
      :class="cn(
        'relative inline-flex shrink-0 items-center rounded-full border border-transparent',
        'bg-line-strong transition-colors data-[state=checked]:bg-accent',
        'mt-0.5 data-loading:cursor-progress',
        'disabled:cursor-not-allowed disabled:bg-inset disabled:data-[state=checked]:bg-fg-disabled',
        TRACK[size],
      )"
      @update:model-value="onUpdate"
    >
      <SwitchThumb
        :class="cn(
          'pointer-events-none block translate-x-0.5 rounded-full bg-surface shadow-sm',
          'transition-transform duration-150 ease-standard',
          THUMB[size],
        )"
      />
    </SwitchRoot>

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
