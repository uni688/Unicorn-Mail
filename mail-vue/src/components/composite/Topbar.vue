<script setup>
/**
 * Topbar — 顶栏（§5.1；48px，三段：左品牌 / 中通栏搜索 / 右工具）
 *
 * ```
 * ☰ ⬡ Unicorn │ 🔍 搜索邮件、邮箱、命令  ⌘K │ 🔔  ◐  ⚙  (A)
 * ```
 *
 * 中段那个「搜索框」是**按钮而不是输入框**（§7.5「搜索移至顶栏，与 ⌘K 同源」）：
 * 真正的输入发生在命令面板里，两处各留一份输入状态迟早会不同步。点它 = 按 ⌘K。
 * 宽度 640 → 聚焦 720（§5.1），两个值都在 `--um-search-w*` 里，站长可覆盖。
 *
 * 右侧四个入口对应 §5.1：通知（复用旧 `uiStore.showNotice()` 公告浮层）、主题、
 * 设置中心、头像菜单。**面包屑取消**（§5.1 结构性变化表），所以左段不再显示页面标题 ——
 * 当前位置由侧栏选中态表达。
 *
 * ⚙ 在 P2 是**一个分栏下拉**，不是「设置中心」页面的入口：真正的设置中心（9 个 section）
 * 是 P5 的活。之所以不能等：旧 `layout/aside/index.vue` 的「管理」分组是 analysis /
 * user / all-email / role / reg-key / sys-setting 六个页面**唯一**的入口，P2 删掉它以后
 * 侧栏只剩邮件文件夹，这些页面就只能靠命令面板进了。菜单表直接复用命令面板导出的
 * `SETTINGS`，两处同源 —— 「⚙ 里有的 `#` 也搜得到」就永远成立。
 * 判定用 `router.hasRoute()`（管理页是 `permsToRouter()` 动态注入的）而不是 `hasPerm()`，
 * 理由同 `useCommandPalette.js`：路由在不在比权限键在不在更接近「点了会不会 404」。
 *
 * 头像菜单里的「切换邮箱 ⌘⇧E」只在旧账号浮层真的可用时出现（`manyEmail === 0` +
 * `account:query`），条件与 `layout/main/index.vue` 一致；`MiniQuota` 常驻，
 * 它是旧顶栏那块额度信息的唯一去处。
 */
