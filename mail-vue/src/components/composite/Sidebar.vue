<script setup>
/**
 * Sidebar — 左栏（§5.1；240px 展开 / 56px 图标态）
 *
 * **只放邮件分类**（§5.1「侧栏只放邮件分类」+ 结构性变化表）：管理、开发者、系统设置
 * 全部迁到 Topbar 的 ⚙ 设置中心入口，所以这里行数恒定，与邮箱数量、权限多少无关。
 *
 * P3 起这个文件回到**纯布局**：上面一行是 `MailboxPicker`（§7.2 虚拟滚动 + 服务端搜索，
 * 取代 P2 过渡期那个 `uiStore.accountShow` 旧浮层入口），下面是 `FolderTree`
 * （分类 + `/email/counts` 角标 + 回收站）。分类表、计数取数、`Alt+↑/↓` 都搬进了
 * `FolderTree`，改分类不用再动布局。
 *
 * 分组展开态留在这里：`Alt+←/→` 收起的是「侧栏的分组」，将来第二个分组
 * （P5 的自定义文件夹）也要用同一个开关。
 */
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {ScrollArea} from '@/components/ui'
import FolderTree from './FolderTree.vue'
import MailboxPicker from './MailboxPicker.vue'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 56px 图标态 */
    collapsed: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['navigate'])

const {t} = useI18n()
const settingStore = useSettingStore()

/**
 * Picker 可用的条件与旧浮层一致（`layout/main/index.vue`）：站长开了多邮箱、
 * 且当前角色有 `account:query`。不可用时 Picker 自己退化成一行身份显示。
 */
const canSwitch = computed(() => settingStore.settings.manyEmail === 0 && hasPerm('account:query'))

/** `Alt+←/→` 由 FolderTree 触发，状态放在这里 */
const mailGroupOpen = ref(true)

</script>

<template>
  <nav
    :aria-label="t('shell.mainNav')"
    :class="cn('flex h-full min-h-0 flex-col bg-sidebar', props.class)"
  >
    <!-- 当前邮箱行（36px）：MailboxPicker 自带触发器与浮层 -->
    <div :class="collapsed ? 'grid place-items-center px-2 py-2' : 'p-2'">
      <MailboxPicker
        :collapsed="collapsed"
        :disabled="!canSwitch"
        @select="emit('navigate')"
      />
    </div>

    <ScrollArea class="flex-1 px-2 pb-2" :focusable="false">
      <FolderTree
        v-model:open="mailGroupOpen"
        :collapsed="collapsed"
        @navigate="emit('navigate')"
      />
    </ScrollArea>
  </nav>
</template>
