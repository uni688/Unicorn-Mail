<script setup>
/**
 * Calendar — L1 原语（Reka `Calendar` / `RangeCalendar`，§6.1，`DatePicker` 的面板部分）
 *
 * 单日与区间共用这一个组件：`range` 一开就整套换成 reka 的 `RangeCalendar*` 家族
 * （两套原语的 context 不通，不能混用），但样式只写一遍 —— 区间那几个额外的
 * data 属性（`data-highlighted` / `data-selection-start|end`）在单日模式下
 * 永远不会出现，挂着不影响。
 *
 * 值一律是 `YYYY-MM-DD` 字符串（区间是 `{start, end}`），理由见 `date.js`。
 * 区间**每一次点击都会发事件**（先只有 start、end 为 null）：这样 reka 内部状态与
 * 外部 prop 始终一致，调用方要「只在区间选完时才查询」就判断 `end` 有没有值。
 *
 * 尺寸取舍：格子 36px，低于 §4.10 的 44px 触达标准。日历是那条规则的公认例外
 * （7 列 × 44px = 308px + 内边距会在 360px 屏上溢出），iOS / Google 日历同样是
 * 36-40px；行距靠格子之间的空白补足，误点率可接受。
 */
import {computed} from 'vue'
import {
    CalendarCell, CalendarCellTrigger, CalendarGrid, CalendarGridBody, CalendarGridHead,
    CalendarGridRow, CalendarHeadCell, CalendarHeader, CalendarHeading, CalendarNext,
    CalendarPrev, CalendarRoot,
    RangeCalendarCell, RangeCalendarCellTrigger, RangeCalendarGrid, RangeCalendarGridBody,
    RangeCalendarGridHead, RangeCalendarGridRow, RangeCalendarHeadCell, RangeCalendarHeader,
    RangeCalendarHeading, RangeCalendarNext, RangeCalendarPrev, RangeCalendarRoot,
} from 'reka-ui'
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import {cn} from '@/utils/cn.js'
import {useUiText} from '../_shared/useUiText.js'
import {useUiLocale} from '../_shared/useUiLocale.js'
import {formatDateKey, toCalendarDate, toDateKey} from './date.js'

const props = defineProps({
    /** 单日是 `'YYYY-MM-DD'`，区间是 `{start, end}`；可 v-model */
    modelValue: {type: [String, Object], default: undefined},
    /** 选区间而不是单日 */
    range: {type: Boolean, default: false},
    /** 可选范围下界 `'YYYY-MM-DD'` */
    min: {type: String, default: ''},
    max: {type: String, default: ''},
    /** 同时显示几个月（区间选择常用 2） */
    months: {type: Number, default: 1},
    /** 一周从周几开始：0=周日，1=周一（默认周一，中文习惯） */
    weekStartsOn: {type: Number, default: 1},
    /** 固定 6 行：切月时面板高度不跳 */
    fixedWeeks: {type: Boolean, default: true},
    disabled: {type: Boolean, default: false},
    readonly: {type: Boolean, default: false},
    /** 挂载后把焦点放到选中日/今天（浮层里打开时用） */
    initialFocus: {type: Boolean, default: false},
    /** `(key: 'YYYY-MM-DD') => boolean`，返回 true 的日子点不动 */
    isDateDisabled: {type: Function, default: undefined},
    /** 覆盖语言（默认跟随 i18n） */
    locale: {type: String, default: ''},
    /** 整个日历的可访问名称（reka 的默认值是硬编码英文 'Event Date'） */
    label: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])

const t = useUiText()
const appLocale = useUiLocale()
const locale = computed(() => props.locale || appLocale.value)

/** 两套原语按 `range` 整体切换：它们的 context 是各自的，不能混着用 */
const SINGLE = {
    Root: CalendarRoot, Header: CalendarHeader, Prev: CalendarPrev, Next: CalendarNext,
    Heading: CalendarHeading, Grid: CalendarGrid, GridHead: CalendarGridHead,
    GridBody: CalendarGridBody, GridRow: CalendarGridRow, HeadCell: CalendarHeadCell,
    Cell: CalendarCell, CellTrigger: CalendarCellTrigger,
}

