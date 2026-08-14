<script setup>
/**
 * Segmented — L1 原语（Reka `ToggleGroup`，§4.11 与 Tabs 同一行）
 *
 * 与 Tabs 的分工（很容易混，写清楚）：
 * - `Tabs` 切换的是**页面区域**（有 `role="tablist"` + 对应面板，切换即换内容块）；
 * - `Segmented` 是一个**表单控件**（`role="group"` 里一串 toggle button），它改的是
 *   参数：列表密度、时间粒度、排序方向。它可以出现在工具条里、`Field` 里。
 * 判据：如果它旁边应该有个 label（「密度」「范围」），那就是 Segmented。
 *
 * 单选（默认）与多选（`multiple`）共用同一套外观。单选时默认 `allowDeselect: false`：
 * 参数类控件不应出现「一个都没选」的空态，否则每个调用方都得为 undefined 再写一套分支。
 * reka 的 ToggleGroup 没有 `preventDeselect`（那是 Accordion/Calendar 的 prop），
 * 所以这层由我们在 `update:modelValue` 上拦——点已选中项时直接丢弃这次变更。
 *
 * 图标模式（`iconOnly`）下每项必须给 `label`，它会变成 `aria-label`（§4.10）。
 */
import {computed} from 'vue'
import {ToggleGroupItem, ToggleGroupRoot} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 单选时是标量，`multiple` 时是数组；可 v-model */
    modelValue: {type: [String, Number, Boolean, Array], default: undefined},
    defaultValue: {type: [String, Number, Boolean, Array], default: undefined},
    /** `{value, label, icon?, disabled?}[]`；`icon` 走 `#item` 插槽渲染 */
    items: {type: Array, default: () => []},
    multiple: {type: Boolean, default: false},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    /** 只显示图标（每项的 label 转为 aria-label） */
    iconOnly: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** @type {'horizontal'|'vertical'} */
    orientation: {type: String, default: 'horizontal'},
    /** 方向键在首尾之间循环 */
    loop: {type: Boolean, default: true},
    /** 单选时允许「点掉」当前项（默认不允许，参数类控件不应有空态） */
    allowDeselect: {type: Boolean, default: false},
    /** 控件组的无障碍名称；放在 `Field` 里时由 Field 的 label 提供，可不传 */
    ariaLabel: {type: String, default: ''},
    /** 撑满父容器（工具条里常用），每项等分 */
    block: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])

const SIZE = {
    sm: 'h-6 min-w-6 px-2 text-label',
    md: 'h-7 min-w-7 px-2.5 text-body',
}

const ICON_SIZE = {sm: 'size-3.5', md: 'size-4'}

/**
 * 单选时用 `type="single"`，多选 `type="multiple"` —— reka 靠这个属性决定
 * modelValue 是标量还是数组，传错会静默变成另一种语义。
 */
const type = computed(() => (props.multiple ? 'multiple' : 'single'))

/** 单选且不允许空态时，点已选中项发出的 undefined 直接丢弃 */
function onUpdate(value) {
    if (!props.multiple && !props.allowDeselect && (value === undefined || value === null || value === '')) {
        return
    }
    emit('update:modelValue', value)
}

const itemClass = computed(() => cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm whitespace-nowrap',
    'text-fg-muted transition-colors',
    'hover:text-fg',
    'data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-xs',
    'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:text-fg-disabled',
    SIZE[props.size] ?? SIZE.md,
    props.block && 'flex-1',
))

if (import.meta.env.DEV) {
    if (props.iconOnly && props.items.some((item) => !item?.label)) {
        console.warn('[ui/Segmented] iconOnly 模式下每项都必须有 label（用作 aria-label）')
    }
}
</script>

<template>
  <ToggleGroupRoot
    :type="type"
    :model-value="modelValue"
    :default-value="defaultValue"
    :disabled="disabled"
    :orientation="orientation"
    :loop="loop"
    :aria-label="ariaLabel || undefined"
    :class="cn(
      'inline-flex gap-0.5 rounded-md bg-inset p-0.5',
      orientation === 'vertical' && 'flex-col',
      block && 'flex w-full',
      props.class,
    )"
    @update:model-value="onUpdate"
  >
    <slot>
      <ToggleGroupItem
        v-for="item in items"
        :key="String(item.value)"
        :value="item.value"
        :disabled="item.disabled === true"
        :aria-label="iconOnly ? item.label : undefined"
        :class="itemClass"
      >
        <slot name="item" v-bind="{...item, iconSize: ICON_SIZE[size] ?? ICON_SIZE.md}" />
        <span v-if="!iconOnly" class="truncate">{{ item.label }}</span>
      </ToggleGroupItem>
    </slot>
  </ToggleGroupRoot>
</template>
