<script setup>
/**
 * MailRow — 列表里的一封邮件（§7.4）
 *
 * ```
 * ┌ 44 / 56 / 72px（密度）─────────────────────────────────────────────┐
 * │ [✓] ★  发件人            主题 — 摘要            📎  状态  时间     │
 * └────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * 与旧 `email-scroll` 行的差别，都是刻意的：
 * 1. **不写邮件对象**。旧行把 `checked` / `rightChecked` 塞进邮件里（`:49`、`:1153`），
 *    于是同一封邮件在列表、星标、阅读窗格之间串台。这里选中态来自 `useSelection`，
 *    右键高亮来自 `context` prop，邮件对象只读。
 * 2. **一行一个可聚焦目标**。整行是 `<div role="option">`（列表是 `role="listbox"`），
 *    键盘用 ↑/↓ 移动，`x` 勾选，Space 打开 —— 旧行是 div + click，Tab 根本进不来。
 * 3. **未读用「点 + 加粗」而不是整行底色**。§7.4 明确不要「未读整行高亮」，
 *    因为它和选中态的底色打架。
 * 4. 状态图标只在发信视图出现（`showStatus`），和旧行一致；`isDel` 的「已删除」标记同理。
 *
 * 时间列显示 `formatCreateTime`（相对时间，由 `useMailList` 每分钟刷新），
 * `title` 给绝对时间 —— 相对时间好读，但「到底几点」必须查得到。
 */
import {computed} from 'vue'
import IconPaperclip from '~icons/lucide/paperclip'
import IconStar from '~icons/lucide/star'
import IconMailX from '~icons/lucide/mail-x'
import {Avatar, Checkbox, Tooltip} from '@/components/ui'
import {formatDetailDate} from '@/utils/day.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'
import {cn} from '@/utils/cn.js'

/** 空主题也要占住一行的高度（旧实现直接写了个零宽字符，这里给它一个名字） */
const ZERO_WIDTH = String.fromCharCode(0x200B)

const props = defineProps({
    email: {type: Object, required: true},
    /** 行高档位来的高度：44 / 56 / 72 */
    height: {type: Number, default: 56},
    selected: {type: Boolean, default: false},
    /** 阅读窗格里正在看的那一封（和「勾选」是两回事） */
    active: {type: Boolean, default: false},
    /** 右键菜单打开时的高亮（旧实现是把 `#FDF6EC` 写进 style） */
    context: {type: Boolean, default: false},
    /** 未读态是否参与显示（回收站 / 已发送里没有未读概念） */
    showUnread: {type: Boolean, default: true},
    showStar: {type: Boolean, default: true},
    /** 发信状态图标（已发送 / 管理端） */
    showStatus: {type: Boolean, default: false},
    /** 摘要行：72px 档才有空间放两行 */
    showPreview: {type: Boolean, default: true},
    codeLabel: {type: String, default: ''},
    starLabel: {type: String, default: ''},
    selectLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['open', 'toggle-select', 'toggle-star', 'copy-code', 'contextmenu'])

const unread = computed(() => props.showUnread && props.email.unread === EmailUnreadEnum.UNREAD)
const sender = computed(() => props.email.name || props.email.sendEmail || props.email.toEmail || '')
const absoluteTime = computed(() => (props.email.createTime ? formatDetailDate(props.email.createTime) : ''))
const hasAtt = computed(() => props.email.attList?.length > 0)
</script>

<template>
  <div
    role="option"
    :aria-selected="selected"
    :data-active="active || undefined"
    :data-unread="unread || undefined"
    :style="{height: `${height}px`}"
    :class="cn(
      'group flex w-full cursor-default items-center gap-2 rounded-md px-2 text-left transition-colors',
      'hover:bg-hover',
      active && 'bg-selected',
      selected && !active && 'bg-accent-subtle',
      context && 'bg-hover ring-1 ring-line-strong',
      props.class,
    )"
    @click="emit('open', email)"
    @contextmenu="emit('contextmenu', $event, email)"
  >
    <!-- 勾选：`@click.stop` 挡住整行的打开动作 -->
    <Checkbox
      :model-value="selected"
      :aria-label="selectLabel"
      size="sm"
      class="shrink-0"
      @click.stop
      @update:model-value="emit('toggle-select', email)"
    />

    <button
      v-if="showStar"
      type="button"
      :aria-label="starLabel"
      :aria-pressed="!!email.isStar"
      class="grid size-6 shrink-0 place-items-center rounded-sm text-fg-subtle transition-colors hover:text-warning-strong"
      @click.stop="emit('toggle-star', email)"
    >
      <IconStar :class="cn('size-4', email.isStar && 'fill-warning text-warning-strong')" aria-hidden="true" />
    </button>

    <Tooltip v-if="showStatus && email.statusIcon" :text="email.statusIcon.content">
      <span class="grid size-5 shrink-0 place-items-center">
        <span class="size-2 rounded-full" :style="{background: email.statusIcon.color}" aria-hidden="true" />
      </span>
    </Tooltip>

    <Tooltip v-if="email.isDel" :text="email.isDelContent">
      <IconMailX class="size-4 shrink-0 text-danger-fg" aria-hidden="true" />
    </Tooltip>

    <!-- 未读点：在头像前面，和加粗一起表达未读（§7.4 不用整行底色） -->
    <span
      v-if="unread"
      class="size-1.5 shrink-0 rounded-full bg-accent"
      aria-hidden="true"
    />

    <Avatar :name="sender" size="xs" class="shrink-0 max-sm:hidden" decorative />

    <span :class="cn('w-32 shrink-0 truncate text-body max-lg:w-24', unread ? 'text-body-strong text-fg' : 'text-fg-muted')">
      {{ sender }}
    </span>

    <span class="flex min-w-0 flex-1 items-baseline gap-2">
      <button
        v-if="email.code"
        type="button"
        class="shrink-0 rounded-xs bg-accent-subtle px-1 text-caption text-accent-subtle-fg"
        @click.stop="emit('copy-code', email.code)"
      >{{ codeLabel }}{{ email.code }}</button>

      <span :class="cn('shrink-0 truncate text-body', unread ? 'text-body-strong text-fg' : 'text-fg')">
        {{ email.subject || ZERO_WIDTH }}
      </span>

      <span v-if="showPreview" class="min-w-0 flex-1 truncate text-caption text-fg-muted">
        {{ email.formatText }}
      </span>
    </span>

    <IconPaperclip v-if="hasAtt" class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />

    <span
      :class="cn('w-16 shrink-0 text-right text-caption tabular-nums', unread ? 'text-fg' : 'text-fg-muted')"
      :title="absoluteTime"
    >{{ email.formatCreateTime }}</span>
  </div>
</template>
