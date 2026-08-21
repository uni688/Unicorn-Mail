<script setup>
/**
 * MailList — 虚拟化邮件列表（§7.4；替换 `components/email-scroll/index.vue` 的 1367 行）
 *
 * 这一层只做「把四个 composable 装在一起并画出来」，业务规则都在下面这些里：
 *   `useMailList`    取数、游标分页、装饰、局部增删、跨视图同步
 *   `useVirtualRows` 变高窗口（邮件行 44/56/72、日期分组头 28、哨兵行 56）
 *   `useSelection`   与路由无关的 `Set<emailId>`、Shift 连选、表头三态
 *   `useMailPrefs`   密度与时间排序的记忆
 *
 * 结构（§7.4 线框）：
 * ```
 * ┌ 表头 40px：[三态勾选] 刷新 · 批量动作 ······· 共 N 封 · 密度 ┐
 * ├ 滚动容器（唯一的滚动条）                                     │
 * │   日期分组头 28（是一种行，不是 sticky —— 虚拟容器里 sticky 不成立）│
 * │   邮件行 …                                                   │
 * │   尾部哨兵：骨架行 / 「没有更多」                             │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * 空 / 错 / 加载三态照 §7.8：首屏骨架（不是转圈）、`EmptyState`、`ErrorState`；
 * 翻页失败不清列表，只把尾部骨架收掉。
 *
 * 键盘（§7.1 list 作用域）：↑/↓ 移动光标行，Enter / Space 打开，`x` 勾选，
 * `Shift+↑/↓` 连选，`a` 全选已加载，`Esc` 清空选择。这些键**只在列表获得焦点后生效**，
 * 全局快捷键仍由 `useHotkeys` 统一注册，此处不抢全局键位。
 */
import {computed, ref, toRef, watch} from 'vue'
import {useClipboard} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import IconInbox from '~icons/lucide/inbox'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconTrash from '~icons/lucide/trash-2'
import IconMailOpen from '~icons/lucide/mail-open'
import IconClock from '~icons/lucide/clock'
import {Button, Checkbox, Skeleton, Tooltip} from '@/components/ui'
import {EmptyState, ErrorState} from '@/components/composite'
import MailRow from './MailRow.vue'
import {useMailList, ROW} from '@/composables/useMailList.js'
import {useVirtualRows} from '@/composables/useVirtualRows.js'
import {useSelection} from '@/composables/useSelection.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** `(cursor, size) => Promise<{list, total, latestEmail?}>` */
    fetch: {type: Function, required: true},
    size: {type: Number, default: 50},
    /** 星标接口，交给 useMailList 做乐观更新 */
    starAdd: {type: Function, default: undefined},
    starCancel: {type: Function, default: undefined},
    /** 星标成功后的回调：星标视图要靠 onStarCancel 把行摘掉（这个列表只放星标邮件） */
    onStarAdd: {type: Function, default: undefined},
    onStarCancel: {type: Function, default: undefined},
    /** 阅读窗格正在看的那一封 */
    activeId: {type: [Number, String], default: null},
    showUnread: {type: Boolean, default: true},
    showStar: {type: Boolean, default: true},
    showStatus: {type: Boolean, default: false},
    /** 回收站要的是「还原 / 彻底删除」，收件箱要的是「删除 / 标记已读」 */
    trashMode: {type: Boolean, default: false},
    /** 有没有删除权限（`email:delete`），没有就不画批量动作 */
    canDelete: {type: Boolean, default: true},
    emptyTitle: {type: String, default: ''},
    emptyDescription: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits([
    'open', 'delete', 'restore', 'purge', 'read', 'unread', 'star', 'unstar', 'refresh', 'contextmenu',
])

const {t} = useI18n()
const {prefs, rowHeight, setDensity, setTimeSort} = useMailPrefs()

const list = useMailList({
    fetch: (cursor, size) => props.fetch(cursor, size),
    size: props.size,
    sort: toRef(prefs, 'timeSort'),
    starAdd: props.starAdd,
    starCancel: props.starCancel,
    onStarAdd: (email) => props.onStarAdd?.(email),
    onStarCancel: (email) => props.onStarCancel?.(email),
})

const selection = useSelection(() => list.mails)

const scroller = ref(null)
/** 哨兵行（骨架 / 「没有更多」）按一行邮件的高度算，视觉上接得上 */
const heightOf = (row) => (row.kind === ROW.GROUP ? 28 : rowHeight.value)

const virtual = useVirtualRows(list.rows, {container: scroller, rowHeight: heightOf})

/** 键盘光标（不是选中）。-1 = 没有光标 */
const cursor = ref(-1)

const mailRows = computed(() => list.rows.value
    .map((row, index) => ({row, index}))
    .filter(({row}) => row.kind === ROW.MAIL))

