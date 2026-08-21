<script setup>
/**
 * AppShell — 应用外壳（§5.1）
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │ ☰ ⬡ Unicorn │ 🔍 搜索邮件、邮箱、命令 ⌘K │ 🔔 ◐ ⚙ (A)  │ 48
 * ├───────────┬──────────────────────────────────────────────┤
 * │ Sidebar   │ ✎ 新邮件 │ ✓☆🗑⧉ │ …            (CommandBar) │ 44
 * │ 248 / 56  ├──────────────────────────────────────────────┤
 * │           │ <slot/>                                      │
 * ├───────────┴──────────────────────────────────────────────┤
 * │ 邮件 · 邮箱 · 设置                    (TabBar, < md)      │ 56
 * └──────────────────────────────────────────────────────────┘
 * ```
 *
 * **侧栏三档**（§5.1「≥1280 三栏 / 1024–1280 两栏 + 侧栏图标态 / <768 单栏」）：
 * `collapsed = userCollapsed ?? !isWide` —— 用户没表态时按断点给默认值（≥xl 展开、
 * md~xl 图标态），表过态就一直听用户的，并落 localStorage。
 * `< md` 侧栏根本不渲染，☰ 改为升起**底部 Sheet**（§5.4 明确否掉左滑抽屉：
 * 「它与系统返回手势天然冲突」）。
 *
 * **这里不画背景**：§8.5 的位置表规定粒子/柔光只出现在认证页与空状态插画区，
 * 「邮件三栏、列表、表格、表单区域一律不绘制」。所以 `useBgEffect` 归 `AuthLayout`。
 *
 * 全局浮层（命令面板 / `?` 面板）挂在这里，全站各一份；Toast 的容器在 `App.vue`，
 * 因为登录页不在 AppShell 里也要能弹。
 *
 * 快捷键（§7.1 global 作用域）**只注册真的有落点的键**：`g x`（回收站）要等
 * §10.5 增量 2、`g k`（API 密钥）要等 P4，注册一个空实现会让 `?` 面板把没实现的
 * 键说成能用。
 */
import {computed, onScopeDispose, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {Sheet} from '@/components/ui'
import Topbar from './Topbar.vue'
import CommandBar from './CommandBar.vue'
import Sidebar from './Sidebar.vue'
import TabBar from './TabBar.vue'
import CommandPalette from './CommandPalette.vue'
import ShortcutsDialog from './ShortcutsDialog.vue'
import {useBreakpoint} from '@/composables/useBreakpoint.js'
import {useHotkeys} from '@/composables/useHotkeys.js'
import {useTheme} from '@/composables/useTheme.js'
import {openPalette, recordVisit, togglePalette} from '@/composables/useCommandPalette.js'
import {openShortcuts} from '@/composables/useShortcutsDialog.js'
import {useMailActions} from '@/composables/useMailActions.js'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

/** 侧栏折叠偏好：`null` = 跟断点走（P5 落 `user_setting` 后换成 prefs） */
const COLLAPSE_KEY = 'um-sidebar-collapsed'

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
/** 命令条的上下文动作作用于当前邮件列表（§6.2），那根线在 useMailActions 里 */
const mailActions = useMailActions()
const settingStore = useSettingStore()
const {isMobile, mdAndUp, isWide} = useBreakpoint()
const {toggle: toggleTheme} = useTheme()

const userCollapsed = ref(readCollapsed())

function readCollapsed() {
    try {
        const raw = localStorage.getItem(COLLAPSE_KEY)
        return raw === null ? null : raw === '1'
    } catch {
        return null
    }
}

const collapsed = computed(() => userCollapsed.value ?? !isWide.value)

const sheetOpen = ref(false)

/** ☰：移动端升起文件夹 Sheet，桌面端折叠/展开侧栏 */
function toggleSidebar() {
    if (isMobile.value) {
        sheetOpen.value = !sheetOpen.value
        return
    }
    userCollapsed.value = !collapsed.value
    try {
        localStorage.setItem(COLLAPSE_KEY, userCollapsed.value ? '1' : '0')
    } catch { /* 隐私模式：本次会话内有效就够了 */ }
}

/**
 * §8.3 允许侧栏宽度做动画，但要求「加 `will-change` 临时提升」——
 * 所以只在变宽/变窄的那 200ms 里挂 will-change，不常驻一个合成层。
 */
const resizing = ref(false)
let resizeTimer = null

watch(collapsed, () => {
    resizing.value = true
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => (resizing.value = false), 200)
})

