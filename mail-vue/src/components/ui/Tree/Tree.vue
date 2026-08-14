<script setup>
/**
 * Tree — L1 原语（Reka `Tree`，§6.1，替换 `el-tree` ×1：角色的权限树）
 *
 * 公开 API 一律走 **key**（`itemKey` 取出的那个字段），而不是 reka 的「item 对象」：
 * 后端收发的是 id 数组（`role.permIds`），业务代码存的也是 id。让调用方先把 id 映射回
 * 对象、再靠对象身份去比较，只会在 `setCheckedKeys` / `getCheckedKeys` 之外多出一层
 * 没人愿意维护的胶水。内部再把 key 折回对象喂给 reka。
 *
 * 选中逻辑（含级联与半选）我们自己算，reka 的 `select` 一律 `preventDefault()`：
 * 1. 它的 `propagateSelect` / `bubbleSelect` 内部用的 `flatten()` 把子节点字段硬编码
 *    成 `children`，`childrenKey` 一改就静默失效；
 * 2. 半选（`isIndeterminate`）只在开了那两个开关时才有值，而权限表单**必须**能单独
 *    拿到半选的父节点 id（旧代码 `permIds = [...getCheckedKeys(), ...getHalfCheckedKeys()]`）；
 * 3. 级联要跳过 disabled 节点，reka 不跳。
 * 留给 reka 的是真正难写的那部分：roving focus、打字跳转、←/→ 折叠、
 * `aria-level/setsize/posinset` 与 `role="tree"`。
 *
 * 交互取舍：
 * - 有勾选框时（`checkbox`）点整行 = 勾选，**不**展开，展开只认小箭头与 →/←；没有勾选框
 *   时（导航型树）点整行 = 选中 + 展开，符合文件树直觉。reka 的行点击会同时派发 select
 *   与 toggle，所以「不展开」是在 toggle 事件里认出 `originalEvent.type === 'click'`
 *   再 `preventDefault()` 实现的。
 * - 行本身是 `role="treeitem"`、也是唯一的 Tab 停留点，勾选框只是画出来的 `<span>`：
 *   放真 `<input>` 会多一个焦点停留点，且与行上的 `aria-selected` 重复表达同一件事。
 * - `#item` 插槽里塞输入框（权限树的「每日发信上限」）是支持的：树在行上监听 →/← 与
 *   打字跳转，会抢走输入框的方向键，所以插槽内容外面包了一层「表单控件自己吃掉
 *   keydown」的挡板。
 */
import {computed, ref, watch} from 'vue'
import {TreeItem, TreeRoot} from 'reka-ui'
import IconCheck from '~icons/lucide/check'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconMinus from '~icons/lucide/minus'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 嵌套的原始树数据 */
    items: {type: Array, default: () => []},
    /** 取 key 的字段名或函数 */
    itemKey: {type: [String, Function], default: 'id'},
    /** 取子节点的字段名或函数；空数组等同叶子（不画箭头、不可展开） */
    childrenKey: {type: [String, Function], default: 'children'},
    /** 取显示文案的字段名或函数（`#item` 自己渲染时无所谓） */
    labelKey: {type: [String, Function], default: 'label'},
    /** 选中的 key：单选是标量，`multiple` 时是数组；可 v-model */
    modelValue: {type: [Array, String, Number], default: undefined},
    defaultValue: {type: [Array, String, Number], default: undefined},
    multiple: {type: Boolean, default: false},
    /** 父子联动：勾父 = 勾全部子，子全勾 = 父勾，部分勾 = 父半选（需要 `multiple`） */
    cascade: {type: Boolean, default: false},
    /** 行首画勾选框（权限树）；此时点行 = 勾选而非展开 */
    checkbox: {type: Boolean, default: false},
    /** 展开的 key 数组，可 v-model:expanded */
    expanded: {type: Array, default: undefined},
    defaultExpanded: {type: Array, default: () => []},
    /** 数据到位后自动展开所有分支（异步加载也生效） */
    defaultExpandAll: {type: Boolean, default: false},
    /** 点整行是否展开/收起；默认 `!checkbox` */
    expandOnClick: {type: Boolean, default: undefined},
    /** 整棵树禁用 */
    disabled: {type: Boolean, default: false},
    /** 每级缩进（px） */
    indent: {type: Number, default: 16},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    /** `role="tree"` 的可访问名称 */
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'update:expanded', 'update:indeterminateKeys', 'select'])

