<script setup>
/**
 * Pagination — L1 原语（Reka `Pagination`，§6.1，替换 `el-pagination` ×3）
 *
 * 用在管理端表格（API Key、请求日志、用户列表）。邮件列表不用它 —— 那边是
 * 无限滚动 + 虚拟列表（§5.2）。
 *
 * 页码算法（省略号在哪、siblingCount 怎么展开）全交给 reka 的 `PaginationList`，
 * 它给的 `items` 已经是 `{type:'page'|'ellipsis'}` 的最终序列。我们只负责外观、
 * 文案与 a11y：
 * - 整体是 `<nav>` + 可访问名称（reka 只给 `as="nav"`，不给名字）；
 * - 当前页的 `aria-current="page"` 由 reka 给，我们只负责选中态外观；
 * - reka 的四个方向按钮与页码 hardcode 了英文 `aria-label`（"First Page"、"Page 3"），
 *   这里一律用 `ui.*` 的中文覆盖 —— 透传的 attr 优先级高于组件内部绑定，覆盖是生效的；
 * - 省略号整体 `aria-hidden`：它不可点、不承载信息（缺口由两侧页码本身表达），
 *   给它起名字只会让读屏多念一句「更多页」。
 *   ⚠️ reka 只在 `showEdges` 分支里才产生省略号；不开 `showEdges` 时它单纯滑动一个
 *   `siblingCount * 2 + 1` 宽的窗口（默认就是 3 个页码），首尾页和省略号都不会出现。
 *   要「1 … 4 5 6 … 10」这种形态就必须开 `showEdges`。
 *
 * 移动端（`compact`）只留「上一页 / 第 n 页 / 下一页」：44px 触控目标下
 * 一排页码必然溢出，压缩成三段是唯一不牺牲可点性的做法。
 */
import {computed} from 'vue'
import {
    PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem,
    PaginationNext, PaginationPrev, PaginationRoot,
} from 'reka-ui'
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconChevronsLeft from '~icons/lucide/chevrons-left'
import IconChevronsRight from '~icons/lucide/chevrons-right'
import IconEllipsis from '~icons/lucide/ellipsis'
import {cn} from '@/utils/cn.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    /** 当前页（1 起），可 v-model:page */
    page: {type: Number, default: undefined},
    defaultPage: {type: Number, default: 1},
    /** 每页条数 */
    itemsPerPage: {type: Number, required: true},
    /** 总条数；为 0 时组件只渲染一页 */
    total: {type: Number, default: 0},
    /** 当前页两侧各显示几个页码 */
    siblingCount: {type: Number, default: 1},
    /** 显示「首页 / 末页」按钮 */
    showEdges: {type: Boolean, default: false},
    /** 只保留 上一页 / 页码文字 / 下一页（移动端） */
    compact: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    /** `<nav>` 的可访问名称，默认「分页」 */
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:page'])
const t = useUiText()

const SIZE = {sm: 'size-7 text-label', md: 'size-8 text-body'}

/** 四个方向按钮与页码按钮同尺寸、同圆角，只有选中态不同 */
const cellClass = computed(() => cn(
    'inline-flex shrink-0 items-center justify-center rounded-md border border-transparent',
    'text-fg-muted transition-colors',
    'hover:bg-hover hover:text-fg',
    'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent',
    SIZE[props.size] ?? SIZE.md,
))

const pageClass = computed(() => cn(
    cellClass.value,
    'tabular-nums',
    // 选中页给描边 + 实字色：比实底轻，不会在一排数字里显得过重
    'data-[selected]:border-line-strong data-[selected]:bg-surface data-[selected]:text-fg',
))

const totalPages = computed(() => (
    props.total > 0 && props.itemsPerPage > 0 ? Math.ceil(props.total / props.itemsPerPage) : 1
))
</script>

<template>
  <PaginationRoot
    :page="page"
    :default-page="defaultPage"
    :items-per-page="itemsPerPage"
    :total="total"
    :sibling-count="siblingCount"
    :show-edges="showEdges"
    :disabled="disabled"
    as="nav"
    :aria-label="ariaLabel || t('pagination')"
    :class="cn('flex items-center gap-1', props.class)"
    @update:page="emit('update:page', $event)"
  >
    <PaginationFirst v-if="showEdges && !compact" :aria-label="t('firstPage')" :class="cellClass">
      <IconChevronsLeft class="size-4" aria-hidden="true" />
    </PaginationFirst>

    <PaginationPrev :aria-label="t('prevPage')" :class="cellClass">
      <IconChevronLeft class="size-4" aria-hidden="true" />
    </PaginationPrev>

    <!-- compact 下不渲染页码列表，只报「第 n 页 / 共 m 页」 -->
    <span v-if="compact" class="px-2 text-body text-fg-muted tabular-nums">
      {{ t('page', {n: page ?? defaultPage}) }} / {{ totalPages }}
    </span>

    <PaginationList v-else v-slot="{items}" class="flex items-center gap-1">
      <template v-for="(item, index) in items">
        <PaginationListItem
          v-if="item.type === 'page'"
          :key="`page-${item.value}`"
          :value="item.value"
          :aria-label="t('page', {n: item.value})"
          :class="pageClass"
        >
          {{ item.value }}
        </PaginationListItem>
        <PaginationEllipsis
          v-else
          :key="`ellipsis-${index}`"
          aria-hidden="true"
          :class="cn('inline-flex shrink-0 items-center justify-center text-fg-muted', SIZE[size] ?? SIZE.md)"
        >
          <IconEllipsis class="size-4" aria-hidden="true" />
        </PaginationEllipsis>
      </template>
    </PaginationList>

    <PaginationNext :aria-label="t('nextPage')" :class="cellClass">
      <IconChevronRight class="size-4" aria-hidden="true" />
    </PaginationNext>

    <PaginationLast v-if="showEdges && !compact" :aria-label="t('lastPage')" :class="cellClass">
      <IconChevronsRight class="size-4" aria-hidden="true" />
    </PaginationLast>
  </PaginationRoot>
</template>
