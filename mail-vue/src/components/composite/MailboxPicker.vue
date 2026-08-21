<script setup>
/**
 * MailboxPicker — 侧栏顶部的邮箱切换器（§7.2 + §10.5 增量 6）
 *
 * 取代 P2 过渡期那个「点一下弹出旧账号浮层」（`uiStore.accountShow` →
 * `layout/account/index.vue`，677 行）的入口。§10.4 的验收线是硬的：
 * **200 个邮箱压测下，选项 DOM 节点 ≤ 16，打开的 INP < 200ms**。
 *
 * 为什么不用 L1 的 `Combobox`：那一个是**表单控件**（输入框在收起态就占位，触发器是
 * 输入框本身）。这里要的是「按钮触发 + 面板里带搜索框 + 虚拟滚动」，形状不同。
 * 但外观走同一套 `_shared/overlay.variants`，所以看上去和其它浮层是一家的。
 *
 * ── 关键实现约束（都是读 reka-ui 2.10 源码得到的，改动前请先确认这些仍然成立）──
 *
 * 1. `ComboboxVirtualizer` 的滚动容器是**它的直接父元素**（`ListboxVirtualizer` 里
 *    `useParentElement()`），所以 `overflow-y` + `max-height` 必须挂在 `ComboboxViewport` 上。
 * 2. 行高只来自 `estimateSize(index)`（没有 `measureElement`），所以分组标签行 28、
 *    选项行 40 要在函数里按 index 返回，不能靠 CSS。
 * 3. `ComboboxInput`（内部是 `ListboxFilter`）挂载时会把 `rootContext.focusable = false`：
 *    DOM 焦点留在搜索框里，键盘导航只移动 `aria-activedescendant`。这同时避开了
 *    `virtualKeydownHook` 里 `Number(getActiveElement()?.getAttribute('data-index'))` 取到
 *    NaN 的崩溃路径 —— 所以**搜索框必须始终挂载**。
 * 4. `by="key"` 让选中比较走稳定的行 key，而不是对象引用。
 *
 * ── ≤16 个节点是怎么保证的 ──
 * 分区（全部邮箱 / 最近 / 全部）**不是**嵌套结构，而是拍平进同一个虚拟数组的行；
 * 标签行渲染成普通 `div`（`role="presentation"`）而不是 `ComboboxItem`，
 * 于是键盘导航会跳过它们。窗口 = 视口 288px / 40px ≈ 8 行，overscan 2 → 最多 12 个。
 * 唯一的 a11y 妥协：`aria-setsize` 会把标签行也数进去（差 1~2），
 * 它由 `cloneVNode` 注入、无法从插槽内覆盖。
 */
import {computed, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {
    ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal,
    ComboboxRoot, ComboboxTrigger, ComboboxViewport, ComboboxVirtualizer,
} from 'reka-ui'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconSearch from '~icons/lucide/search'
import IconLayers from '~icons/lucide/layers'
import IconCheck from '~icons/lucide/check'
import {Avatar, Spinner, Tooltip} from '@/components/ui'
import {menuItemVariants, MENU_LABEL, popoverPanelVariants} from '@/components/ui/_shared/overlay.variants.js'
import {useMailboxes, ALL_MAILBOXES} from '@/composables/useMailboxes.js'
import {useCounts} from '@/composables/useCounts.js'
import {useUserStore} from '@/store/user.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 56px 图标态：触发器只剩头像 */
    collapsed: {type: Boolean, default: false},
    /** 单邮箱 / 无 `account:query` 时这一行只是身份显示，不做成按钮 */
    disabled: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['select'])

/** 行高（§7.2 线框）：选项 40、分组标签 28 */
const ROW = {option: 40, label: 28}
/** 视口 288 = 7.2 行；配合 overscan 2 把节点数压在 12 上下 */
const VIEWPORT_MAX = 288

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const {unreadMap, refreshUnread} = useCounts()
const {
    mailboxes, recent, results, keyword, hasMore, loading, loadingMore, searching, error,
    currentAccountId, ensureFirstPage, loadMore, search, select,
} = useMailboxes()

const open = ref(false)

const currentEmail = computed(() => {
    const hit = mailboxes.find((row) => row.accountId === currentAccountId.value)
    return hit?.email || userStore.user?.email || ''
})

