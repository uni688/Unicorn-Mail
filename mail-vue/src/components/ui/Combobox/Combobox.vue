<script setup>
/**
 * Combobox — L1 原语（Reka `Combobox`，§4.11）
 *
 * 与 Select 的分工：选项超过 ~10 条、或需要边打边筛时用 Combobox；固定短列表用 Select。
 * 过滤交给 reka 自带的默认过滤器（对 `label` 生效），需要自定义匹配时传 `ignoreFilter`
 * 并自己过滤 `options`。
 *
 * a11y 要点：输入框是 role="combobox"，列表是 role="listbox"，两者的关联由 reka 维护；
 * 无匹配时必须渲染 ComboboxEmpty，否则读屏在筛空后完全没有反馈。
 */
import {computed} from 'vue'
import {
    ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem,
    ComboboxItemIndicator, ComboboxLabel, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport,
} from 'reka-ui'
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import {cn} from '@/utils/cn.js'
import {CONTROL_ICON_SIZE, controlVariants} from '../_shared/control.variants.js'
import {menuItemVariants, MENU_LABEL, popoverPanelVariants} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    modelValue: {type: [String, Number, Boolean, Object, Array], default: undefined},
    /** 扁平项 `{label, value, disabled?}` 或分组 `{label, options: [...]}` */
    options: {type: Array, default: () => []},
    placeholder: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    multiple: {type: Boolean, default: false},
    /** 关掉内置过滤（自己在外面过滤 options 时用） */
    ignoreFilter: {type: Boolean, default: false},
    /** 无匹配时的文案 */
    emptyText: {type: String, default: ''},
    by: {type: [String, Function], default: undefined},
    id: {type: String, default: ''},
    ariaLabel: {type: String, default: ''},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'update:searchTerm'])
const t = useUiText()

const groups = computed(() => props.options.map((entry) => (
    Array.isArray(entry?.options)
        ? {label: entry.label ?? '', items: entry.options}
        : {label: '', items: [entry]}
)))

const flatItems = computed(() => groups.value.flatMap((g) => g.items))

/** 输入框在收起状态要显示已选项的 label，而不是原始 value */
function displayValue(value) {
    if (Array.isArray(value)) {
        return value.map((v) => labelOf(v)).join('、')
    }
    return value === undefined || value === null ? '' : labelOf(value)
}

function labelOf(value) {
    const hit = flatItems.value.find((item) => item?.value === value)
    return hit?.label ?? String(value)
}
</script>

<template>
  <ComboboxRoot
    :model-value="modelValue"
    :disabled="disabled"
    :multiple="multiple"
    :by="by"
    :ignore-filter="ignoreFilter"
    open-on-click
    :class="cn('relative', props.class)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ComboboxAnchor as-child>
      <div
        :class="cn(
          controlVariants({size, invalid}),
          'flex items-center gap-1 pr-1',
          'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2',
        )"
      >
        <ComboboxInput
          :id="id || undefined"
          :placeholder="placeholder || t('search')"
          :display-value="displayValue"
          :aria-invalid="invalid || undefined"
          :aria-label="ariaLabel || undefined"
          class="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
          @update:model-value="emit('update:searchTerm', $event)"
        />
        <ComboboxTrigger
          :aria-label="t('expand')"
          class="shrink-0 rounded-xs text-fg-subtle transition-colors hover:text-fg disabled:text-fg-disabled"
        >
          <IconChevronDown :class="CONTROL_ICON_SIZE[size]" aria-hidden="true" />
        </ComboboxTrigger>
      </div>
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        :class="cn(
          popoverPanelVariants({padding: 'menu'}),
          'max-h-(--reka-combobox-content-available-height) w-(--reka-combobox-trigger-width) overflow-hidden',
          props.contentClass,
        )"
      >
        <ComboboxViewport class="max-h-72 overflow-y-auto">
          <ComboboxEmpty class="px-2 py-3 text-center text-caption text-fg-muted">
            {{ emptyText || t('noResults') }}
          </ComboboxEmpty>

          <slot>
            <ComboboxGroup v-for="(group, index) in groups" :key="group.label || index">
              <ComboboxLabel v-if="group.label" :class="MENU_LABEL">{{ group.label }}</ComboboxLabel>
              <ComboboxItem
                v-for="item in group.items"
                :key="String(item.value)"
                :value="item.value"
                :disabled="item.disabled === true"
                :class="cn(menuItemVariants({inset: true}))"
              >
                <ComboboxItemIndicator class="absolute left-2 flex items-center">
                  <IconCheck class="size-3.5 text-accent-fg" aria-hidden="true" />
                </ComboboxItemIndicator>
                <span class="truncate">{{ item.label }}</span>
                <span v-if="item.hint" class="ml-auto text-caption text-fg-muted">{{ item.hint }}</span>
              </ComboboxItem>
            </ComboboxGroup>
          </slot>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
