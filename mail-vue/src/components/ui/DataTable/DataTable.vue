<script setup>
/**
 * DataTable — 管理域表格（§6.2）
 *
 * 替换 `el-table`（user / role / reg-key 三处）。三条硬约束决定了它长这样：
 *
 * 1. **真 `<table>`**。`el-table` 是 div 拼的，读屏念不出「第 3 行第 2 列」，
 *    也没有 `scope`。这里回到原生表格语义，行头用 `<th scope="col">`。
 * 2. **列走配置数组**而不是一堆具名插槽（§4.1）。`columns` 描述结构，
 *    `#cell-<key>` 只在真的要放组件（按钮、Badge）时才用。
 * 3. **四态由组件自己管**（§7.8）：loading 出骨架行（不是转圈遮罩 —— 遮罩会让
 *    表头一起消失，用户失去上下文）、empty / error 走插槽，`aria-busy` 挂在容器上。
 *
 * 层级说明（偏差）：§6.1 把 DataTable 归在 L2，但 p4 指引 §4.1 指定落在
 * `components/ui/DataTable/` 并从 `@/components/ui` 导出。L1 不能反向依赖
 * `components/composite`（会形成 ui/index → DataTable → EmptyState → ui/index 的
 * 循环），所以空/错两态的**版式**留给 `#empty` / `#error` 插槽，调用方传真的
 * `EmptyState` / `ErrorState`；没传时给一个不带图标的兜底块，保证任何情况下
 * 都不会出现一片空白。
 *
 * 选择模型一律用 [[useSelection]]（§7.4）：表头三态、Shift 连选、全选只作用于
 * 已加载项。「全选」不允许骗人 —— 服务端分页时它选中的是**当前页**，
 * 所以浮动动作条上写的是「已选 N 项（当前页共 M 项）」。
 */
import {computed, nextTick, ref, watch} from 'vue'
import IconArrowDown from '~icons/lucide/arrow-down'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconChevronsUpDown from '~icons/lucide/chevrons-up-down'
import {cn} from '@/utils/cn.js'
import Checkbox from '../Checkbox/Checkbox.vue'
import Skeleton from '../Skeleton/Skeleton.vue'
import Button from '../Button/Button.vue'
import Pagination from '../Pagination/Pagination.vue'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    /**
     * 列定义。`key` 既是取值路径也是插槽名后缀。
     * @type {Array<{
     *   key: string, label?: string, width?: string, minWidth?: string,
     *   align?: 'start'|'center'|'end', sortable?: boolean, sortKey?: string,
     *   truncate?: boolean, formatter?: (value: any, row: any) => any,
     *   hidden?: boolean, headerClass?: string, cellClass?: string,
     *   cardHidden?: boolean, cardLabel?: string
     * }>}
     */
    columns: {type: Array, default: () => []},
    rows: {type: Array, default: () => []},
    /** 行标识字段；也是 `useSelection` 的 idKey */
    rowKey: {type: String, default: 'id'},
    /** `<table>` 的可访问名称（必给：读屏靠它区分同页多张表） */
    ariaLabel: {type: String, default: ''},

    /* ---- 四态（§7.8）：显式 state 优先，否则由 loading / error / rows 推导 ---- */
    loading: {type: Boolean, default: false},
    /** 真值即错误态；字符串会作为 detail 传给 `#error` 插槽 */
    error: {type: [Boolean, String, Object], default: false},
    /** @type {''|'loading'|'empty'|'error'|'data'} 测试与 `/_ds` 用来钉死某一态 */
    state: {type: String, default: ''},
    skeletonRows: {type: Number, default: 8},

    /* ---- 选择（§7.4） ---- */
    selectable: {type: Boolean, default: false},
    /** `useSelection()` 的返回值；selectable 为真时必给 */
    selection: {type: Object, default: null},

    /* ---- 排序：服务端优先，`sortable` 的列才画控件 ---- */
    /** @type {{key: string, order: 'asc'|'desc'}|null} v-model:sort */
    sort: {type: Object, default: null},

    /* ---- 分页：total > 0 时才渲染 ---- */
    page: {type: Number, default: 1},
    pageSize: {type: Number, default: 0},
    total: {type: Number, default: 0},

    /** @type {'md'|'sm'} 行高 44 / 36（§6.2） */
    rowHeight: {type: String, default: 'md'},
    stickyHeader: {type: Boolean, default: true},
    /** @type {'auto'|'table'|'cards'} 窄屏降级；auto = `<md` 转卡片列表（§6.2） */
    layout: {type: String, default: 'auto'},
    /** 行可点（点开详情）时挂 hover 指针并允许 Enter 激活 */
    rowClickable: {type: Boolean, default: false},
    /** 高亮当前行（详情页联动） */
    activeKey: {type: [String, Number], default: undefined},
    /**
     * 加在滚动容器上的类。`stickyHeader` 只有在这个容器**自己是有界的滚动口**时才生效
     * （sticky 认的是最近的 scrollport），所以整页表格要把高度约束传到这里，例如
     * 根节点 `class="min-h-0 flex-1"` + `scroll-class="min-h-0"`。
     */
    scrollClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits([
    'update:sort', 'update:page', 'retry', 'row-click', 'empty-action',
])

