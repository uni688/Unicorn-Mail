<script setup>
/**
 * PasswordInput — 带「显示 / 隐藏」的密码框（§5.3.1 线框里的 👁）
 *
 * `Input` 的 `#suffix` 槽按设计是装饰位（`pointer-events-none` + `aria-hidden`），
 * 塞不进可点的东西，所以这里把按钮作为兄弟节点绝对定位到右侧，并用
 * `[&_input]:pr-9` 给它让出内边距 —— 不改动原语，也不复制原语的外观。
 *
 * 三个 a11y 细节：按钮是 `type="button"`（否则在 `<form>` 里会触发提交）、
 * `aria-pressed` 表达当前是否明文、`aria-label` 随状态换文案（只靠图标读屏念不出来）。
 * 切换时**不动焦点**：用户可能正在打字，抢焦点会打断输入法。
 */
import {ref} from 'vue'
import IconEye from '~icons/lucide/eye'
import IconEyeOff from '~icons/lucide/eye-off'
import {Input} from '@/components/ui'
import {cn} from '@/utils/cn.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    modelValue: {type: String, default: ''},
    placeholder: {type: String, default: ''},
    invalid: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** @type {'sm'|'md'|'lg'} 认证页用 lg（38px），与 EmailInput 对齐 */
    size: {type: String, default: 'lg'},
    /** 明文态按钮的无障碍名称 */
    hideLabel: {type: String, default: '隐藏密码'},
    /** 密文态按钮的无障碍名称 */
    showLabel: {type: String, default: '显示密码'},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'enter'])

const revealed = ref(false)
const inputRef = ref(null)

defineExpose({focus: () => inputRef.value?.focus()})
</script>

<template>
  <div :class="cn('relative flex w-full items-center', props.class)">
    <Input
      ref="inputRef"
      v-bind="$attrs"
      :model-value="modelValue"
      :type="revealed ? 'text' : 'password'"
      :size="size"
      :placeholder="placeholder"
      :invalid="invalid"
      :disabled="disabled"
      class="[&_input]:pr-9"
      @update:model-value="emit('update:modelValue', $event)"
      @enter="emit('enter', $event)"
    />
    <button
      type="button"
      :aria-label="revealed ? hideLabel : showLabel"
      :aria-pressed="revealed"
      :disabled="disabled"
      class="absolute right-1 flex size-7 items-center justify-center rounded-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled"
      @click="revealed = !revealed"
    >
      <IconEyeOff v-if="revealed" class="size-4" aria-hidden="true" />
      <IconEye v-else class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
