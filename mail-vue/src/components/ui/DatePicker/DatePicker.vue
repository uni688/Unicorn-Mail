<script setup>
/**
 * DatePicker — L1 原语（Reka `Popover` + 本目录的 `Calendar`，§6.1，替换 `el-date-picker` ×3）
 *
 * 不用 reka 的 `DateField`/`DateRangePicker`：那套是「分段输入框」（年/月/日各一个 span，
 * 可键入），旧代码用的三处（收件箱按日期筛选、注册码有效期、用户创建时间）都只需要
 * 「点开选一天」。分段输入框的 a11y 与本地化成本远高于收益，真要键入日期时再补。
 *
 * 值与 `Calendar` 一致：单日 `'YYYY-MM-DD'`，区间 `{start, end}`（理由见 `date.js`）。
 * 触发器上显示的是按当前语言格式化后的文案，`format` 可换 `Intl.DateTimeFormatOptions`。
 *
 * 结构上清除按钮是触发器的**兄弟**而不是子元素：button 套 button 是非法 HTML，
 * 读屏也会把内层按钮念成外层的一部分。
 */
import {computed, ref} from 'vue'
import {PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger} from 'reka-ui'
import IconCalendar from '~icons/lucide/calendar'
import IconX from '~icons/lucide/x'
import {cn} from '@/utils/cn.js'
import {CONTROL_ICON_SIZE, CONTROL_PAD, controlVariants} from '../_shared/control.variants.js'
import {popoverPanelVariants} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'
import {useUiLocale} from '../_shared/useUiLocale.js'
import Calendar from './Calendar.vue'
import {formatDateKey, todayKey} from './date.js'

const props = defineProps({
    /** 单日 `'YYYY-MM-DD'`；区间 `{start, end}`；可 v-model */
    modelValue: {type: [String, Object], default: undefined},
    /** 选区间而不是单日 */
    range: {type: Boolean, default: false},
    /** 可选范围 `'YYYY-MM-DD'` */
    min: {type: String, default: ''},
    max: {type: String, default: ''},
    /** 面板里同时显示几个月；区间默认 2 */
    months: {type: Number, default: undefined},
    placeholder: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'} */
    size: {type: String, default: 'md'},
    disabled: {type: Boolean, default: false},
    invalid: {type: Boolean, default: false},
    clearable: {type: Boolean, default: true},
    /** 面板底部的「今天」快捷按钮（区间模式无意义，不显示） */
    showToday: {type: Boolean, default: true},
    /** 选完就收起面板；区间默认「选到 end 才收」 */
    closeOnSelect: {type: Boolean, default: true},
    /** 触发器文案的格式，透传给 `Intl.DateTimeFormat` */
    format: {type: Object, default: () => ({dateStyle: 'medium'})},
    /** `(key: 'YYYY-MM-DD') => boolean`，返回 true 的日子点不动 */
    isDateDisabled: {type: Function, default: undefined},
    /** 一周从周几开始：0=周日，1=周一 */
    weekStartsOn: {type: Number, default: 1},
    /** 覆盖语言（默认跟随 i18n） */
    locale: {type: String, default: ''},
    id: {type: String, default: ''},
    /** 无可见 label 时的兜底无障碍名称 */
    ariaLabel: {type: String, default: ''},
    /** @type {'top'|'right'|'bottom'|'left'} */
    side: {type: String, default: 'bottom'},
    /** @type {'start'|'center'|'end'} */
    align: {type: String, default: 'start'},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue', 'clear'])

const t = useUiText()
const appLocale = useUiLocale()
const locale = computed(() => props.locale || appLocale.value)

const open = ref(false)
const triggerEl = ref(null)

const months = computed(() => props.months ?? (props.range ? 2 : 1))

const rangeValue = computed(() => (
    typeof props.modelValue === 'object' && props.modelValue !== null ? props.modelValue : {}
))

const hasValue = computed(() => (props.range
    ? Boolean(rangeValue.value.start || rangeValue.value.end)
    : Boolean(props.modelValue)))

/** 触发器上显示的文案；区间只选了一头时就只显示那一头 */
const displayText = computed(() => {
    if (!props.range) {
        return formatDateKey(locale.value, props.modelValue, props.format)
    }
    const start = formatDateKey(locale.value, rangeValue.value.start, props.format)
    const end = formatDateKey(locale.value, rangeValue.value.end, props.format)
    if (start && end) {
        // en dash：区间连接号的排版惯例，比 '-' 更清楚
        return `${start} – ${end}`
    }
    return start || end
})

const showClear = computed(() => props.clearable && !props.disabled && hasValue.value)

/** 「今天」超出 min/max 时按钮点不动，否则点了没反应更让人困惑 */
const todayDisabled = computed(() => {
    const key = todayKey()
    if (props.min && key < props.min) {
        return true
    }
    if (props.max && key > props.max) {
        return true
    }
    return props.isDateDisabled?.(key) === true
})

function onPick(value) {
    emit('update:modelValue', value)
    if (!props.closeOnSelect) {
        return
    }
    // 区间要等 end 落地才收面板：第一次点击只有 start，收起来就没法选第二个端点了
    if (!props.range || (value?.start && value?.end)) {
        open.value = false
    }
}

function onToday() {
    onPick(todayKey())
}

function onClear() {
    emit('update:modelValue', props.range ? {start: null, end: null} : null)
    emit('clear')
    triggerEl.value?.$el?.focus?.()
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <div :class="cn('relative flex w-full items-center', props.class)">
      <PopoverTrigger
        :id="id || undefined"
        ref="triggerEl"
        :disabled="disabled"
        :aria-invalid="invalid || undefined"
        :aria-label="ariaLabel || undefined"
        :class="cn(
          controlVariants({size, invalid}),
          'flex items-center gap-2 text-left',
          CONTROL_PAD[size].prefix,
          showClear && CONTROL_PAD[size].suffix,
        )"
      >
        <IconCalendar
          :class="cn('absolute left-2 shrink-0 text-fg-subtle', CONTROL_ICON_SIZE[size])"
          aria-hidden="true"
        />
        <span v-if="displayText" class="min-w-0 flex-1 truncate">{{ displayText }}</span>
        <span v-else class="min-w-0 flex-1 truncate text-fg-muted">
          {{ placeholder || t('pickDate') }}
        </span>
      </PopoverTrigger>

      <button
        v-if="showClear"
        type="button"
        :aria-label="t('clear')"
        class="absolute right-1 flex size-5 items-center justify-center rounded-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        @click="onClear"
      >
        <IconX class="size-3.5" aria-hidden="true" />
      </button>
    </div>

    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="6"
        :aria-label="ariaLabel || t('pickDate')"
        :class="cn(popoverPanelVariants({padding: 'none'}), 'p-3', props.contentClass)"
      >
        <Calendar
          :model-value="modelValue"
          :range="range"
          :min="min"
          :max="max"
          :months="months"
          :week-starts-on="weekStartsOn"
          :is-date-disabled="isDateDisabled"
          :locale="locale"
          :label="ariaLabel || placeholder"
          initial-focus
          @update:model-value="onPick"
        />

        <div v-if="showToday && !range" class="mt-2 flex justify-end border-t border-line pt-2">
          <button
            type="button"
            :disabled="todayDisabled"
            class="rounded-sm px-2 py-1 text-label text-accent-fg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent"
            @click="onToday"
          >
            {{ t('today') }}
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