const t = useUiText()

/* ------------------------------------------------------------------ 状态机 */

const resolvedState = computed(() => {
    if (props.state) return props.state
    if (props.loading) return 'loading'
    if (props.error) return 'error'
    return props.rows.length === 0 ? 'empty' : 'data'
})

const isBusy = computed(() => resolvedState.value === 'loading')
/** 只有 data 态才画行；另外三态占满 tbody 的一个整行 */
const showRows = computed(() => resolvedState.value === 'data')
const errorDetail = computed(() => (typeof props.error === 'string' ? props.error : ''))

const visibleColumns = computed(() => props.columns.filter(col => !col.hidden))
/** 兜底态那一行要横跨所有列（含选择列） */
const spanAll = computed(() => visibleColumns.value.length + (props.selectable ? 1 : 0))

/* -------------------------------------------------------------------- 取值 */

function rawValue(row, key) {
    if (!key) return undefined
    return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), row)
}

/** 单元格文本：formatter 优先，null/undefined 统一显示为「—」而不是空白 */
function cellText(row, col) {
    const value = rawValue(row, col.key)
    const out = col.formatter ? col.formatter(value, row) : value
    return out === undefined || out === null || out === '' ? '—' : out
}

const keyOf = row => row?.[props.rowKey]

/* -------------------------------------------------------------------- 排序 */

const sortKeyOf = col => col.sortKey || col.key

function sortOrderOf(col) {
    return props.sort && props.sort.key === sortKeyOf(col) ? props.sort.order : null
}

/** 点表头：无序 → desc → asc → desc…（管理端默认想看最新的，所以先 desc） */
function toggleSort(col) {
    if (!col.sortable) return
    const key = sortKeyOf(col)
    const order = sortOrderOf(col) === 'desc' ? 'asc' : 'desc'
    emit('update:sort', {key, order})
}

const ariaSortOf = (col) => {
    if (!col.sortable) return undefined
    const order = sortOrderOf(col)
    return order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none'
}

/* ------------------------------------------------------------------ 选择 */

const selectedCount = computed(() => props.selection?.count?.value ?? 0)
const headerState = computed(() => props.selection?.headerState?.value ?? 'none')
/** reka 的 Checkbox 用 'indeterminate' 表达半选 */
const headerChecked = computed(() => (
    headerState.value === 'all' ? true : headerState.value === 'some' ? 'indeterminate' : false
))

const isSelected = row => Boolean(props.selection?.isSelected(keyOf(row)))

function onRowCheck(row, event) {
    const id = keyOf(row)
    if (event?.shiftKey) props.selection.selectRange(id)
    else props.selection.toggle(id)
}

