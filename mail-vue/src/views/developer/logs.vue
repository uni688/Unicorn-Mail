<script setup>
/**
 * 开发者中心 · 调用日志（§4.3 / §4.4）
 *
 * 这一页故意**不用** DataTable，理由是两者的分页语义不同：
 *
 * - DataTable 是「页码 + total」。`api_log` 在持续写入，offset 分页翻页期间头部插了新行
 *   就会漏行/重行，所以服务端给的是**游标**（`logId` = 上一页最后一条）且不返回 total。
 * - 日志是「往下追加、可能上千条」的流，用 [[useVirtualRows]] 只挂可见行；
 *   展开某一行时该行变高（44 → 44+详情），正好是那个 composable 变高模型的用例。
 *
 * 状态码不只用颜色区分（§4.2）：圆点 + 数字 + `aria-label` 里的人话，
 * 三者任一独立可读。统计条上的三段可以点，点一下就把筛选设成 `2xx`/`4xx`/`5xx` ——
 * 这个区间筛选在服务端做（`api-log-service.conditions`），前端只传字符串。
 */
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconLogs from '~icons/lucide/scroll-text'
import IconSearch from '~icons/lucide/search'
import {Badge, Button, DatePicker, Input, Select, Spinner} from '@/components/ui'
import {DeveloperNav, EmptyState, ErrorState} from '@/components/composite'
import {useVirtualRows} from '@/composables/useVirtualRows.js'
import {apiLogKeys, apiLogList} from '@/request/api-log.js'
import {useSettingStore} from '@/store/setting.js'
import {toUtc, tzDayjs} from '@/utils/day.js'

defineOptions({name: 'developer-logs'})

const {t} = useI18n()
const settingStore = useSettingStore()

/** 一页 50 条：和服务端 `pageSize()` 的默认值一致 */
const PAGE_SIZE = 50
const ROW_HEIGHT = 44
const DETAIL_HEIGHT = 148

