<script setup>
/**
 * FolderTree — 侧栏的文件夹树（§5.1 + §6.2「FolderTree」）
 *
 * 从 `Sidebar` 里分出来，因为 P3 起这一块有了自己的状态：**角标计数**（§10.5 增量 3 的
 * `GET /email/counts`）、切邮箱后的重新取数、以及 `Alt+↑/↓` 的文件夹间移动。
 * `Sidebar` 回到纯布局（邮箱行 + 这棵树），改分类不必再动布局文件。
 *
 * 三条规则照 §5.1：
 * 1. **只放邮件分类**，管理与设置在 Topbar 的设置中心。
 * 2. **行只在路由存在时出现**（`router.hasRoute`）—— 点进去 404 的行比没有更糟，
 *    所以已发送 / 草稿跟着 `email:send` 权限走，回收站跟着它自己的路由走。
 * 3. **计数 `> 0` 才画**（`SidebarItem` 负责 `999+` 与折叠态圆点）。收件箱显示的是
 *    **未读数**而不是总数 —— 侧栏角标的用途是「有没有新东西要看」。
 *
 * 计数不做本地推算：删除 / 已读 / 星标之后调 `useCounts().refresh()` 重新取，
 * 后端的谓词和 `/email/list` 完全一致，前端自己算迟早对不上（§10.5 增量 3 的原话）。
 */
import {computed, onMounted, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconInbox from '~icons/lucide/inbox'
import IconStar from '~icons/lucide/star'
import IconSend from '~icons/lucide/send'
import IconFileText from '~icons/lucide/file-text'
import IconTrash from '~icons/lucide/trash-2'
import SidebarGroup from './SidebarGroup.vue'
import SidebarItem from './SidebarItem.vue'
import {useHotkeys} from '@/composables/useHotkeys.js'
import {useCounts} from '@/composables/useCounts.js'
import {useAccountStore} from '@/store/account.js'

// 模板里直接用 `collapsed` / `open`，脚本里用不到，所以不接返回值
defineProps({
    /** 56px 图标态 */
    collapsed: {type: Boolean, default: false},
    /** 分组展开态由 Sidebar 持有（`Alt+←/→` 要能收起整组） */
    open: {type: Boolean, default: true},
})

const emit = defineEmits(['navigate', 'update:open'])

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const {counts, refresh} = useCounts()

/**
 * 文件夹表。`name` 是路由名（§5.2「路由名一个都没改」）；`countKey` 指向
 * `/email/counts` 的字段名，`null` 表示这个分类没有服务端计数（草稿在 Dexie 本地库）。
 */
const FOLDERS = [
    {name: 'email', label: 'inbox', icon: IconInbox, countKey: 'unread', countLabel: 'mail.unreadCount'},
    {name: 'star', label: 'starred', icon: IconStar, countKey: 'star', countLabel: 'mail.itemCount'},
    {name: 'send', label: 'sent', icon: IconSend, countKey: 'sent', countLabel: 'mail.itemCount'},
    {name: 'draft', label: 'drafts', icon: IconFileText, countKey: null, badge: 'shell.localOnly'},
    {name: 'trash', label: 'mail.trash', icon: IconTrash, countKey: 'trash', countLabel: 'mail.itemCount'},
]

const folders = computed(() => FOLDERS
    .filter((f) => router.hasRoute(f.name))
    .map((f) => {
        const count = f.countKey ? counts[f.countKey] : null
        return {
            ...f,
            text: t(f.label),
            badgeText: f.badge ? t(f.badge) : '',
            count: typeof count === 'number' ? count : null,
            countText: typeof count === 'number' && count > 0 && f.countLabel
                ? t(f.countLabel, {n: count})
                : '',
        }
    }))

/* ------------------------------------------------------------------ 取数 */

onMounted(() => refresh({force: true}))

// 切邮箱：角标先清空再重新取（`useCounts` 内部做的），停在旧数字比没数字更容易误判
watch(() => accountStore.currentAccountId, () => refresh({force: true}))

/* ------------------------------------------------------------------ 键盘 */

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
    {id: 'group-collapse', run: () => emit('update:open', false)},
    {id: 'group-expand', run: () => emit('update:open', true)},
])
</script>

<template>
  <SidebarGroup
    :open="open"
    :title="t('shell.mailFolders')"
    :collapsed="collapsed"
    @update:open="emit('update:open', $event)"
  >
    <SidebarItem
      v-for="folder in folders"
      :key="folder.name"
      :to="{name: folder.name}"
      :label="folder.text"
      :icon="folder.icon"
      :count="folder.count"
      :count-label="folder.countText"
      :badge="folder.badgeText"
      :collapsed="collapsed"
      @click="emit('navigate')"
    />
  </SidebarGroup>
</template>