import {computed} from 'vue'
import {RouterLink, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconMenu from '~icons/lucide/menu'
import IconSearch from '~icons/lucide/search'
import IconMegaphone from '~icons/lucide/megaphone'
import IconSun from '~icons/lucide/sun'
import IconMoon from '~icons/lucide/moon'
import IconSettings from '~icons/lucide/settings'
import IconAtSign from '~icons/lucide/at-sign'
import IconKeyboard from '~icons/lucide/keyboard'
import IconLogOut from '~icons/lucide/log-out'
import {
    Avatar, Badge, Button, DropdownMenu, Kbd, MenuGroup, MenuItem, MenuSeparator, Tooltip,
} from '@/components/ui'
import {toast} from '@/components/ui/Toast/toast.js'
import {MiniQuota} from '@/components/domain'
import BrandMark from './BrandMark.vue'
import {openPalette, SETTINGS} from '@/composables/useCommandPalette.js'
import {openShortcuts} from '@/composables/useShortcutsDialog.js'
import {useTheme} from '@/composables/useTheme.js'
import {useUiStore} from '@/store/ui.js'
import {useUserStore} from '@/store/user.js'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'
import {logout} from '@/request/login.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['toggle-sidebar'])

const {t} = useI18n()
const router = useRouter()
const uiStore = useUiStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const {isDark, toggle: toggleTheme} = useTheme()

const isMac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

/** ARIA 要的是 `event.key` 的拼法，不是 Kbd 里给人看的 ⌘ */
const searchKeyshortcuts = isMac ? 'Meta+K' : 'Control+K'
/** 菜单项右侧的提示文字（`MenuItem.shortcut` 收的是字符串，不走 Kbd） */
const switchMailboxHint = isMac ? '⌘⇧E' : 'Ctrl+Shift+E'

const siteName = computed(() => settingStore.settings.title || 'Unicorn Mail')
const user = computed(() => userStore.user ?? {})
const canSwitch = computed(() => settingStore.settings.manyEmail === 0 && hasPerm('account:query'))

/**
 * ⚙ 菜单：`SETTINGS` 按 `group` 分两栏，空栏不渲染（普通用户没有任何管理路由，
 * 这时菜单里只剩「我的 → 个人设置」一条，也仍然比 P1 那个直链多一层结构感）。
 */
const SETTINGS_GROUPS = [
    {key: 'account', title: 'shell.groupAccount'},
    {key: 'admin', title: 'shell.groupAdmin'},
]

const settingsGroups = computed(() => SETTINGS_GROUPS
    .map((group) => ({
        key: group.key,
        title: t(group.title),
        items: SETTINGS
            .filter((row) => row.group === group.key && router.hasRoute(row.name))
            .map((row) => ({name: row.name, icon: row.icon, text: t(row.label)})),
    }))
    .filter((group) => group.items.length))

async function copyEmail() {
    const email = user.value.email
    if (!email) return
    try {
        await navigator.clipboard.writeText(email)
        toast.success(t('copySuccessMsg'))
    } catch {
        toast.error(t('copyFailMsg'))
    }
}

function openMailboxes() {
    // P3 起不再弹旧账号浮层：命令面板的 `@` 模式与侧栏 Picker 共用 `useMailboxes()`
    openPalette('@')
}

async function doLogout() {
    try {
        await logout()
    } finally {
        localStorage.removeItem('token')
        router.replace('/login')
    }
}
</script>

<template>
  <header
    :class="cn(
      'flex h-(--um-topbar-h) shrink-0 items-center gap-1 border-b border-line bg-surface px-2',
      props.class,
    )"
  >
    <!-- 左：☰ + 字标 + 站点名 -->
    <Button
      variant="ghost"
      size="icon-sm"
      :label="t('shell.toggleSidebar')"
      @click="emit('toggle-sidebar')"
    >
      <IconMenu class="size-4.5" aria-hidden="true" />
    </Button>

    <RouterLink
      :to="{name: 'email'}"
      class="mr-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-hover"
    >
      <BrandMark class="size-5 shrink-0 text-accent" />
      <span class="hidden max-w-40 truncate text-body-strong text-fg sm:block">{{ siteName }}</span>
    </RouterLink>

    <!-- 中：通栏搜索（= ⌘K 的另一个入口） -->
    <div class="flex min-w-0 flex-1 justify-center">
      <button
        type="button"
        :aria-label="t('shell.searchAria')"
        :aria-keyshortcuts="searchKeyshortcuts"
        :class="cn(
          'grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-hover',
          'md:flex md:h-8 md:w-full md:max-w-(--um-search-w) md:items-center md:gap-2 md:px-2.5',
          'md:border md:border-line md:bg-inset md:transition-[max-width,background-color]',
          'md:hover:bg-hover md:focus-visible:max-w-(--um-search-w-focus)',
        )"
        @click="openPalette()"
      >
        <IconSearch class="size-4 shrink-0" aria-hidden="true" />
        <span class="hidden truncate text-body md:block">{{ t('shell.searchPlaceholder') }}</span>
        <Kbd :keys="['Mod', 'K']" class="ml-auto hidden md:flex" aria-hidden="true" />
      </button>
    </div>

    <!-- 右：🔔 ◐ ⚙ (A) -->
    <Tooltip :text="t('shell.notifications')">
      <Button variant="ghost" size="icon-sm" :label="t('shell.notifications')" @click="uiStore.showNotice()">
        <IconMegaphone class="size-4.5" aria-hidden="true" />
      </Button>
    </Tooltip>

    <Tooltip :text="t('shell.toggleTheme')">
      <Button variant="ghost" size="icon-sm" :label="t('shell.toggleTheme')" @click="toggleTheme($event)">
        <IconSun v-if="isDark" class="size-4.5" aria-hidden="true" />
        <IconMoon v-else class="size-4.5" aria-hidden="true" />
      </Button>
    </Tooltip>

    <!-- ⚙：账户 / 管理 分栏。P5 有了真正的设置中心页面后，这里换成单个 RouterLink -->
    <DropdownMenu align="end" width="w-56">
      <template #trigger>
        <Button variant="ghost" size="icon-sm" :label="t('shell.settingsCenter')" class="hidden sm:inline-flex">
          <IconSettings class="size-4.5" aria-hidden="true" />
        </Button>
      </template>
      <MenuGroup v-for="group in settingsGroups" :key="group.key" :label="group.title">
        <MenuItem
          v-for="entry in group.items"
          :key="entry.name"
          @select="router.push({name: entry.name})"
        >
          <template #icon><component :is="entry.icon" class="size-4 shrink-0" aria-hidden="true" /></template>
          {{ entry.text }}
        </MenuItem>
      </MenuGroup>
    </DropdownMenu>

    <DropdownMenu align="end" width="w-64">
      <template #trigger>
        <button
          type="button"
          :aria-label="t('shell.accountMenu')"
          class="ml-0.5 grid size-8 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-90"
        >
          <Avatar :name="user.email" size="md" decorative />
        </button>
      </template>

      <!-- 身份区：不是菜单项，所以不用 MenuLabel（它会被当成可读的分组名念出来） -->
      <div class="grid gap-1 px-2 py-1.5">
        <p v-if="user.name" class="truncate text-body-strong text-fg">{{ user.name }}</p>
        <button
          type="button"
          class="flex items-center gap-1.5 truncate rounded-sm text-left text-caption text-fg-muted transition-colors hover:text-fg"
          :aria-label="t('shell.copyMyEmail')"
          @click="copyEmail"
        >
          <span class="truncate">{{ user.email }}</span>
        </button>
        <Badge v-if="user.role?.name" size="sm" tone="accent" class="justify-self-start">
          {{ user.role.name }}
        </Badge>
      </div>

      <MenuSeparator />
      <MiniQuota class="px-2 py-2" />
      <MenuSeparator />

      <MenuItem v-if="canSwitch" :shortcut="switchMailboxHint" @select="openMailboxes">
        <template #icon><IconAtSign class="size-4 shrink-0" aria-hidden="true" /></template>
        {{ t('shell.switchMailbox') }}
      </MenuItem>
      <MenuItem class="sm:hidden" @select="router.push({name: 'setting'})">
        <template #icon><IconSettings class="size-4 shrink-0" aria-hidden="true" /></template>
        {{ t('shell.settingsCenter') }}
      </MenuItem>
      <MenuItem shortcut="?" @select="openShortcuts">
        <template #icon><IconKeyboard class="size-4 shrink-0" aria-hidden="true" /></template>
        {{ t('shell.shortcuts') }}
      </MenuItem>

      <MenuSeparator />
      <MenuItem tone="danger" @select="doLogout">
        <template #icon><IconLogOut class="size-4 shrink-0" aria-hidden="true" /></template>
        {{ t('logOut') }}
      </MenuItem>
    </DropdownMenu>
  </header>
</template>