const RANGE = {
    Root: RangeCalendarRoot, Header: RangeCalendarHeader, Prev: RangeCalendarPrev,
    Next: RangeCalendarNext, Heading: RangeCalendarHeading, Grid: RangeCalendarGrid,
    GridHead: RangeCalendarGridHead, GridBody: RangeCalendarGridBody,
    GridRow: RangeCalendarGridRow, HeadCell: RangeCalendarHeadCell,
    Cell: RangeCalendarCell, CellTrigger: RangeCalendarCellTrigger,
}

const parts = computed(() => (props.range ? RANGE : SINGLE))

/** 字符串 → reka 要的 DateValue */
const modelDate = computed(() => {
    if (!props.range) {
        return toCalendarDate(props.modelValue)
    }
    const value = typeof props.modelValue === 'object' && props.modelValue !== null ? props.modelValue : {}
    return {start: toCalendarDate(value.start), end: toCalendarDate(value.end)}
})

const rootProps = computed(() => ({
    modelValue: modelDate.value,
    numberOfMonths: props.months,
    minValue: toCalendarDate(props.min),
    maxValue: toCalendarDate(props.max),
    weekStartsOn: props.weekStartsOn,
    fixedWeeks: props.fixedWeeks,
    locale: locale.value,
    // 不传的话读屏会念出硬编码的英文 'Event Date'
    calendarLabel: props.label || t('pickDate'),
    disabled: props.disabled,
    readonly: props.readonly,
    initialFocus: props.initialFocus,
    // 多月面板翻页要整屏翻，否则「9-10 月」点下一月变成「10-11 月」，看着像错位
    pagedNavigation: props.months > 1,
    isDateDisabled: props.isDateDisabled
        ? (date) => props.isDateDisabled(toDateKey(date))
        : undefined,
    // 禁止「点已选中的日子取消选择」：单日的清空交给 DatePicker 的清除按钮，
    // 区间则避免「点了起始日又点一次 → 整个区间没了」这种手滑
    preventDeselect: true,
}))

function onUpdate(value) {
    if (!props.range) {
        emit('update:modelValue', toDateKey(value))
        return
    }
    emit('update:modelValue', {start: toDateKey(value?.start), end: toDateKey(value?.end)})
}

/* -------------------------------------------------------------------------- 外观 */

const NAV = cn(
    'flex size-7 shrink-0 items-center justify-center rounded-md',
    'text-fg-muted transition-colors hover:bg-hover hover:text-fg',
    'data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-disabled data-[disabled]:hover:bg-transparent',
)

/** `<th>` 默认加粗，这里要压回常规字重 */
const HEAD_CELL = 'size-9 pb-1 text-caption font-normal text-fg-muted'

/**
 * 单日与区间的格子样式必须分开写，因为 reka 的 `data-selected` 在两套原语里语义不同：
 * 单日只有那一天带；区间是**整段**（start、end 和中间每一天）都带 —— 而
 * `data-highlighted` 只在「点了起始日、还没点结束日」的拖选预览期存在，
 * 区间一旦选定就是 `null`（见 `useRangeCalendar` 的 `highlightedRange`）。
 * 所以「已选区间」的深浅只能靠 `data-selection-start/end` 区分端点与中间日。
 *
 * 冲突全部用「多个 data 属性叠加」的选择器特异性定胜负（两个属性 = 0,3,0 压过
 * 一个属性的 0,2,0），不依赖 Tailwind 生成 CSS 的先后顺序 —— 那个顺序是实现细节。
 */
const CELL_BASE = cn(
    'relative flex size-9 items-center justify-center rounded-md',
    'text-body text-fg tabular-nums transition-colors select-none',
    'hover:bg-hover',
    // 今天用一个小圆点标，而不是换字色 —— 换字色会和选中态的白字打架
    'data-[today]:after:absolute data-[today]:after:bottom-1 data-[today]:after:size-1',
    'data-[today]:after:rounded-full data-[today]:after:bg-accent',
    'data-[outside-view]:text-fg-muted',
    'data-[unavailable]:text-fg-disabled data-[unavailable]:line-through',
    'data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-disabled data-[disabled]:hover:bg-transparent',
)

const CELL_SINGLE = cn(
    'data-[selected]:bg-accent data-[selected]:text-on-accent',
    'hover:data-[selected]:bg-accent-hover',
    'data-[today]:data-[selected]:after:bg-on-accent',
)