/**
 * 旧页面（`views/analysis` 的 echarts）靠 `uiStore.asideShow` 感知「正文区变宽了」，
 * 那本来是旧左滑抽屉的开关。这里把折叠态桥过去，图表才会跟着重算宽度；
 * P3 拆掉 analysis 的旧实现后这一条就能删。
 */
watch(collapsed, (value) => (uiStore.asideShow = !value), {immediate: true})

onScopeDispose(() => clearTimeout(resizeTimer))

/**
 * 命令面板「最近访问」的唯一写入点（§6.2）。放这儿而不是 `router.afterEach`：
 * router 里 import 命令面板会绕出 router → palette → request/login → axios → router
 * 的循环依赖，而 AppShell 全站只有一份、每次导航都在，效果等价。
 */
watch(() => route.name, () => recordVisit(route), {immediate: true})

/** 命令条只在邮件视图出现：它的动作全部作用于邮件列表（§6.2） */
const showCommandBar = computed(() => route.meta.mail === true)

/**
 * 「切换邮箱」的落点（P3）：
 *   桌面 —— 侧栏里的 `MailboxPicker`；键盘走命令面板的 `@` 模式最快，两者共用
 *           `useMailboxes()`，选出来的状态一样。
 *   窄屏 —— 侧栏本身不渲染，所以也走 `@` 模式。
 * 旧的 `uiStore.accountShow` 浮层连同它的 Esc 补丁一起删了（§10.7 的过渡到此结束）。
 */
function openMailboxes() {
    openPalette('@')
}

function go(name) {
    if (router.hasRoute(name)) router.push({name})
}

const canSwitchMailbox = computed(() => settingStore.settings.manyEmail === 0 && hasPerm('account:query'))

useHotkeys([
    {id: 'palette', run: () => togglePalette()},
    // `/` 与 ⌘K 同源（§7.5）：都开同一个面板，只是 `/` 不预填前缀
    {id: 'search', run: () => openPalette()},
    {id: 'theme', run: (event) => toggleTheme(event)},
    {id: 'shortcuts', run: openShortcuts},
    {id: 'settings', run: () => go('setting')},
    {id: 'go-inbox', run: () => go('email')},
    {id: 'go-sent', run: () => go('send')},
    {id: 'go-draft', run: () => go('draft')},
    {id: 'go-star', run: () => go('star')},
    {id: 'go-admin', run: () => go('analysis')},
    {
        id: 'compose',
        when: () => hasPerm('email:send') && !!uiStore.writerRef,
        run: () => uiStore.writerRef?.open?.(),
    },
    // 「切换邮箱」与「邮箱管理」都进 `@` 模式：一个入口，一套状态
    {id: 'mailbox-picker', when: () => canSwitchMailbox.value, run: openMailboxes},
    {id: 'go-mailboxes', when: () => canSwitchMailbox.value, run: openMailboxes},
])
</script>

<template>
  <div :class="cn('flex h-full min-h-0 flex-col overflow-hidden bg-canvas', props.class)">
    <!-- 键盘用户的第一站：跳过顶栏与侧栏（WCAG 2.4.1） -->
    <a
      href="#um-main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100]
             focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-body focus:text-fg focus:shadow-lg"
    >{{ t('shell.skipToContent') }}</a>

    <Topbar @toggle-sidebar="toggleSidebar" />

    <div class="flex min-h-0 flex-1">
      <Sidebar
        v-if="mdAndUp"
        :collapsed="collapsed"
        :class="[
          'hidden shrink-0 border-r border-line transition-[width] md:flex',
          collapsed ? 'w-(--um-sidebar-w-collapsed)' : 'w-(--um-sidebar-w)',
          resizing ? 'will-change-[width]' : '',
        ]"
      />

      <div class="flex min-w-0 flex-1 flex-col">
        <CommandBar
          v-if="showCommandBar"
          :selected-count="mailActions.count.value"
          @mark-read="mailActions.run('mark-read')"
          @star="mailActions.run('star')"
          @delete="mailActions.run('delete')"
          @copy-code="mailActions.run('copy-code')"
        />
        <main id="um-main" class="min-h-0 flex-1 overflow-hidden">
          <slot />
        </main>
      </div>
    </div>

    <TabBar />

    <!-- 移动端文件夹：底部升起，不是左滑抽屉（§5.4） -->
    <Sheet
      :open="sheetOpen"
      side="bottom"
      :aria-label="t('shell.mainNav')"
      @update:open="sheetOpen = $event"
    >
      <Sidebar class="bg-transparent" @navigate="sheetOpen = false" />
    </Sheet>

    <CommandPalette />
    <ShortcutsDialog />
  </div>
</template>