const read = (accessor, item) => (typeof accessor === 'function' ? accessor(item) : item?.[accessor])

/** reka 会拿 `getKey({})` 探空值，所以这里必须能吃下任意对象且不抛错 */
const readKey = (item) => read(props.itemKey, item)
const readLabel = (item) => read(props.labelKey, item)

/**
 * 空数组要当成 undefined 返回：reka 的 `hasChildren` 是 `!!getChildren(item)`，
 * `[]` 为真会让叶子长出一个点了没反应的箭头（后端常把叶子写成 `children: []`）。
 */
const readChildren = (item) => {
    const children = read(props.childrenKey, item)
    return Array.isArray(children) && children.length > 0 ? children : undefined
}

/**
 * 把嵌套数据摊平成 `key → {item, parentKey, childKeys, descendantKeys, disabled}`。
 * `order` 是前序遍历的 key 序列，用来给对外发出的 key 数组一个稳定顺序（也是级联
 * 自下而上重算时的反向遍历依据）。
 */
const index = computed(() => {
    const byKey = new Map()
    const order = []

    const walk = (list, parentKey) => {
        for (const item of list ?? []) {
            const key = readKey(item)
            const children = readChildren(item)
            const node = {
                key,
                item,
                parentKey,
                childKeys: children ? children.map(readKey) : [],
                descendantKeys: [],
                disabled: props.disabled || item?.disabled === true,
            }
            byKey.set(key, node)
            order.push(key)
            if (children) {
                walk(children, key)
                node.descendantKeys = node.childKeys.flatMap((k) => [k, ...(byKey.get(k)?.descendantKeys ?? [])])
            }
        }
    }

    walk(props.items, undefined)
    return {byKey, order}
})

/* ---------------------------------------------------------------- 选中（key 语义） */

/** 内部统一按数组处理，单选只是「长度 ≤ 1 的数组」 */
function toKeys(value) {
    if (value === undefined || value === null) {
        return []
    }
    return Array.isArray(value) ? [...value] : [value]
}

const uncontrolled = ref(toKeys(props.defaultValue))

const selectedKeys = computed(() => (
    props.modelValue === undefined ? uncontrolled.value : toKeys(props.modelValue)
))

const selectedSet = computed(() => new Set(selectedKeys.value))

/** 喂给 reka 的是对象（它的 `selectedKeys` 由 `getKey(modelValue)` 反推） */
const selectedItems = computed(() => {
    const items = selectedKeys.value
        .map((key) => index.value.byKey.get(key)?.item)
        .filter((item) => item !== undefined)
    return props.multiple ? items : items[0]
})

/**
 * 提交一次选中变更。始终发 `update:modelValue`（即使集合没变）——受控用法下 reka 内部
 * 那个 passive ref 已经被它自己写过了，只有 prop 换成新数组才能把它拉回来。
 */
function commit(keys) {
    const ordered = index.value.order.filter((key) => keys.has(key))
    if (props.modelValue === undefined) {
        uncontrolled.value = ordered
    }
    emit('update:modelValue', props.multiple ? ordered : ordered[0])
}

/**
 * 把任意一组 key 收敛成级联树的自洽状态：父项选中 ⟺ 它的**每一个**直接子项都选中。
 * `order` 是前序，反过来遍历就保证子项先算完。
 * 有 disabled 且未勾的子项时父项永远算不上「全勾」，会停在半选——与 el-tree 一致。
 */
function normalizeCascade(keys) {
    const {byKey, order} = index.value
    for (let i = order.length - 1; i >= 0; i--) {
        const node = byKey.get(order[i])
        if (node.childKeys.length === 0) {
            continue
        }
        if (node.childKeys.every((key) => keys.has(key))) {
            keys.add(node.key)
        } else {
            keys.delete(node.key)
        }
    }
    return keys
}