const triggerLabel = computed(() => (currentAccountId.value > 0
    ? currentEmail.value
    : t('mail.allMailboxes')))

/* --------------------------------------------------------------- 行的拍平 */

/**
 * 拍平成一维行数组。三种 kind：
 *   `all`    「全部邮箱」聚合项（accountId 0 → `/email/list` 走 allReceive=1）
 *   `label`  分组标签，`role="presentation"`，键盘跳过
 *   `box`    邮箱选项
 * 搜索态只出结果（再摆「最近」会让人以为那也是命中项）。
 */
const rows = computed(() => {
    const out = []

    if (keyword.value.trim()) {
        results.forEach((box) => out.push({kind: 'box', key: `s:${box.accountId}`, box}))
        return out
    }

    out.push({kind: 'all', key: 'all'})

    if (recent.value.length) {
        out.push({kind: 'label', key: 'l:recent', text: t('mail.recentMailboxes')})
        recent.value.forEach((box) => out.push({kind: 'box', key: `r:${box.accountId}`, box, recent: true}))
    }

    if (mailboxes.length) {
        out.push({kind: 'label', key: 'l:all', text: t('mail.allMailboxesLabel')})
        mailboxes.forEach((box) => out.push({kind: 'box', key: `m:${box.accountId}`, box}))
    }

    return out
})

const empty = computed(() => !loading.value && !searching.value && rows.value.length === 0)

/** reka 的类型检索用它取行文本；标签行给空串免得被检索命中 */
const textOf = (row) => (row.kind === 'box' ? `${row.box.name ?? ''} ${row.box.email ?? ''}` : '')

const sizeOf = (index) => (rows.value[index]?.kind === 'label' ? ROW.label : ROW.option)

const isCurrent = (row) => (row.kind === 'all'
    ? currentAccountId.value === 0
    : row.box?.accountId === currentAccountId.value)

/* ------------------------------------------------------------------ 行为 */

watch(open, (isOpen) => {
    if (!isOpen) {
        search('')
        return
    }
    ensureFirstPage()
    // 「最近」区的未读角标（§10.5：只有最近列表显示未读角标），失败静默
    refreshUnread(recent.value.map((box) => box.accountId))
})

/** 滚到底继续拉。`ComboboxViewport` 是滚动容器，所以监听它自己的 scroll */
function onScroll(event) {
    if (keyword.value.trim() || !hasMore.value) return
    const el = event.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) loadMore()
}

function choose(row) {
    if (!row) return
    const target = row.kind === 'all' ? ALL_MAILBOXES : row.box
    select(target)
    open.value = false
    // 在设置页选邮箱时把人带回收件箱；已经在邮件视图里就别跳，跳了会把 `:emailId` 冲掉
    if (!route.meta?.mail) router.push({name: 'email'})
    emit('select', target)
}
</script>