/* -------------------------------------------- 键盘导航（§6.2 ↑↓ Space Enter） */

const focusIndex = ref(-1)
const bodyRef = ref(null)

/** 行是 roving tabindex：整表只有一个可 Tab 到的行 */
const rowTabIndex = index => (index === Math.max(focusIndex.value, 0) ? 0 : -1)

function focusRow(index) {
    const rows = props.rows
    if (rows.length === 0) return
    const next = Math.min(Math.max(index, 0), rows.length - 1)
    focusIndex.value = next
    nextTick(() => {
        bodyRef.value?.querySelectorAll('[data-um-row]')?.[next]?.focus()
    })
}

function onRowKeydown(event, row, index) {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault()
            focusRow(index + 1)
            break
        case 'ArrowUp':
            event.preventDefault()
            focusRow(index - 1)
            break
        case 'Home':
            event.preventDefault()
            focusRow(0)
            break
        case 'End':
            event.preventDefault()
            focusRow(props.rows.length - 1)
            break
        case ' ':
            if (!props.selectable) break
            event.preventDefault()
            onRowCheck(row, event)
            break
        case 'Enter':
            if (!props.rowClickable) break
            event.preventDefault()
            emit('row-click', row)
            break
    }
}

/** 换页 / 换筛选后行数变了，焦点索引可能指到不存在的行 */
watch(() => props.rows.length, (len) => {
    if (focusIndex.value >= len) focusIndex.value = -1
})

/* -------------------------------------------------------------------- 外观 */

const ROW_H = {md: 'h-11', sm: 'h-9'}
const ALIGN = {start: 'text-left', center: 'text-center', end: 'text-right'}
const cellAlign = col => ALIGN[col.align] || ALIGN.start

const pageCount = computed(() => (
    props.pageSize > 0 ? Math.ceil(props.total / props.pageSize) : 0
))
const showPagination = computed(() => props.total > 0 && props.pageSize > 0 && pageCount.value > 1)
</script>