function toggle(key) {
    const node = index.value.byKey.get(key)
    if (!node || node.disabled) {
        return
    }
    if (!props.multiple) {
        // 单选不给「点掉」：树的空选中态没有语义，调用方还得为 undefined 再写一套分支
        commit(new Set([key]))
        return
    }
    const keys = new Set(selectedKeys.value)
    const selecting = !keys.has(key)
    if (props.cascade) {
        for (const affected of [key, ...node.descendantKeys]) {
            if (index.value.byKey.get(affected)?.disabled) {
                continue
            }
            if (selecting) {
                keys.add(affected)
            } else {
                keys.delete(affected)
            }
        }
        normalizeCascade(keys)
    } else if (selecting) {
        keys.add(key)
    } else {
        keys.delete(key)
    }
    commit(keys)
}

/** 半选：自己没选中，但子孙里有选中的（`cascade` 才有意义） */
const indeterminateKeys = computed(() => {
    if (!props.multiple || !props.cascade) {
        return []
    }
    const {byKey, order} = index.value
    return order.filter((key) => {
        const node = byKey.get(key)
        if (node.childKeys.length === 0 || selectedSet.value.has(key)) {
            return false
        }
        return node.descendantKeys.some((child) => selectedSet.value.has(child))
    })
})

const indeterminateSet = computed(() => new Set(indeterminateKeys.value))

watch(indeterminateKeys, (keys) => emit('update:indeterminateKeys', keys), {immediate: true})

/* -------------------------------------------------------------------------- 展开 */

const uncontrolledExpanded = ref([...props.defaultExpanded])

const expandedKeys = computed(() => (
    props.expanded === undefined ? uncontrolledExpanded.value : props.expanded
))

function setExpanded(keys) {
    if (props.expanded === undefined) {
        uncontrolledExpanded.value = keys
    }
    emit('update:expanded', keys)
}

const branchKeys = computed(() => (
    index.value.order.filter((key) => index.value.byKey.get(key).childKeys.length > 0)
))

/**
 * `defaultExpandAll` 必须在**数据到位后**才有事可做：权限树是 `rolePermTree()` 异步来的，
 * 首帧 `items` 还是空数组。只展开「这一批新出现的分支」，用户手动收起过的不会被重新打开。
 */
const autoExpanded = new Set()
watch(branchKeys, (keys) => {
    if (!props.defaultExpandAll) {
        return
    }
    const fresh = keys.filter((key) => !autoExpanded.has(key))
    if (fresh.length === 0) {
        return
    }
    fresh.forEach((key) => autoExpanded.add(key))
    setExpanded([...new Set([...expandedKeys.value, ...fresh])])
}, {immediate: true})

/* -------------------------------------------------------------------------- 事件 */

/** 默认：勾选框树点行 = 勾选（不展开），导航树点行 = 选中 + 展开 */
const expandOnClick = computed(() => props.expandOnClick ?? !props.checkbox)

function onSelect(event) {
    // 选中一律自己算（key 语义 + 级联 + 跳过 disabled），reka 的默认行为拦掉
    event.preventDefault()
    const item = event.detail?.value
    const key = readKey(item)
    const node = index.value.byKey.get(key)
    if (!node || node.disabled) {
        return
    }
    toggle(key)
    emit('select', key, item)
}

function onToggle(event) {
    // 键盘 →/← 永远可以折叠；点整行是否折叠由 expandOnClick 决定
    if (!expandOnClick.value && event.detail?.originalEvent?.type === 'click') {
        event.preventDefault()
    }
}

/**
 * shift + ↑/↓ 的区间多选是 reka 直接写 modelValue 的（绕过 select），这里把对象折回 key。
 * 级联树上顺手把集合收敛一遍，避免出现「父项勾了但子项没勾」这种自相矛盾的状态。
 */
function onRootUpdate(value) {
    if (!props.multiple || !Array.isArray(value)) {
        return
    }
    const keys = new Set(value.map(readKey))
    commit(props.cascade ? normalizeCascade(keys) : keys)
}

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** `#item` 里的输入框要自己吃掉方向键与打字，否则会被树的 →/← 与打字跳转抢走 */
function onContentKeydown(event) {
    const target = event.target
    if (FORM_TAGS.has(target?.tagName) || target?.isContentEditable) {
        event.stopPropagation()
    }
}