const list = ref([])
const stats = ref(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref(null)
/** 上一页不足 PAGE_SIZE 就说明到底了，不必再发一次空请求 */
const finished = ref(false)

/* ------------------------------------------------------------------ 筛选 */

/**
 * 「全部」用 `'all'` 这个哨兵值，而不是空字符串。
 *
 * reka 的 `SelectItem` 明确禁止 `value=''`（空串是「清空选择、显示 placeholder」的保留值），
 * 传空串会在 setup 阶段直接抛错 —— 两个 Select 一起挂掉，整页白屏。
 * 送给服务端时再翻译回 `undefined`（见 [[queryParams]]）。
 */
const ALL = 'all'

const filters = ref({keyId: ALL, path: '', status: ALL, range: {start: null, end: null}})

const keyOptions = ref([{label: '', value: ALL}])

apiLogKeys({noMsg: true}).then((data) => {
    const rows = Array.isArray(data) ? data : []
    keyOptions.value = [
        {label: t('developer.allKeys'), value: ALL},
        ...rows.map(row => ({label: `${row.name}（${row.prefix}…）`, value: String(row.keyId)})),
    ]
}).catch(() => {
    keyOptions.value = [{label: t('developer.allKeys'), value: ALL}]
})

const statusOptions = computed(() => [
    {label: t('developer.allStatus'), value: ALL},
    {label: t('developer.status2xx'), value: '2xx'},
    {label: t('developer.status4xx'), value: '4xx'},
    {label: t('developer.status5xx'), value: '5xx'},
])

const hasFilter = computed(() => {
    const f = filters.value
    return Boolean(f.keyId !== ALL || f.path.trim() || f.status !== ALL || f.range?.start || f.range?.end)
})

/**
 * 日期选择器给的是**本地**日期，`create_time` 存的是 UTC，直接送过去会差掉时区那几个小时。
 * 所以在这里把本地日界转成 UTC 字符串，服务端只做字符串比较。
 */
function toUtcBound(day, endOfDay) {
    if (!day) {
        return undefined
    }
    return toUtc(`${day} ${endOfDay ? '23:59:59' : '00:00:00'}`).format('YYYY-MM-DD HH:mm:ss')
}

function queryParams(cursor) {
    const f = filters.value
    return {
        size: PAGE_SIZE,
        logId: cursor || undefined,
        keyId: f.keyId === ALL ? undefined : f.keyId || undefined,
        path: f.path.trim() || undefined,
        status: f.status === ALL ? undefined : f.status || undefined,
        startTime: toUtcBound(f.range?.start, false),
        endTime: toUtcBound(f.range?.end, true),
    }
}

/* ------------------------------------------------------------------ 请求 */

const scroller = ref(null)

async function getList() {
    loading.value = true
    error.value = null
    finished.value = false
    try {
        const data = await apiLogList(queryParams(null), {noMsg: true})
        list.value = Array.isArray(data?.list) ? data.list : []
        stats.value = data?.stats ?? null
        finished.value = list.value.length < PAGE_SIZE
        expanded.value = new Set()
        // 换筛选条件后停在半空中会让人以为没结果，回到顶部
        await nextTick()
        scroller.value?.scrollTo({top: 0})
    } catch (e) {
        error.value = e
        list.value = []
        stats.value = null
    } finally {
        loading.value = false
    }
}

async function loadMore() {
    if (loading.value || loadingMore.value || finished.value || !list.value.length) {
        return
    }
    loadingMore.value = true
    try {
        const cursor = list.value[list.value.length - 1]?.logId
        const data = await apiLogList(queryParams(cursor), {noMsg: true})
        const next = Array.isArray(data?.list) ? data.list : []
        list.value = [...list.value, ...next]
        finished.value = next.length < PAGE_SIZE
    } catch {
        // 追加失败不清空已有数据：上面那几百行还是有用的，底部停住即可
        finished.value = true
    } finally {
        loadingMore.value = false
    }
}

const errorDetail = computed(() => String(error.value?.message ?? ''))

getList()

/** 筛选变化即重查。path 走 `@enter` / 失焦，不做输入即查（每个字符一次 D1 读） */
watch(() => [filters.value.keyId, filters.value.status, filters.value.range], getList, {deep: true})

function resetFilters() {
    filters.value = {keyId: ALL, path: '', status: ALL, range: {start: null, end: null}}
}

function filterByStatus(value) {
    filters.value.status = filters.value.status === value ? ALL : value
}

/* ------------------------------------------------------------- 展开与虚拟滚动 */

const expanded = ref(new Set())

function toggle(logId) {
    const next = new Set(expanded.value)
    next.has(logId) ? next.delete(logId) : next.add(logId)
    expanded.value = next
}

const {visible, totalHeight, atBottom} = useVirtualRows(list, {
    container: scroller,
    rowHeight: row => (expanded.value.has(row.logId) ? ROW_HEIGHT + DETAIL_HEIGHT : ROW_HEIGHT),
    bottomThreshold: 400,
})

watch(atBottom, (hit) => {
    if (hit) {
        loadMore()
    }
})

/* -------------------------------------------------------------------- 展示 */

/** 状态码 → 色调 + 人话。`0` 是中间件都没走到就挂了的情况（几乎不会出现） */
function statusTone(status) {
    if (status >= 200 && status < 300) return 'success'
    if (status >= 400 && status < 500) return 'warning'
    if (status >= 500 || !status) return 'danger'
    return 'neutral'
}

function statusLabel(status) {
    if (status >= 200 && status < 300) return t('developer.statusOk')
    if (status >= 400 && status < 500) return t('developer.statusClientErr')
    if (status >= 500 || !status) return t('developer.statusServerErr')
    return t('developer.statusOther')
}

const DOT_TONE = {success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-fg-subtle'}

function formatTime(value) {
    const date = tzDayjs(value)
    return settingStore.lang === 'en' ? date.format('MMM D HH:mm:ss') : date.format('M月D日 HH:mm:ss')
}

function keyLabel(row) {
    const hit = keyOptions.value.find(option => option.value === String(row.keyId))
    return hit && hit.value !== ALL ? hit.label : t('developer.keyGone', {id: row.keyId ?? '—'})
}

/** 统计条各段占比。总数为 0 时不画，避免一条 0 宽度的灰线 */
const bars = computed(() => {
    const s = stats.value
    if (!s?.total) {
        return []
    }
    return [
        {key: '2xx', tone: 'success', n: s.ok, label: t('developer.statusOk')},
        {key: '4xx', tone: 'warning', n: s.clientErr, label: t('developer.statusClientErr')},
        {key: '5xx', tone: 'danger', n: s.serverErr, label: t('developer.statusServerErr')},
    ].filter(bar => bar.n > 0).map(bar => ({...bar, percent: (bar.n / s.total) * 100}))
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <h1 class="text-title text-fg">{{ t('developer.logs') }}</h1>
      <DeveloperNav class="ml-auto" />
      <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="getList">
        <IconRefresh class="size-4" />
      </Button>
    </div>

    <!-- 筛选：Key / 路径 / 状态码 / 时间范围（§4.3） -->
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      <Select
        v-model="filters.keyId"
        :options="keyOptions"
        size="sm"
        :aria-label="t('developer.filterKey')"
        class="w-52"
      />
      <Input
        v-model="filters.path"
        size="sm"
        clearable
        :placeholder="t('developer.filterPath')"
        :aria-label="t('developer.filterPath')"
        class="w-56"
        @enter="getList"
        @clear="getList"
      >
        <template #prefix><IconSearch /></template>
      </Input>
      <Select
        v-model="filters.status"
        :options="statusOptions"
        size="sm"
        :aria-label="t('developer.filterStatus')"
        class="w-36"
      />
      <DatePicker
        v-model="filters.range"
        range
        size="sm"
        :placeholder="t('developer.filterRange')"
        :aria-label="t('developer.filterRange')"
        class="w-64"
      />
      <Button v-if="hasFilter" variant="ghost" size="sm" @click="resetFilters">
        {{ t('developer.clearFilter') }}
      </Button>
    </div>

    <!-- 统计条：当前筛选条件下的全量分布，点一段即按区间筛 -->
    <div v-if="stats" class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
      <span class="text-caption text-fg-muted">{{ t('developer.statsTotal', {n: stats.total}) }}</span>
      <div v-if="bars.length" class="flex h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-inset" aria-hidden="true">
        <div
          v-for="bar in bars"
          :key="bar.key"
          :class="DOT_TONE[bar.tone]"
          :style="{width: `${bar.percent}%`}"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <Button
          v-for="bar in [
            {key: '2xx', tone: 'success', n: stats.ok, label: t('developer.statusOk')},
            {key: '4xx', tone: 'warning', n: stats.clientErr, label: t('developer.statusClientErr')},
            {key: '5xx', tone: 'danger', n: stats.serverErr, label: t('developer.statusServerErr')},
          ]"
          :key="bar.key"
          variant="ghost"
          size="sm"
          :aria-pressed="filters.status === bar.key"
          :class="filters.status === bar.key && 'bg-selected'"
          @click="filterByStatus(bar.key)"
        >
          <span :class="['size-1.5 rounded-full', DOT_TONE[bar.tone]]" aria-hidden="true" />
          <span class="text-fg-muted">{{ bar.label }}</span>
          <span class="font-mono text-mono text-fg">{{ bar.n }}</span>
        </Button>
      </div>
    </div>

    <!-- 表头：虚拟列表之外，所以天然是 sticky 的 -->
    <div
      v-if="!loading && !error && list.length"
      class="flex items-center gap-3 border-b border-line px-4 py-1.5 text-label text-fg-muted"
      aria-hidden="true"
    >
      <span class="w-12 shrink-0">{{ t('developer.logMethod') }}</span>
      <span class="min-w-0 flex-1">{{ t('developer.logPath') }}</span>
      <span class="w-24 shrink-0">{{ t('developer.logStatus') }}</span>
      <span class="w-16 shrink-0 text-right">{{ t('developer.logDuration') }}</span>
      <span class="w-32 shrink-0 text-right">{{ t('developer.logTime') }}</span>
      <span class="w-7 shrink-0" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <Spinner :label="t('ui.loading')" />
      </div>

      <ErrorState
        v-else-if="error"
        class="h-full"
        :title="t('adminTable.loadFailed')"
        :description="t('adminTable.loadFailedHint')"
        :detail="errorDetail"
        :retry-label="t('ui.retry')"
        :detail-label="t('adminTable.errorDetail')"
        @retry="getList"
      />

      <EmptyState
        v-else-if="!list.length"
        class="h-full"
        :icon="IconLogs"
        :title="hasFilter ? t('developer.emptyLogsFiltered') : t('developer.emptyLogs')"
        :description="hasFilter ? t('developer.emptyLogsFilteredHint') : t('developer.emptyLogsHint')"
        :action-label="hasFilter ? t('developer.clearFilter') : ''"
        @action="resetFilters"
      />

      <div v-else ref="scroller" class="h-full overflow-y-auto">
        <ul
          role="list"
          :aria-label="t('developer.logs')"
          class="relative"
          :style="{height: `${totalHeight}px`}"
        >
          <li
            v-for="item in visible"
            :key="item.key"
            class="absolute inset-x-0"
            :style="{transform: `translateY(${item.offset}px)`, height: `${item.height}px`}"
          >
            <div class="flex items-center gap-3 border-b border-line-subtle px-4" :style="{height: `${ROW_HEIGHT}px`}">
              <Badge size="sm" appearance="outline" class="w-12 shrink-0 justify-center font-mono">
                {{ item.row.method }}
              </Badge>
              <span class="min-w-0 flex-1 truncate font-mono text-mono text-fg">{{ item.row.path }}</span>
              <span class="flex w-24 shrink-0 items-center gap-1.5">
                <span :class="['size-1.5 shrink-0 rounded-full', DOT_TONE[statusTone(item.row.status)]]" aria-hidden="true" />
                <span class="font-mono text-mono text-fg">{{ item.row.status || '—' }}</span>
                <span class="sr-only">{{ statusLabel(item.row.status) }}</span>
              </span>
              <span class="w-16 shrink-0 text-right font-mono text-mono text-fg-muted">{{ item.row.duration }}ms</span>
              <span class="w-32 shrink-0 text-right text-caption text-fg-muted">{{ formatTime(item.row.createTime) }}</span>
              <button
                type="button"
                class="flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                :aria-expanded="expanded.has(item.row.logId)"
                :aria-controls="`log-detail-${item.row.logId}`"
                :aria-label="t('developer.logDetail')"
                @click="toggle(item.row.logId)"
              >
                <IconChevronRight
                  class="size-4 transition-transform"
                  :class="expanded.has(item.row.logId) && 'rotate-90'"
                  aria-hidden="true"
                />
              </button>
            </div>

            <!-- 展开详情：Key、IP、UA、错误。行高由 rowHeight 回调一起算，所以不用动画 -->
            <dl
              v-if="expanded.has(item.row.logId)"
              :id="`log-detail-${item.row.logId}`"
              class="grid gap-1.5 border-b border-line-subtle bg-inset px-4 py-3 text-caption"
            >
              <div class="flex gap-2">
                <dt class="w-20 shrink-0 text-fg-muted">{{ t('developer.logKey') }}</dt>
                <dd class="min-w-0 truncate text-fg">{{ keyLabel(item.row) }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-20 shrink-0 text-fg-muted">{{ t('developer.logIp') }}</dt>
                <dd class="min-w-0 truncate font-mono text-mono text-fg">{{ item.row.ip || '—' }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-20 shrink-0 text-fg-muted">{{ t('developer.logUa') }}</dt>
                <dd class="min-w-0 truncate text-fg">{{ item.row.ua || '—' }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-20 shrink-0 text-fg-muted">{{ t('developer.logErr') }}</dt>
                <dd class="min-w-0 break-words" :class="item.row.err ? 'text-danger' : 'text-fg'">
                  {{ item.row.err || '—' }}
                </dd>
              </div>
            </dl>
          </li>
        </ul>

        <div class="flex h-10 items-center justify-center text-caption text-fg-muted">
          <Spinner v-if="loadingMore" size="sm" :label="t('ui.loading')" />
          <span v-else-if="finished">{{ t('developer.logsEnd') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
