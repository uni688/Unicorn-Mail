<script setup>
/**
 * Command — L1 原语（Reka `Listbox` + `useFilter`，§6.1，⌘K 命令面板的**列表本体**）
 *
 * 只负责「一个筛选框 + 一份可键盘导航的分组动作列表」。外面套什么由 L2 决定：
 * 命令面板套 `Dialog`，行内搜索直接放在页面里。
 *
 * 为什么不用 `Combobox`：Combobox 的语义是「给一个字段选值」，选完值要留在输入框里；
 * 命令面板是「执行一次动作」，选中态没有意义。所以这里的 `ListboxItem` 一律
 * `preventDefault()` 掉 reka 的选中写入，只往外发 `select` 事件。
 *
 * a11y：`ListboxFilter` 只给 input 挂了 `aria-activedescendant`，缺 combobox 的那几个
 * 属性（reka 把它留给使用者），这里补上 `role="combobox"` + `aria-controls` + `aria-expanded`，
 * 否则读屏进到输入框不知道下面还有一个列表。「无结果」文案放在列表**外面**并标
 * `role="status"`：放进 `role="listbox"` 里既违反 aria-required-children，也不会被播报。
 *
 * 过滤用 reka 的 `useFilter`（`Intl.Collator` 的 `usage: 'search'`），比 `toLowerCase()
 * .includes()` 多了大小写/音标不敏感。中文只能做子串匹配（拼音首字母不在范围内），
 * 需要拼音时由调用方关掉 `filter` 自己过滤。
 */
import {computed, ref, useId} from 'vue'
import {
    ListboxContent, ListboxFilter, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxRoot,
    useFilter,
} from 'reka-ui'
import IconSearch from '~icons/lucide/search'
import {cn} from '@/utils/cn.js'
import {menuItemVariants, MENU_LABEL} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'
import Kbd from '../Kbd/Kbd.vue'

const props = defineProps({
    /**
     * 扁平项 `{value, label, hint?, keywords?, shortcut?, icon?, disabled?, tone?}`
     * 或分组 `{label, options: [...]}`；两种可混写，相邻的扁平项会并成一组。
     * @type {Array<Object>}
     */
    items: {type: Array, default: () => []},
    /** 搜索词，可 v-model:search-term（受控时自己过滤才有意义） */
    searchTerm: {type: String, default: undefined},
    placeholder: {type: String, default: ''},
    /** 无匹配时的文案 */
    emptyText: {type: String, default: ''},
    /** 内置过滤；服务端搜索时关掉，自己传已过滤的 `items` */
    filter: {type: Boolean, default: true},
    /** 挂载后自动聚焦搜索框 */
    autoFocus: {type: Boolean, default: true},
    /** 列表区最大高度类 */
    maxHeight: {type: String, default: 'max-h-80'},
    /** 搜索框的无障碍名称 */
    ariaLabel: {type: String, default: ''},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:searchTerm', 'select'])

const t = useUiText()
const listId = useId()
const {contains} = useFilter({sensitivity: 'base'})

/** 非受控时自己存搜索词：命令面板 90% 的用法不关心外面拿不拿这个值 */
const uncontrolledTerm = ref('')
const term = computed(() => (props.searchTerm === undefined ? uncontrolledTerm.value : props.searchTerm))

function onTerm(value) {
    if (props.searchTerm === undefined) {
        uncontrolledTerm.value = value
    }
    emit('update:searchTerm', value)
}

/** 归一成分组结构；相邻的扁平项并进同一个匿名组，免得每项都套一个 role="group" */
const groups = computed(() => {
    const out = []
    for (const entry of props.items) {
        if (Array.isArray(entry?.options)) {
            out.push({label: entry.label ?? '', items: [...entry.options]})
            continue
        }
        const last = out[out.length - 1]
        if (last && last.label === '') {
            last.items.push(entry)
        } else {
            out.push({label: '', items: [entry]})
        }
    }
    return out
})

/** 参与匹配的不只是 label：`keywords` 让「设置」也能被 'settings' / 'shezhi' 命中 */
const haystack = (item) => [
    item?.label,
    item?.hint,
    Array.isArray(item?.keywords) ? item.keywords.join(' ') : item?.keywords,
].filter(Boolean).join(' ')

const visibleGroups = computed(() => {
    if (!props.filter || !term.value) {
        return groups.value
    }
    return groups.value
        .map((group) => ({...group, items: group.items.filter((item) => contains(haystack(item), term.value))}))
        .filter((group) => group.items.length > 0)
})

const isEmpty = computed(() => visibleGroups.value.every((group) => group.items.length === 0))

function onSelect(event, item) {
    // reka 的选中写入一律拦掉：动作列表没有「选中态」
    event.preventDefault()
    if (item?.disabled === true) {
        return
    }
    emit('select', item?.value, item)
}
</script>

<template>
  <ListboxRoot
    as="div"
    highlight-on-hover
    :class="cn('flex min-h-0 flex-col overflow-hidden text-fg', props.class)"
  >
    <div class="flex shrink-0 items-center gap-2 border-b border-line px-3">
      <IconSearch class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      <ListboxFilter
        :model-value="term"
        :auto-focus="autoFocus"
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        :aria-controls="listId"
        :aria-label="ariaLabel || t('search')"
        :placeholder="placeholder || t('search')"
        class="h-11 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        @update:model-value="onTerm"
      />
      <slot name="filter-suffix" />
    </div>

    <ListboxContent
      :id="listId"
      as="div"
      :class="cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-1', maxHeight, props.contentClass)"
    >
      <slot :search-term="term" :groups="visibleGroups">
        <ListboxGroup v-for="(group, index) in visibleGroups" :key="group.label || `g${index}`" as="div">
          <ListboxGroupLabel v-if="group.label" :class="MENU_LABEL">{{ group.label }}</ListboxGroupLabel>
          <ListboxItem
            v-for="item in group.items"
            :key="String(item.value)"
            :value="item"
            :disabled="item.disabled === true"
            :class="menuItemVariants({tone: item.tone === 'danger' ? 'danger' : 'default'})"
            @select="onSelect($event, item)"
          >
            <slot name="item" v-bind="{item, searchTerm: term}">
              <component
                :is="item.icon"
                v-if="item.icon"
                class="size-4 shrink-0 text-fg-subtle"
                aria-hidden="true"
              />
              <span class="truncate">{{ item.label }}</span>
              <span v-if="item.hint || item.shortcut" class="ml-auto flex shrink-0 items-center gap-2 pl-2">
                <span v-if="item.hint" class="text-caption text-fg-muted">{{ item.hint }}</span>
                <Kbd v-if="item.shortcut" :keys="item.shortcut" />
              </span>
            </slot>
          </ListboxItem>
        </ListboxGroup>
      </slot>
    </ListboxContent>

    <p
      v-if="isEmpty && !$slots.default"
      role="status"
      class="shrink-0 px-3 py-6 text-center text-caption text-fg-muted"
    >
      {{ emptyText || t('noResults') }}
    </p>

    <div v-if="$slots.footer" class="shrink-0 border-t border-line px-3 py-2 text-caption text-fg-muted">
      <slot name="footer" />
    </div>
  </ListboxRoot>
</template>
