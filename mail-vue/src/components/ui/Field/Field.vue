<script setup>
/**
 * Field — 表单控件的标签/说明/错误三件套（§4.10）
 *
 * 存在的理由：a11y 里最容易漏的就是「标签、说明、错误」和控件之间的 id 串联。
 * 交给调用方手写必然漏，所以这里统一生成 id，并通过作用域插槽把它们交回去：
 *
 *   <Field label="邮箱" hint="用于登录" :error="err">
 *     <template #default="{id, describedBy, invalid}">
 *       <Input :id="id" :aria-describedby="describedBy" :invalid="invalid" v-model="x" />
 *     </template>
 *   </Field>
 *
 * - `error` 出现时才把 error 的 id 串进 aria-describedby，并置 aria-invalid
 * - 错误区常驻在 DOM 里并挂 aria-live="polite"：容器先存在，后填内容才会被播报
 * - 必填用 `required`，星号对读屏隐身，改由一段 sr-only 文本说明
 */
import {computed, useId} from 'vue'
import {Label} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    label: {type: String, default: ''},
    /** 辅助说明，常驻显示 */
    hint: {type: String, default: ''},
    /** 有值即为错误态 */
    error: {type: String, default: ''},
    required: {type: Boolean, default: false},
    /** 显示「选填」标记（与 required 互斥） */
    optional: {type: Boolean, default: false},
    /** 覆盖自动生成的控件 id */
    id: {type: String, default: ''},
    /** 标签视觉隐藏（仍存在于读屏中），用于列表里的紧凑筛选器 */
    hideLabel: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const uid = useId()
const controlId = computed(() => props.id || `${uid}-control`)
const hintId = computed(() => `${uid}-hint`)
const errorId = computed(() => `${uid}-error`)

const invalid = computed(() => Boolean(props.error))

/**
 * 只串「此刻真的存在于 DOM 里」的 id：hint 在报错时会被 error 顶掉（见下面的
 * `v-if="hint && !error"`），若仍把 hintId 串进来就是一条悬空引用 ——
 * axe 的 `aria-valid-attr-value` 会判错，读屏也会念不出东西。
 */
const describedBy = computed(() => {
    const ids = []
    if (props.hint && !props.error) ids.push(hintId.value)
    if (props.error) ids.push(errorId.value)
    return ids.length ? ids.join(' ') : undefined
})

const t = useUiText()
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5', props.class)">
    <Label
      v-if="label"
      :for="controlId"
      :class="cn('flex items-center gap-1 text-label text-fg', hideLabel && 'sr-only')"
    >
      <span>{{ label }}</span>
      <template v-if="required">
        <span class="text-danger-fg" aria-hidden="true">*</span>
        <span class="sr-only">（{{ t('required') }}）</span>
      </template>
      <span v-else-if="optional" class="text-caption font-normal text-fg-muted">{{ t('optional') }}</span>
    </Label>

    <slot :id="controlId" :described-by="describedBy" :invalid="invalid" />

    <p v-if="hint && !error" :id="hintId" class="text-caption text-fg-muted">
      {{ hint }}
    </p>
    <div aria-live="polite">
      <p v-if="error" :id="errorId" class="text-caption text-danger-fg">
        {{ error }}
      </p>
    </div>
  </div>
</template>