const CELL_RANGE = cn(
    // 已选区间：整段淡底方角，连起来才像一条区间
    'data-[selected]:rounded-none data-[selected]:bg-accent-subtle data-[selected]:text-accent-subtle-fg',
    'hover:data-[selected]:bg-accent-subtle',
    // 两个端点实心：多一个 data 属性就够压过上面那条
    'data-[selected]:data-[selection-start]:rounded-l-md',
    'data-[selected]:data-[selection-start]:bg-accent data-[selected]:data-[selection-start]:text-on-accent',
    'hover:data-[selected]:data-[selection-start]:bg-accent-hover',
    'data-[selected]:data-[selection-end]:rounded-r-md',
    'data-[selected]:data-[selection-end]:bg-accent data-[selected]:data-[selection-end]:text-on-accent',
    'hover:data-[selected]:data-[selection-end]:bg-accent-hover',
    // 拖选预览段（只有 start 落地时才出现）：同样的淡底，端点只圆一边
    'data-[highlighted]:rounded-none data-[highlighted]:bg-accent-subtle data-[highlighted]:text-accent-subtle-fg',
    'hover:data-[highlighted]:bg-accent-subtle',
    'data-[highlighted]:data-[highlighted-start]:rounded-l-md',
    'data-[highlighted]:data-[highlighted-end]:rounded-r-md',
    // 实心端点上的「今天」圆点要反白，淡底上的保持 accent
    'data-[today]:data-[selection-start]:after:bg-on-accent',
    'data-[today]:data-[selection-end]:after:bg-on-accent',
)

/**
 * 多月面板里「邻月补白」要藏掉：两个面板并排时，9 月面板末尾显示 10 月 1-4 号、
 * 10 月面板开头又显示 9 月 28-30 号，同一天在屏幕上出现两次，点哪个都对不上。
 * 用 invisible 而非 hidden：`fixedWeeks` 撑出的格子还要占位，否则面板高度会跳。
 */
const cellTriggerClass = computed(() => cn(
    CELL_BASE,
    props.range ? CELL_RANGE : CELL_SINGLE,
    props.months > 1 && 'data-[outside-view]:invisible data-[outside-view]:pointer-events-none',
))

/** 多月面板每个月自己的小标题（单月时由 Heading 表达，不重复） */
const monthLabel = (value) => formatDateKey(locale.value, toDateKey(value), {year: 'numeric', month: 'long'})
</script>

<template>
  <component
    :is="parts.Root"
    v-slot="{grid, weekDays}"
    v-bind="rootProps"
    :class="cn('inline-flex flex-col gap-3 text-fg', props.class)"
    @update:model-value="onUpdate"
  >
    <component :is="parts.Header" class="flex items-center justify-between gap-2 px-1">
      <component :is="parts.Prev" :class="NAV" :aria-label="t('prevMonth')">
        <IconChevronLeft class="size-4" aria-hidden="true" />
      </component>
      <component :is="parts.Heading" class="text-body-strong text-fg" />
      <component :is="parts.Next" :class="NAV" :aria-label="t('nextMonth')">
        <IconChevronRight class="size-4" aria-hidden="true" />
      </component>
    </component>

    <div class="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <div v-for="month in grid" :key="month.value.toString()" class="flex flex-col gap-1">
        <p v-if="grid.length > 1" class="text-center text-label text-fg-muted">
          {{ monthLabel(month.value) }}
        </p>

        <component :is="parts.Grid" class="w-full border-collapse">
          <component :is="parts.GridHead">
            <component :is="parts.GridRow">
              <component :is="parts.HeadCell" v-for="day in weekDays" :key="day" :class="HEAD_CELL">
                {{ day }}
              </component>
            </component>
          </component>

          <component :is="parts.GridBody">
            <component
              :is="parts.GridRow"
              v-for="(week, weekIndex) in month.rows"
              :key="`week-${weekIndex}`"
            >
              <component
                :is="parts.Cell"
                v-for="date in week"
                :key="date.toString()"
                :date="date"
                class="p-0"
              >
                <component
                  :is="parts.CellTrigger"
                  :day="date"
                  :month="month.value"
                  :class="cellTriggerClass"
                />
              </component>
            </component>
          </component>
        </component>
      </div>
    </div>
  </component>
</template>
