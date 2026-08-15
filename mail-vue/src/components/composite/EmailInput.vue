<script setup>
/**
 * EmailInput — 「邮箱前缀 + @域名 ▾」的联体控件（§5.3.1）
 *
 * 旧实现是个明显的 hack：把一个 `el-select` 透明化（`opacity: 0; pointer-events: none`）
 * 绝对定位盖在 `el-input` 的 append 槽上，再在外层 div 的 click 里手动调
 * `mySelect.toggleMenu()`（`login/index.vue:22-39` + `.select` 样式）。键盘用户永远打不开它，
 * 读屏也读不到「这里可以选域名」。
 *
 * 这里换成**两个真控件拼在一起**：左边 `Input`（前缀），右边 `Select`（域名），
 * 视觉上是一条 38px 高的输入行，语义上各自完整 —— Tab 能进、Enter/↑↓ 能选、有 aria-label。
 *
 * §5.3.1 原话是「用 `Combobox` 原生实现输入框内嵌后缀选择」。没有照做，两个原因：
 * `Combobox` 的下拉选的是**输入框自己的值**，而后缀是第二个独立的值，语义对不上；
 * `Input` 的 `#suffix` 槽是 `pointer-events-none` + `aria-hidden` 的装饰位（见 `Input.vue:97-103`），
 * 按设计不能塞可交互内容。联体控件的边界可见，反而比隐藏边界更容易发现能点。
 *
 * `settings.loginDomain === 1`（站长隐藏域名）时右边整块不渲染，输入框自己占满一行。
 */
import {ref} from 'vue'
import {Input, Select} from '@/components/ui'
import {cn} from '@/utils/cn.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    /** 邮箱前缀（站长隐藏域名时是完整邮箱） */
    modelValue: {type: String, default: ''},
    /** 当前选中的域名后缀，形如 `@example.com` */
    suffix: {type: String, default: ''},
    /** `[{label, value}]`，由 `useEmailSuffix()` 提供 */
    domainOptions: {type: Array, default: () => []},
    /** 站长隐藏了域名：不渲染后缀选择器 */
    hideDomain: {type: Boolean, default: false},
    placeholder: {type: String, default: ''},
    /** 后缀选择器的无障碍名称（视觉上只有一个 ▾） */
    domainLabel: {type: String, default: ''},
    invalid: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'update:suffix', 'enter'])

const inputRef = ref(null)

/** 供「自动聚焦第一个空字段」用（§5.3.1 键盘那条） */
defineExpose({focus: () => inputRef.value?.focus()})
</script>

<template>
  <div :class="cn('flex w-full items-stretch', props.class)">
    <!-- $attrs 透给真正的 <input>：id / aria-describedby / autocomplete 必须落在那里 -->
    <Input
      ref="inputRef"
      v-bind="$attrs"
      :model-value="modelValue"
      type="text"
      size="lg"
      :placeholder="placeholder"
      :invalid="invalid"
      :disabled="disabled"
      :class="hideDomain ? undefined : '[&_input]:rounded-r-none'"
      @update:model-value="emit('update:modelValue', $event)"
      @enter="emit('enter', $event)"
    />
    <Select
      v-if="!hideDomain"
      :model-value="suffix"
      :options="domainOptions"
      size="lg"
      :aria-label="domainLabel"
      :invalid="invalid"
      :disabled="disabled"
      class="-ml-px w-auto max-w-[45%] shrink-0 rounded-l-none"
      @update:model-value="emit('update:suffix', $event)"
    />
  </div>
</template>
