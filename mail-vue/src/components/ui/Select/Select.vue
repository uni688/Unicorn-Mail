<script setup>
/**
 * Select — L1 原语（Reka `Select`，§4.11）
 *
 * 替换 el-select ×26 + el-option ×53。选项一律走 `options` prop：
 * 老代码里的 el-option 全是静态列表，用数据驱动比塞 53 个子组件好维护，
 * 也顺手支持了分组（`{label, options: []}`）。要完全自定义排版时用默认插槽。
 *
 * 面板宽度跟随触发器（--reka-select-trigger-width），避免长选项把面板撑得比控件宽一截；
 * 超过 --reka-select-content-available-height 时内部滚动并显示上下滚动按钮。
 */
import {computed} from 'vue'
import {
    SelectContent, SelectGroup, SelectIcon, SelectItem, SelectItemIndicator, SelectItemText,
    SelectLabel, SelectPortal, SelectRoot, SelectScrollDownButton, SelectScrollUpButton,
    SelectTrigger, SelectValue, SelectViewport,
} from 'reka-ui'
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronUp from '~icons/lucide/chevron-up'
import {cn} from '@/utils/cn.js'
import {CONTROL_ICON_SIZE, controlVariants} from '../_shared/control.variants.js'
import {menuItemVariants, MENU_LABEL, popoverPanelVariants} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    modelValue: {type: [String, Number, Boolean, Object, Array], default: undefined},
    /**
     * 扁平项 `{label, value, disabled?}`，或分组 `{label, options: [...]}`
     * @type {Array<Object>}
     */
    options: {type: Array, default: () => []},
    placeholder: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    multiple: {type: Boolean, default: false},
    /** 比较对象值时按这个字段判等 */
    by: {type: [String, Function], default: undefined},
    id: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    /** 面板额外类名（例如限宽） */
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
const t = useUiText()

/** 分组和扁平混写也能吃：有 options 字段的当分组 */
const groups = computed(() => props.options.map((entry) => (
    Array.isArray(entry?.options)
        ? {label: entry.label ?? '', items: entry.options}
        : {label: '', items: [entry]}
)))

const flatItems = computed(() => groups.value.flatMap((g) => g.items))

/** multiple 时 SelectValue 只会给出原始数组，这里自己拼成「A、B」 */
const multipleLabel = computed(() => {
    if (!props.multiple || !Array.isArray(props.modelValue)) return ''
    const labels = props.modelValue
        .map((value) => flatItems.value.find((item) => item?.value === value)?.label ?? value)
        .filter((label) => label !== undefined && label !== null && label !== '')
    return labels.join('、')
})
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :disabled="disabled"
    :multiple="multiple"
    :by="by"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SelectTrigger
      :id="id || undefined"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel || undefined"
      :class="cn(
        controlVariants({size, invalid}),
        'flex items-center justify-between gap-2 text-left',
        'data-placeholder:text-fg-muted',
        props.class,
      )"
    >
      <span class="min-w-0 flex-1 truncate">
        <template v-if="multiple">
          <span v-if="multipleLabel">{{ multipleLabel }}</span>
          <span v-else class="text-fg-muted">{{ placeholder || t('select') }}</span>
        </template>
        <SelectValue v-else :placeholder="placeholder || t('select')" />
      </span>
      <SelectIcon as-child>
        <IconChevronDown
          :class="cn('shrink-0 text-fg-subtle transition-transform', CONTROL_ICON_SIZE[size])"
          aria-hidden="true"
        />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        :class="cn(
          popoverPanelVariants({padding: 'menu'}),
          'max-h-(--reka-select-content-available-height) min-w-(--reka-select-trigger-width) overflow-hidden',
          props.contentClass,
        )"
      >
        <SelectScrollUpButton class="flex h-5 items-center justify-center text-fg-subtle">
          <IconChevronUp class="size-3.5" aria-hidden="true" />
        </SelectScrollUpButton>

        <SelectViewport class="max-h-72 overflow-y-auto">
          <slot>
            <SelectGroup v-for="(group, index) in groups" :key="group.label || index">
              <SelectLabel v-if="group.label" :class="MENU_LABEL">{{ group.label }}</SelectLabel>
              <SelectItem
                v-for="item in group.items"
                :key="String(item.value)"
                :value="item.value"
                :disabled="item.disabled === true"
                :class="cn(menuItemVariants({inset: true}))"
              >
                <SelectItemIndicator class="absolute left-2 flex items-center">
                  <IconCheck class="size-3.5 text-accent-fg" aria-hidden="true" />
                </SelectItemIndicator>
                <SelectItemText class="truncate">{{ item.label }}</SelectItemText>
                <span v-if="item.hint" class="ml-auto text-caption text-fg-muted">{{ item.hint }}</span>
              </SelectItem>
            </SelectGroup>
          </slot>
        </SelectViewport>

        <SelectScrollDownButton class="flex h-5 items-center justify-center text-fg-subtle">
          <IconChevronDown class="size-3.5" aria-hidden="true" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
