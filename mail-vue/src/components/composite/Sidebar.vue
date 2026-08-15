<script setup>
/**
 * Sidebar — 左栏（§5.1；240px 展开 / 56px 图标态）
 *
 * **只放邮件分类**（§5.1「侧栏只放邮件分类」+ 结构性变化表）：管理、开发者、系统设置
 * 全部迁到 Topbar 的 ⚙ 设置中心入口，所以这里行数恒定，与邮箱数量、权限多少无关。
 *
 * P2 能上的分类就是 §5.1 那张数据源核对表里判定「现成」的四项：
 * 收件箱 / 星标 / 已发送 / 草稿（本机）。回收站要等 §10.5 增量 2，**不占位** ——
 * 摆一个点进去 404 的行比没有更糟。计数同理（增量 3），`SidebarItem` 的契约先备好。
 *
 * 顶部当前邮箱行是 `MailboxPicker` 的**位置**（§5.1 线框），但 Picker 本体是 P3
 * （虚拟滚动 + `GET /account/search`）。P2 先把这一行接到既有的账号浮层
 * （`uiStore.accountShow` → `layout/account/index.vue`），这是 §10.7 明确认可的过渡：
 * 「在此之前保留旧 `account/index.vue` 作为过渡入口」。
 *
 * 键盘（§7.1 sidebar 作用域）：`Alt+↑/↓` 在文件夹间移动，`Alt+←/→` 收起/展开分组。
 * `Shift+F10` 的文件夹右键菜单属于侧栏自定义（P3 `SidebarCustomizer`），此处不注册 ——
 * 注册一个空实现会让 `?` 面板把没实现的键说成能用。
 */
import {computed, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconInbox from '~icons/lucide/inbox'
import IconStar from '~icons/lucide/star'
import IconSend from '~icons/lucide/send'
import IconFileText from '~icons/lucide/file-text'
import IconChevronDown from '~icons/lucide/chevron-down'
import {Avatar, ScrollArea, Tooltip} from '@/components/ui'
import SidebarGroup from './SidebarGroup.vue'
import SidebarItem from './SidebarItem.vue'
import {useHotkeys} from '@/composables/useHotkeys.js'
import {useUiStore} from '@/store/ui.js'
import {useUserStore} from '@/store/user.js'
import {useAccountStore} from '@/store/account.js'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 56px 图标态 */
    collapsed: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['navigate'])

/**
 * 文件夹表。`name` 是路由名（沿用旧名，见 §5.2「`permsToRouter()` 映射不变」），
 * `perm` 不写在这里 —— 已发送/草稿是 `permsToRouter()` 动态注入的，
 * 用 `hasRoute()` 判定比权限键更接近「点了会不会 404」。
 */
const FOLDERS = [
    {name: 'email', label: 'inbox', icon: IconInbox},
    {name: 'star', label: 'starred', icon: IconStar},
    {name: 'send', label: 'sent', icon: IconSend},
    {name: 'draft', label: 'drafts', icon: IconFileText, badge: 'shell.localOnly'},
]

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const userStore = useUserStore()
const accountStore = useAccountStore()
const settingStore = useSettingStore()

const folders = computed(() => FOLDERS
    .filter((f) => router.hasRoute(f.name))
    .map((f) => ({...f, text: t(f.label), badgeText: f.badge ? t(f.badge) : ''})))

/** 账号浮层的可用条件与 `layout/main/index.vue` 保持一致，否则点了没反应 */
const canSwitch = computed(() => settingStore.settings.manyEmail === 0 && hasPerm('account:query'))

const currentEmail = computed(() => accountStore.currentAccount?.email || userStore.user?.email || '')

function openMailboxes() {
    uiStore.accountShow = true
    emit('navigate')
}

/* ------------------------------------------------------------------ 键盘 */

const mailGroupOpen = ref(true)

function moveFolder(step) {
    const list = folders.value
    if (!list.length) return
    const at = list.findIndex((f) => f.name === route.name)
    // 不在任何文件夹里（比如设置页）时，↓ 进第一个、↑ 进最后一个
    const next = at < 0
        ? (step > 0 ? 0 : list.length - 1)
        : (at + step + list.length) % list.length
    router.push({name: list[next].name})
}

useHotkeys([
    {id: 'folder-up', run: () => moveFolder(-1)},
    {id: 'folder-down', run: () => moveFolder(1)},
    {id: 'group-collapse', run: () => (mailGroupOpen.value = false)},
    {id: 'group-expand', run: () => (mailGroupOpen.value = true)},
])
</script>

<template>
  <nav
    :aria-label="t('shell.mainNav')"
    :class="cn('flex h-full min-h-0 flex-col bg-sidebar', props.class)"
  >
    <!-- 当前邮箱行（36px；MailboxPicker 的位置，P3 换成虚拟滚动下拉） -->
    <div :class="collapsed ? 'grid place-items-center px-2 py-2' : 'p-2'">
      <Tooltip :text="currentEmail" :disabled="!collapsed || !currentEmail" side="right">
        <button
          v-if="canSwitch"
          type="button"
          :aria-label="`${t('shell.switchMailbox')}${currentEmail ? ` · ${currentEmail}` : ''}`"
          :class="collapsed
            ? 'grid size-8 place-items-center rounded-full transition-colors hover:opacity-90'
            : 'flex h-9 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-body text-fg transition-colors hover:bg-hover'"
          @click="openMailboxes"
        >
          <Avatar :name="currentEmail" :size="collapsed ? 'md' : 'xs'" decorative />
          <template v-if="!collapsed">
            <span class="truncate">{{ currentEmail }}</span>
            <IconChevronDown class="ml-auto size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          </template>
        </button>
        <!-- 单邮箱 / 无 account:query：这一行只是身份显示，不做成按钮 -->
        <div
          v-else
          :class="collapsed
            ? 'grid size-8 place-items-center'
            : 'flex h-9 items-center gap-2 px-2 text-body text-fg-muted'"
        >
          <Avatar :name="currentEmail" :size="collapsed ? 'md' : 'xs'" decorative />
          <span v-if="!collapsed" class="truncate">{{ currentEmail }}</span>
        </div>
      </Tooltip>
    </div>

    <ScrollArea class="flex-1 px-2 pb-2" :focusable="false">
      <SidebarGroup
        v-model:open="mailGroupOpen"
        :title="t('shell.mailFolders')"
        :collapsed="collapsed"
      >
        <SidebarItem
          v-for="folder in folders"
          :key="folder.name"
          :to="{name: folder.name}"
          :label="folder.text"
          :icon="folder.icon"
          :badge="folder.badgeText"
          :collapsed="collapsed"
          @click="emit('navigate')"
        />
      </SidebarGroup>
    </ScrollArea>
  </nav>
</template>