<template>
  <ComboboxRoot
    v-model:open="open"
    ignore-filter
    :reset-search-term-on-select="false"
    :reset-search-term-on-blur="false"
    by="key"
    :disabled="disabled"
    :class="cn('relative', props.class)"
  >
    <!-- 不可切换（单邮箱 / 无 account:query）：只是一行身份显示，不进 Tab 序 -->
    <Tooltip v-if="disabled" :text="currentEmail" :disabled="!collapsed" side="right">
      <div
        :class="collapsed
          ? 'grid size-8 place-items-center'
          : 'flex h-9 items-center gap-2 px-2 text-body text-fg-muted'"
      >
        <Avatar :name="currentEmail" :size="collapsed ? 'md' : 'xs'" decorative />
        <span v-if="!collapsed" class="truncate">{{ currentEmail }}</span>
      </div>
    </Tooltip>

    <!--
      触发器：Tooltip → ComboboxAnchor → ComboboxTrigger → button 的 as-child 链。
      必须是 `ComboboxTrigger` 而不是只有 `ComboboxAnchor`：anchor 只负责定位，
      开合与「关闭后把焦点还给触发器」都靠 trigger 注册的元素。
      它默认注入 `tabindex="-1"` 和 `aria-label="Show popup"`（因为 L1 那种形态里输入框
      才是控件），这里按钮本身就是控件，所以在按钮上把这两个属性写回来 ——
      reka 的 `Slot` 用 `mergeProps(attrs, childProps)`，子节点的同名属性胜出。
    -->
    <Tooltip v-else :text="triggerLabel" :disabled="!collapsed" side="right">
      <ComboboxAnchor as-child>
        <ComboboxTrigger as-child>
          <button
            type="button"
            tabindex="0"
            :aria-label="`${t('shell.switchMailbox')} · ${triggerLabel}`"
            :class="collapsed
              ? 'grid size-8 place-items-center rounded-full transition-opacity hover:opacity-90'
              : 'flex h-9 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-body text-fg transition-colors hover:bg-hover'"
          >
            <IconLayers v-if="currentAccountId === 0" class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <Avatar v-else :name="currentEmail" :size="collapsed ? 'md' : 'xs'" decorative />
            <template v-if="!collapsed">
              <span class="truncate">{{ triggerLabel }}</span>
              <IconChevronDown class="ml-auto size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            </template>
          </button>
        </ComboboxTrigger>
      </ComboboxAnchor>
    </Tooltip>

    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        align="start"
        :side-offset="4"
        :class="cn(popoverPanelVariants({padding: 'none'}), 'w-72 overflow-hidden')"
      >
        <!-- 搜索框必须常挂：它把 focusable 置为 false，键盘导航才不会去 focus 虚拟项 -->
        <div class="flex items-center gap-2 border-b border-line px-2.5 py-2">
          <IconSearch class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <ComboboxInput
            auto-focus
            :placeholder="t('mail.searchMailbox')"
            :aria-label="t('mail.searchMailbox')"
            :model-value="keyword"
            class="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
            @update:model-value="search($event)"
          />
          <Spinner v-if="searching" size="xs" />
        </div>

        <ComboboxViewport
          class="overflow-y-auto overscroll-contain p-1"
          :style="{maxHeight: `${VIEWPORT_MAX}px`}"
          @scroll="onScroll"
        >
          <div v-if="loading" class="grid gap-1 px-1 py-2" aria-busy="true">
            <div v-for="i in 3" :key="i" class="h-8 animate-pulse rounded-sm bg-hover" />
          </div>

          <p v-else-if="error" class="px-2 py-3 text-center text-caption text-danger-fg">
            {{ t('mail.mailboxLoadFailed') }}
          </p>

          <p v-else-if="empty" class="px-2 py-3 text-center text-caption text-fg-muted">
            {{ keyword.trim() ? t('mail.noMailboxMatch') : t('mail.noMailbox') }}
          </p>

          <ComboboxVirtualizer
            v-else
            v-slot="{option}"
            :options="rows"
            :estimate-size="sizeOf"
            :overscan="2"
            :text-content="textOf"
          >
            <!-- 分组标签：不是 ComboboxItem，所以方向键会跳过它 -->
            <div
              v-if="option.kind === 'label'"
              role="presentation"
              :class="cn(MENU_LABEL, 'flex h-7 items-center')"
            >
              {{ option.text }}
            </div>

            <ComboboxItem
              v-else
              :value="option"
              :class="cn(menuItemVariants(), 'h-10 gap-2.5')"
              @select="choose(option)"
            >
              <IconLayers v-if="option.kind === 'all'" class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <Avatar v-else :name="option.box.email" size="xs" decorative />

              <span class="min-w-0 flex-1 truncate">
                {{ option.kind === 'all' ? t('mail.allMailboxes') : (option.box.name || option.box.email) }}
              </span>

              <span
                v-if="option.recent && unreadMap[option.box.accountId] > 0"
                class="shrink-0 rounded-full bg-accent px-1.5 text-micro tabular-nums text-on-accent"
                :aria-label="t('mail.unreadCount', {n: unreadMap[option.box.accountId]})"
              >{{ unreadMap[option.box.accountId] > 99 ? '99+' : unreadMap[option.box.accountId] }}</span>

              <IconCheck v-if="isCurrent(option)" class="size-4 shrink-0 text-accent-fg" aria-hidden="true" />
            </ComboboxItem>
          </ComboboxVirtualizer>

          <div v-if="loadingMore" class="grid place-items-center py-2">
            <Spinner size="sm" />
          </div>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
