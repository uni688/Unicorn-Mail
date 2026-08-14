<script setup>
/**
 * TagsInput — L1 原语（Reka `TagsInput`，§4.11）
 *
 * 替换 `el-input-tag` ×10（收件人、白名单、允许域名这些）。
 * 关键 a11y：每个标签的删除按钮都要有自己的名字（「移除 xxx」），
 * 否则读屏在一排标签里只会念出一串「按钮」。
 * 外框复用 controlVariants，但高度放开（标签会换行），聚焦环用 focus-within。
 */
import {computed} from 'vue'
import {TagsInputClear, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText, TagsInputRoot} from 'reka-ui'
import IconX from '~icons/lucide/x'
import {cn} from '@/utils/cn.js'
import {controlVariants} from '../_shared/control.variants.js'
import {useUiText} from '../_shared/useUiText.js'

defineOptions({inheritAttrs: false})

const props = defineProps({
    /** @type {string[]} */
    modelValue: {type: Array, default: () => []},
    placeholder: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    /** 最多几个标签 */
    max: {type: Number, default: undefined},
    /** 允许重复值 */
    duplicate: {type: Boolean, default: false},
    /** 输入这些字符即成标签，粘贴时也按它拆分 */
    delimiter: {type: [String, RegExp], default: ','},
    addOnPaste: {type: Boolean, default: true},
    addOnBlur: {type: Boolean, default: true},
    /** 显示「清空全部」 */
    clearable: {type: Boolean, default: false},
    id: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'invalid'])
const t = useUiText()

const reachedMax = computed(() => props.max !== undefined && props.modelValue.length >= props.max)

const TAG_SIZE = {
    sm: 'h-5 text-caption',
    md: 'h-5.5 text-caption',
    lg: 'h-6 text-label',
}
</script>

<template>
  <TagsInputRoot
    :model-value="modelValue"
    :disabled="disabled"
    :max="max"
    :duplicate="duplicate"
    :delimiter="delimiter"
    :add-on-paste="addOnPaste"
    :add-on-blur="addOnBlur"
    :class="cn(
      controlVariants({size, invalid, auto: true}),
      'flex flex-wrap items-center gap-1.5 py-1.5',
      'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2',
      props.class,
    )"
    @update:model-value="emit('update:modelValue', $event)"
    @invalid="emit('invalid', $event)"
  >
    <TagsInputItem
      v-for="tag in modelValue"
      :key="tag"
      :value="tag"
      :class="cn(
        'flex max-w-full items-center gap-1 rounded-xs bg-inset px-1.5 text-fg',
        'data-[state=active]:bg-selected data-[state=active]:text-accent-fg',
        TAG_SIZE[size],
      )"
    >
      <TagsInputItemText class="truncate" />
      <TagsInputItemDelete
        :aria-label="`${t('remove')} ${tag}`"
        class="shrink-0 rounded-xs text-fg-subtle transition-colors hover:text-fg"
      >
        <IconX class="size-3" aria-hidden="true" />
      </TagsInputItemDelete>
    </TagsInputItem>

    <TagsInputInput
      v-bind="$attrs"
      :id="id || undefined"
      :placeholder="reachedMax ? '' : (placeholder || undefined)"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel || undefined"
      :disabled="disabled || reachedMax"
      class="min-w-24 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
    />

    <TagsInputClear
      v-if="clearable && modelValue.length"
      :aria-label="t('clear')"
      class="shrink-0 rounded-xs text-fg-subtle transition-colors hover:text-fg"
    >
      <IconX class="size-3.5" aria-hidden="true" />
    </TagsInputClear>
  </TagsInputRoot>
</template>
