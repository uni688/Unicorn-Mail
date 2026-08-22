<script setup>
/**
 * CommandBar — 命令条（§5.1 第二行 / §6.2「CommandBar」）
 *
 * ```
 * ✎ 新邮件 │ ✓已读  ☆星标  🗑删除  ⧉复制验证码 │ ⇅排序 ▤密度 ⊞窗格 ⟳刷新
 * ```
 *
 * §6.2 的硬规则，逐条落地：
 * - 高 44px、`bg-canvas`、下边框 1px，三段之间用 `Separator`。
 * - **上下文操作常驻 + `disabled`，不用 `v-if`**：位置不跳，用户学得会「这里有四个动作」。
 *   `disabled` 时 Tooltip 说明原因（「先选择邮件」）—— 所以 Tooltip 套在按钮外层的
 *   `<span>` 上：`disabled` 的原生按钮不触发指针事件，套在按钮上提示就出不来。
 * - `< 1024` 中段折叠进 `⋯`；`< 768` 整条隐藏（操作交给 P3 的底部 ActionBar），
 *   这条藏在组件自己的 `hidden md:flex` 里，调用方不会忘。
 * - 每个按钮都有 `aria-keyshortcuts` + Tooltip，与 §7.1 的键一一对应。
 *
 * **P2 的两处缺口（已在交付说明里报备）**：
 * 1. 右段（排序 / 密度 / 窗格 / 刷新）不渲染。它们是**视图状态**而不是上下文动作，
 *    状态归属 P3 的 `MailList`；在没有列表的情况下摆四个控件，点了什么都不会发生。
 * 2. 「新邮件」不带 `▾`。落点只有「写新邮件」一个（P3 起是 `/mail/compose` 整页），
 *    模板 / 回信草稿要等 P3；一个只有一项的下拉是纯粹的多余点击。
 *
 * 选择模型是 P3（§7.4），所以 `selectedCount` 恒为 0，四个动作恒 disabled。
 * 契约先备好，P3 把 count 和事件接上就行。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import IconSquarePen from '~icons/lucide/square-pen'
import IconMailOpen from '~icons/lucide/mail-open'
import IconStar from '~icons/lucide/star'
import IconTrash from '~icons/lucide/trash-2'
import IconCopy from '~icons/lucide/copy'
import IconEllipsis from '~icons/lucide/ellipsis'
import {Button, DropdownMenu, MenuItem, Separator, Tooltip} from '@/components/ui'
import {openCompose} from '@/composables/useComposer.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 当前勾选的邮件数；0 = 四个上下文动作 disabled（P3 接上选择模型后才会非 0） */
    selectedCount: {type: Number, default: 0},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['mark-read', 'star', 'delete', 'copy-code'])

const {t} = useI18n()

const canCompose = computed(() => hasPerm('email:send'))
const hasSelection = computed(() => props.selectedCount > 0)

/** 中段四项。`keys` 是 §7.1 里对应的键，直接进 `aria-keyshortcuts` */
const ACTIONS = [
    {id: 'mark-read', label: 'shell.markRead', icon: IconMailOpen, keys: 'U'},
    {id: 'star', label: 'shell.star', icon: IconStar, keys: 'S'},
    {id: 'delete', label: 'shell.delete', icon: IconTrash, keys: '#'},
    {id: 'copy-code', label: 'shell.copyCode', icon: IconCopy, keys: undefined},
]

function compose() {
    openCompose()
}
</script>

<template>
  <div
    :class="cn(
      'hidden h-(--um-commandbar-h) shrink-0 items-center gap-2 border-b border-line bg-canvas px-2 md:flex',
      props.class,
    )"
    role="group"
    :aria-label="t('shell.mailActions')"
  >
    <!-- 左段：写邮件 -->
    <Button
      v-if="canCompose"
      variant="primary"
      size="sm"
      aria-keyshortcuts="C"
      :title="t('shell.compose')"
      @click="compose"
    >
      <template #icon><IconSquarePen class="size-4 shrink-0" aria-hidden="true" /></template>
      {{ t('shell.compose') }}
    </Button>

    <Separator v-if="canCompose" orientation="vertical" class="h-5" />

    <!-- 中段：上下文动作。常驻 + disabled（§6.2），Tooltip 说明为什么不可用 -->
    <div class="hidden items-center gap-0.5 lg:flex">
      <Tooltip
        v-for="action in ACTIONS"
        :key="action.id"
        :text="hasSelection ? t(action.label) : t('shell.selectMailFirst')"
      >
        <!-- disabled 的按钮不发指针事件，包一层才有 hover 提示 -->
        <span class="inline-flex">
          <Button
            variant="ghost"
            size="sm"
            :disabled="!hasSelection"
            :aria-keyshortcuts="action.keys"
            :title="t(action.label)"
            @click="emit(action.id)"
          >
            <template #icon><component :is="action.icon" class="size-4 shrink-0" aria-hidden="true" /></template>
            {{ t(action.label) }}
          </Button>
        </span>
      </Tooltip>
    </div>

    <!-- < 1024：中段整体折叠进 ⋯（≥1024 时四项已经在上面平铺，这里就不重复出现） -->
    <DropdownMenu align="start">
      <template #trigger>
        <Button variant="ghost" size="icon-sm" :label="t('shell.more')" class="lg:hidden">
          <IconEllipsis class="size-4.5" aria-hidden="true" />
        </Button>
      </template>
      <MenuItem
        v-for="action in ACTIONS"
        :key="action.id"
        :disabled="!hasSelection"
        :shortcut="action.keys"
        @select="emit(action.id)"
      >
        <template #icon><component :is="action.icon" class="size-4 shrink-0" aria-hidden="true" /></template>
        {{ t(action.label) }}
      </MenuItem>
    </DropdownMenu>
  </div>
</template>