<template>
  <div :class="cn('flex min-w-0 flex-col gap-3', props.class)">
    <!-- 浮动动作条（§6.2）：有选中才出现，文案必须说清「N 项」是哪个范围（§7.4） -->
    <div
      v-if="selectable && selectedCount > 0"
      class="flex flex-wrap items-center gap-2 rounded-md border border-accent-line bg-selected px-3 py-2"
      role="region"
      :aria-label="t('select')"
    >
      <span class="text-label text-fg">
        {{ t('selectedCount', {n: selectedCount, total: rows.length}) }}
      </span>
      <div class="ml-auto flex items-center gap-1.5">
        <slot name="actions" :count="selectedCount" :ids="selection.ids.value" />
        <Button variant="ghost" size="sm" @click="selection.clear()">{{ t('clear') }}</Button>
      </div>
    </div>

    <!--
      横向滚动容器：窄屏 layout='auto' 会走下面的卡片列表，这里的 overflow 是给
      md 以上「列多到放不下」兜底 —— 无论如何都不允许把外层布局撑破（§4.1）。
    -->
    <div
      :class="cn('min-w-0 overflow-x-auto rounded-lg border border-line', props.scrollClass)"
      :aria-busy="isBusy || undefined"
    >
      <table
        v-if="layout !== 'cards'"
        :class="cn(
          'w-full border-collapse text-body',
          layout === 'auto' && 'hidden md:table',
        )"
        :aria-label="ariaLabel || undefined"
        :aria-rowcount="total || rows.length || undefined"
      >
        <caption v-if="$slots.caption" class="px-3 py-2 text-left text-caption text-fg-muted">
          <slot name="caption" />
        </caption>

        <thead
          :class="cn(
            'text-label text-fg-muted',
            stickyHeader && 'sticky top-0 z-1 bg-surface/85 backdrop-blur-sm',
          )"
        >
          <tr class="border-b border-line">
            <th v-if="selectable" scope="col" class="w-10 px-3 py-2">
              <Checkbox
                size="sm"
                :model-value="headerChecked"
                :aria-label="t('selectAll')"
                @update:model-value="selection.toggleAll()"
              />
            </th>
            <th
              v-for="col in visibleColumns"
              :key="col.key"
              scope="col"
              :style="{width: col.width, minWidth: col.minWidth}"
              :aria-sort="ariaSortOf(col)"
              :class="cn('px-3 py-2 font-normal whitespace-nowrap', cellAlign(col), col.headerClass)"
            >
              <slot :name="`header-${col.key}`" :column="col">
                <button
                  v-if="col.sortable"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-sm text-label text-fg-muted transition-colors hover:text-fg"
                  @click="toggleSort(col)"
                >
                  <span>{{ col.label }}</span>
                  <IconArrowUp v-if="sortOrderOf(col) === 'asc'" class="size-3.5 text-accent-fg" aria-hidden="true" />
                  <IconArrowDown v-else-if="sortOrderOf(col) === 'desc'" class="size-3.5 text-accent-fg" aria-hidden="true" />
                  <IconChevronsUpDown v-else class="size-3.5 text-fg-subtle" aria-hidden="true" />
                </button>
                <span v-else>{{ col.label }}</span>
              </slot>
            </th>
          </tr>
        </thead>

        <tbody ref="bodyRef">
          <!-- loading：骨架行保持表头与行高不变，数据到位时不抖（§7.8） -->
          <template v-if="resolvedState === 'loading'">
            <tr v-for="i in skeletonRows" :key="`sk-${i}`" :class="cn('border-b border-line', ROW_H[rowHeight])">
              <td v-if="selectable" class="px-3"><Skeleton variant="rect" width="16px" height="16px" /></td>
              <td v-for="col in visibleColumns" :key="col.key" class="px-3">
                <Skeleton width="70%" />
              </td>
            </tr>
          </template>

          <tr v-else-if="resolvedState === 'error'">
            <td :colspan="spanAll" class="p-0">
              <slot name="error" :detail="errorDetail" :retry="() => emit('retry')">
                <div role="alert" class="grid min-h-40 place-content-center justify-items-center gap-2 px-6 py-8 text-center">
                  <p class="text-body-strong text-danger-fg">{{ t('loadFailed') }}</p>
                  <p v-if="errorDetail" class="max-w-80 text-caption text-fg-muted">{{ errorDetail }}</p>
                  <Button variant="secondary" size="sm" class="mt-1" @click="emit('retry')">{{ t('retry') }}</Button>
                </div>
              </slot>
            </td>
          </tr>

          <tr v-else-if="resolvedState === 'empty'">
            <td :colspan="spanAll" class="p-0">
              <slot name="empty" :action="() => emit('empty-action')">
                <div class="grid min-h-40 place-content-center justify-items-center gap-2 px-6 py-8 text-center">
                  <p class="text-body-strong text-fg">{{ t('noData') }}</p>
                </div>
              </slot>
            </td>
          </tr>

          <template v-else>
            <!--
              行的选中态不用 `aria-selected`：`role=table` 的 row 不支持这个属性
              （只有 grid / treegrid 支持），axe 会判 aria-allowed-attr 违规。
              对读屏来说「这行选没选」本来就由行首那个 Checkbox 的 checked 表达。
            -->
            <tr
              v-for="(row, index) in rows"
              :key="keyOf(row) ?? index"
              data-um-row
              :tabindex="rowTabIndex(index)"
              :data-selected="selectable && isSelected(row) ? '' : undefined"
              :class="cn(
                'relative border-b border-line last:border-b-0 transition-colors',
                ROW_H[rowHeight],
                'hover:bg-hover',
                isSelected(row) && 'bg-selected',
                activeKey !== undefined && activeKey === keyOf(row) && 'bg-selected',
                rowClickable && 'cursor-pointer',
              )"
              @click="rowClickable && emit('row-click', row)"
              @keydown="onRowKeydown($event, row, index)"
            >
              <td v-if="selectable" class="px-3" @click.stop>
                <!--
                  选中条用 ::before 画在第一格上：给 <tr> 加 border-left 在
                  border-collapse 下会被相邻单元格边框吃掉，位置也会随滚动漂。
                -->
                <span
                  v-if="isSelected(row)"
                  class="absolute inset-y-0 left-0 w-0.5 bg-accent"
                  aria-hidden="true"
                />
                <Checkbox
                  size="sm"
                  :model-value="isSelected(row)"
                  :aria-label="t('selectRow')"
                  @click="onRowCheck(row, $event)"
                />
              </td>
              <td
                v-for="col in visibleColumns"
                :key="col.key"
                :class="cn('px-3', cellAlign(col), col.truncate && 'max-w-0 truncate', col.cellClass)"
              >
                <slot :name="`cell-${col.key}`" :row="row" :value="rawValue(row, col.key)" :index="index">
                  {{ cellText(row, col) }}
                </slot>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!--
        窄屏降级为卡片列表（§6.2「`<md` 退化为 CardList」）。同一份 columns，
        每张卡把「列名: 值」竖排 —— 比横向滚动一张 8 列表格好用得多。
      -->
      <div v-if="layout !== 'table'" :class="cn('divide-y divide-line', layout === 'auto' && 'md:hidden')">
        <template v-if="resolvedState === 'loading'">
          <div v-for="i in Math.min(skeletonRows, 4)" :key="`skc-${i}`" class="space-y-2 p-3">
            <Skeleton width="40%" />
            <Skeleton :lines="2" />
          </div>
        </template>

        <div v-else-if="resolvedState === 'error'" role="alert" class="grid min-h-40 place-content-center justify-items-center gap-2 p-6 text-center">
          <slot name="error" :detail="errorDetail" :retry="() => emit('retry')">
            <p class="text-body-strong text-danger-fg">{{ t('loadFailed') }}</p>
            <Button variant="secondary" size="sm" @click="emit('retry')">{{ t('retry') }}</Button>
          </slot>
        </div>

        <div v-else-if="resolvedState === 'empty'" class="grid min-h-40 place-content-center p-6 text-center">
          <slot name="empty" :action="() => emit('empty-action')">
            <p class="text-body-strong text-fg">{{ t('noData') }}</p>
          </slot>
        </div>

        <div
          v-for="(row, index) in (showRows ? rows : [])"
          :key="keyOf(row) ?? index"
          :class="cn('flex gap-3 p-3', isSelected(row) && 'bg-selected', rowClickable && 'cursor-pointer')"
          @click="rowClickable && emit('row-click', row)"
        >
          <Checkbox
            v-if="selectable"
            size="sm"
            class="pt-1"
            :model-value="isSelected(row)"
            :aria-label="t('selectRow')"
            @click.stop="onRowCheck(row, $event)"
          />
          <dl class="min-w-0 flex-1 space-y-1">
            <div
              v-for="col in visibleColumns.filter(c => !c.cardHidden)"
              :key="col.key"
              class="flex items-baseline justify-between gap-3"
            >
              <dt class="shrink-0 text-caption text-fg-muted">{{ col.cardLabel ?? col.label }}</dt>
              <dd class="min-w-0 truncate text-body text-fg">
                <slot :name="`cell-${col.key}`" :row="row" :value="rawValue(row, col.key)" :index="index">
                  {{ cellText(row, col) }}
                </slot>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <div v-if="showPagination || $slots.footer" class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 text-caption text-fg-muted">
        <slot name="footer" :total="total">{{ t('totalCount', {n: total}) }}</slot>
      </div>
      <Pagination
        v-if="showPagination"
        :page="page"
        :items-per-page="pageSize"
        :total="total"
        show-edges
        size="sm"
        @update:page="emit('update:page', $event)"
      />
    </div>
  </div>
</template>