/* -------------------------------------------------------------------------- 外观 */

const SIZE = {sm: 'min-h-7 text-label', md: 'min-h-8 text-body'}

/** 行是焦点所在，所以**不能**写 outline-none —— 焦点环由 base.css 的 :focus-visible 画 */
const rowClass = computed(() => cn(
    'group flex cursor-default items-center gap-1.5 rounded-sm pe-1.5',
    'text-fg select-none transition-colors',
    'hover:bg-hover',
    // 勾选框树的选中态由勾选框表达：勾了二十项还整行高亮，列表就成了一片色块
    !props.checkbox && 'data-selected:bg-selected',
    'data-disabled:cursor-not-allowed data-disabled:text-fg-disabled data-disabled:hover:bg-transparent',
    SIZE[props.size] ?? SIZE.md,
))

/** 箭头是行内的一块热区而不是 `<button>`：行本身才是 Tab 停留点（roving focus） */
const TWISTY = 'flex size-5 shrink-0 items-center justify-center rounded-xs text-fg-subtle hover:bg-active hover:text-fg'

function boxClass(selected, indeterminate) {
    return cn(
        'flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors',
        'border-line-strong bg-surface text-on-accent',
        (selected || indeterminate) && 'border-accent bg-accent',
        'group-data-[disabled]:border-line group-data-[disabled]:bg-inset group-data-[disabled]:text-fg-disabled',
    )
}

if (import.meta.env.DEV) {
    if (props.cascade && !props.multiple) {
        console.warn('[ui/Tree] cascade 需要 multiple：单选树没有「父子联动」这回事')
    }
    if (props.checkbox && !props.multiple) {
        console.warn('[ui/Tree] checkbox 需要 multiple：单选请用行高亮，勾选框会被误读成多选')
    }
}

defineExpose({
    /** 当前选中的 key（前序顺序） */
    selectedKeys,
    /** 半选的父节点 key —— 权限提交要把它和 selectedKeys 一起发给后端 */
    indeterminateKeys,
    expandAll: () => setExpanded([...branchKeys.value]),
    collapseAll: () => setExpanded([]),
})
</script>

<template>
  <TreeRoot
    v-slot="{flattenItems}"
    :items="items"
    :model-value="selectedItems"
    :expanded="expandedKeys"
    :get-key="readKey"
    :get-children="readChildren"
    :multiple="multiple"
    :disabled="disabled"
    as="ul"
    :aria-label="ariaLabel || undefined"
    :class="cn('flex min-w-0 flex-col', props.class)"
    @update:model-value="onRootUpdate"
    @update:expanded="setExpanded"
  >
    <TreeItem
      v-for="node in flattenItems"
      :key="node._id"
      v-slot="{isExpanded, isSelected, handleToggle}"
      v-bind="node.bind"
      :disabled="node.value?.disabled === true"
      :class="rowClass"
      :style="{paddingInlineStart: `${(node.level - 1) * indent + 6}px`}"
      @select="onSelect"
      @toggle="onToggle"
    >
      <span v-if="node.hasChildren" :class="TWISTY" @click.stop="handleToggle()">
        <IconChevronRight
          class="size-3.5 transition-transform duration-150"
          :class="isExpanded && 'rotate-90'"
          aria-hidden="true"
        />
      </span>
      <span v-else class="size-5 shrink-0" aria-hidden="true" />

      <span v-if="checkbox" :class="boxClass(isSelected, indeterminateSet.has(node._id))" aria-hidden="true">
        <IconMinus v-if="indeterminateSet.has(node._id)" class="size-3" />
        <IconCheck v-else-if="isSelected" class="size-3" />
      </span>

      <span class="flex min-w-0 flex-1 items-center gap-2" @keydown="onContentKeydown">
        <slot
          name="item"
          v-bind="{
            item: node.value,
            level: node.level,
            hasChildren: node.hasChildren,
            isExpanded,
            isSelected,
            isIndeterminate: indeterminateSet.has(node._id),
            label: readLabel(node.value),
          }"
        >
          <span class="truncate">{{ readLabel(node.value) }}</span>
        </slot>
      </span>
    </TreeItem>
  </TreeRoot>
</template>