const total = computed(() => list.total.value)
const showEmpty = computed(() => !list.loading.value && !list.error.value && list.mails.length === 0)
const showError = computed(() => !!list.error.value && list.mails.length === 0)

/* --------------------------------------------------------------- 取数与滚动 */

list.load()

// 触底翻页：`atBottom` 是 1200px 提前量（沿用旧实现），滚动中反复为真时靠 loadMore 自己挡
watch(virtual.atBottom, (hit) => {
    if (hit && !list.loading.value && !list.noLoading.value) list.loadMore()
})

// 切排序 = 换了一种顺序，必须重新从头取（后端的 timeSort 参数由调用方的 fetch 读 prefs）
watch(() => prefs.timeSort, () => list.refresh())

function refresh() {
    selection.clear()
    cursor.value = -1
    emit('refresh')
    return list.refresh()
}

/* ------------------------------------------------------------------ 动作 */

function open(email) {
    cursor.value = mailRows.value.findIndex(({row}) => row.email.emailId === email.emailId)
    emit('open', email)
}

function toggleSelect(email) {
    selection.toggle(email.emailId)
}

function toggleStar(email) {
    const next = email.isStar ? 0 : 1
    list.toggleStar(email)
    emit(next ? 'star' : 'unstar', email)
}

/** 验证码一键复制（旧实现 `copyCode`）。复制失败不打断，用户还能自己选中 */
const {copy} = useClipboard({legacy: true})

function copyCode(code) {
    copy(String(code ?? ''))
}

/** 批量动作作用于「勾选的那些」，一个都没勾时作用于光标行 —— 空手点删除什么都不该发生 */
const targetIds = computed(() => {
    if (selection.count.value > 0) return selection.ids.value
    const hit = mailRows.value[cursor.value]
    return hit ? [hit.row.email.emailId] : []
})

function bulk(event) {
    const ids = targetIds.value
    if (ids.length === 0) return
    emit(event, [...ids])
    selection.clear()
}

/* ------------------------------------------------------------------ 键盘 */

function moveCursor(step, extend = false) {
    const rows = mailRows.value
    if (!rows.length) return
    const next = Math.max(0, Math.min(rows.length - 1, cursor.value + step))
    cursor.value = next
    const {row, index} = rows[next]
    if (extend) selection.selectRange(row.email.emailId)
    virtual.scrollToIndex(index)
}

function onKeydown(event) {
    const rows = mailRows.value
    const current = rows[cursor.value]?.row.email

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault()
            return moveCursor(cursor.value < 0 ? 0 : 1, event.shiftKey)
        case 'ArrowUp':
            event.preventDefault()
            return moveCursor(cursor.value < 0 ? 0 : -1, event.shiftKey)
        case 'Enter':
        case ' ':
            if (!current) return
            event.preventDefault()
            return open(current)
        case 'x':
            if (!current) return
            event.preventDefault()
            return toggleSelect(current)
        case 'a':
            if (event.metaKey || event.ctrlKey) return
            event.preventDefault()
            return selection.selectAllLoaded()
        case 'Escape':
            return selection.clear()
        default:
    }
}

/* ------------------------------------------------- 给宿主用的最小操作面 */

defineExpose({
    refresh,
    reload: () => list.load(),
    addItem: list.addItem,
    removeIds: (ids) => {
        list.removeIds(ids)
        selection.prune()
    },
    /** 阅读窗格里点星标时复用这里的乐观切换，两处状态才不会分叉 */
    toggleStar: list.toggleStar,
    localUnread: list.localUnread,
    localStar: list.localStar,
    mails: list.mails,
    latestEmail: list.latestEmail,
    firstLoad: list.firstLoad,
    selection,
})
</script>

<template>
  <div :class="cn('flex h-full min-h-0 flex-col', props.class)">
    <!-- 表头 40px -->
    <div class="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <Checkbox
        :model-value="selection.headerState.value === 'all'
          ? true
          : (selection.headerState.value === 'some' ? 'indeterminate' : false)"
        :aria-label="t('mail.selectAll')"
        size="sm"
        :disabled="list.mails.length === 0"
        @update:model-value="selection.toggleAll()"
      />

      <Tooltip :text="t('mail.refresh')">
        <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="refresh">
          <IconRefresh :class="cn('size-4', list.loading.value && 'animate-spin')" />
        </Button>
      </Tooltip>

      <Tooltip :text="prefs.timeSort ? t('mail.oldestFirst') : t('mail.newestFirst')">
        <Button
          variant="ghost"
          size="icon-sm"
          :label="prefs.timeSort ? t('mail.oldestFirst') : t('mail.newestFirst')"
          @click="setTimeSort(prefs.timeSort ? 0 : 1)"
        >
          <IconClock class="size-4" />
        </Button>
      </Tooltip>

      <!-- 批量动作：只在有目标时出现（旧实现也是勾了才显示） -->
      <template v-if="canDelete && targetIds.length > 0">
        <Tooltip v-if="!trashMode" :text="t('mail.moveToTrash')">
          <Button variant="ghost" size="icon-sm" :label="t('mail.moveToTrash')" @click="bulk('delete')">
            <IconTrash class="size-4" />
          </Button>
        </Tooltip>
        <template v-else>
          <Button variant="ghost" size="sm" @click="bulk('restore')">{{ t('mail.restore') }}</Button>
          <Button variant="ghost" size="sm" class="text-danger-fg" @click="bulk('purge')">
            {{ t('mail.purge') }}
          </Button>
        </template>
        <Tooltip v-if="showUnread && !trashMode" :text="t('mail.markRead')">
          <Button variant="ghost" size="icon-sm" :label="t('mail.markRead')" @click="bulk('read')">
            <IconMailOpen class="size-4" />
          </Button>
        </Tooltip>
      </template>

      <span class="ml-auto shrink-0 text-caption tabular-nums text-fg-muted">
        <template v-if="selection.count.value > 0">
          {{ t('mail.selectedCount', {n: selection.count.value}) }}
        </template>
        <template v-else-if="total">{{ t('emailCount', {total}) }}</template>
      </span>
    </div>

    <!-- 首屏骨架：§7.8 要求骨架而不是转圈 -->
    <div v-if="list.loading.value && list.mails.length === 0" class="grid gap-1 p-2" aria-busy="true">
      <Skeleton v-for="i in 8" :key="i" :height="`${rowHeight}px`" />
    </div>

    <ErrorState
      v-else-if="showError"
      :title="t('mail.loadFailed')"
      :description="t('mail.loadFailedHint')"
      :retry-label="t('ui.retry')"
      :detail="String(list.error.value?.message ?? '')"
      :detail-label="t('mail.errorDetail')"
      @retry="refresh"
    />

    <EmptyState
      v-else-if="showEmpty"
      :icon="IconInbox"
      :title="emptyTitle || t('mail.emptyInbox')"
      :description="emptyDescription"
    />

    <!-- 滚动容器：整个列表只有这一个滚动条 -->
    <div
      v-else
      ref="scroller"
      role="listbox"
      :aria-label="t('mail.listLabel')"
      :aria-multiselectable="true"
      tabindex="0"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:outline-2 focus-visible:outline-focus"
      @keydown="onKeydown"
    >
      <div class="relative w-full" :style="{height: `${virtual.totalHeight.value}px`}">
        <div
          v-for="item in virtual.visible.value"
          :key="item.key"
          class="absolute left-0 w-full px-1"
          :style="{top: `${item.offset}px`, height: `${item.height}px`}"
        >
          <!-- 日期分组头：虚拟列表里的一种行 -->
          <div
            v-if="item.row.kind === ROW.GROUP"
            role="presentation"
            class="flex h-7 items-center px-2 text-caption text-fg-muted"
          >
            {{ item.row.title }}
          </div>

          <MailRow
            v-else-if="item.row.kind === ROW.MAIL"
            :email="item.row.email"
            :height="rowHeight"
            :selected="selection.isSelected(item.row.email.emailId)"
            :active="String(activeId ?? '') === String(item.row.email.emailId)"
            :show-unread="showUnread"
            :show-star="showStar"
            :show-status="showStatus"
            :show-preview="prefs.density === 'roomy' || prefs.density === 'cozy'"
            :code-label="t('codeLabel')"
            :star-label="item.row.email.isStar ? t('mail.unstar') : t('mail.star')"
            :select-label="t('mail.selectOne')"
            @open="open"
            @toggle-select="toggleSelect"
            @toggle-star="toggleStar"
            @copy-code="copyCode"
            @contextmenu="(event, email) => emit('contextmenu', event, email)"
          />

          <!-- 尾部哨兵 -->
          <Skeleton
            v-else-if="item.row.kind === ROW.LOADING"
            :height="`${rowHeight - 8}px`"
            class="mx-1"
          />
          <p
            v-else
            class="grid h-full place-items-center text-caption text-fg-muted"
          >
            {{ t('noMoreData') }}
          </p>
        </div>
      </div>
    </div>

    <!-- 密度切换放在底部一行，和「共 N 封」分开，避免表头挤成一排图标 -->
    <div class="flex h-8 shrink-0 items-center justify-end gap-1 border-t border-line px-2">
      <button
        v-for="option in ['compact', 'cozy', 'roomy']"
        :key="option"
        type="button"
        :aria-pressed="prefs.density === option"
        :class="cn(
          'rounded-sm px-1.5 py-0.5 text-micro transition-colors',
          prefs.density === option ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover',
        )"
        @click="setDensity(option)"
      >
        {{ t(`mail.density.${option}`) }}
      </button>
    </div>
  </div>
</template>
