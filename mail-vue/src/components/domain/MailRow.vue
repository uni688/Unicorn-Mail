<script setup>
/**
 * MailRow — 列表里的一封邮件（§5.3.3 的 `MailRow` 线框 + §7.4 的密度）
 *
 * ```
 * [☐] [☆]  Stripe                                          14:02
 *          ● 您的验证码是 812394        [验证码 812394 ⧉]
 *          Your verification code for signing in to…    📎 2
 * ```
 *
 * 这是**多行网格**而不是一条横排（审计「邮箱列表和文档设计不符」）：
 * `20px 20px 1fr` 三列 —— 勾选、星标、内容；内容列里再叠 2~3 行文字。
 * 横排版式在 380px 宽的列表列里必然把主题挤成三个字（发件人 128px + 时间 64px +
 * 图标之后只剩不到 150px），而这一列的宽度是 §5.1 定死的。
 *
 * 行数跟着密度走（§7.4 紧凑 44 / 标准 56 / 舒适 72）：
 *   - 2 行（44 / 56）：发件人+时间 / 主题+验证码
 *   - 3 行（≥68）：再加一行摘要（`line-clamp: 1`，`fg-muted`）
 * 三行的高度是 20+20+16=56px，塞不进 56px 档，所以摘要行按**高度**开关，
 * 而不是按「调用方传了 showPreview」—— 传了也放不下。
 *
 * 与旧 `email-scroll` 行的差别，都是刻意的：
 * 1. **不写邮件对象**。旧行把 `checked` / `rightChecked` 塞进邮件里（`:49`、`:1153`），
 *    于是同一封邮件在列表、星标、阅读窗格之间串台。这里选中态来自 `useSelection`，
 *    右键高亮来自 `context` prop，邮件对象只读。
 * 2. **一行一个可聚焦目标**。整行是 `<div role="option">`（列表是 `role="listbox"`），
 *    键盘用 ↑/↓ 移动，`x` 勾选，Space 打开 —— 旧行是 div + click，Tab 根本进不来。
 * 3. **未读 = 6px 圆点（前置于主题）+ `body-strong`**，不是整行底色：§5.3.3 明确
 *    「不改字重以外的任何几何」，底色留给选中态，两者叠在一起谁都看不清。
 * 4. **星标 hover 才出现**（§5.3.3）：已加星的常显实心 `accent`，没加星的靠 opacity
 *    藏起来而不是 `v-if` —— 键盘和读屏仍要能到达它。
 * 5. 状态点只在发信视图出现（`showStatus`），`isDel` 的「已删除」标记同理。
 *
 * 「全部邮箱」聚合态（§5.3.3 v1.2）：时间左侧多一枚收件邮箱 Chip，截断到 12 字符、
 * Tooltip 给全称。单邮箱视图里每行都写同一个地址是纯噪音，所以由 `showMailbox` 控制。
 *
 * 时间显示 `formatCreateTime`（相对时间，由 `useMailList` 每分钟刷新），
 * `title` 给绝对时间 —— 相对时间好读，但「到底几点」必须查得到。
 */
import {computed} from 'vue'
import IconPaperclip from '~icons/lucide/paperclip'
import IconStar from '~icons/lucide/star'
import IconMailX from '~icons/lucide/mail-x'
import IconCopy from '~icons/lucide/copy'
import {Badge, Checkbox, Tooltip} from '@/components/ui'
import {formatDetailDate} from '@/utils/day.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'
import {cn} from '@/utils/cn.js'

/** 空主题也要占住一行的高度（旧实现直接写了个零宽字符，这里给它一个名字） */
const ZERO_WIDTH = String.fromCharCode(0x200B)

/** 收件邮箱 Chip 的截断长度（§5.3.3：截断到 12 字符，Tooltip 全称） */
const MAILBOX_MAX = 12

/** 发信邮件（`type=1`）的「自己那一头」是 sendEmail，收信邮件是 toEmail */
const TYPE_SEND = 1

/** 三行 56px 放不进 56px 档，所以摘要行的门槛是高度而不是密度名 */
const THREE_LINE_MIN = 68

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
    /** 摘要行；还要求高度够（见 THREE_LINE_MIN） */
    showPreview: {type: Boolean, default: true},
    /** 「全部邮箱」聚合态：时间左侧显示这封邮件落在哪个邮箱 */
    showMailbox: {type: Boolean, default: false},
    codeLabel: {type: String, default: ''},
    starLabel: {type: String, default: ''},
    selectLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['open', 'toggle-select', 'toggle-star', 'copy-code', 'contextmenu'])

const unread = computed(() => props.showUnread && props.email.unread === EmailUnreadEnum.UNREAD)
const sender = computed(() => props.email.name || props.email.sendEmail || props.email.toEmail || '')
const absoluteTime = computed(() => (props.email.createTime ? formatDetailDate(props.email.createTime) : ''))
const attCount = computed(() => props.email.attList?.length ?? 0)

const mailbox = computed(() => String(
    (Number(props.email.type) === TYPE_SEND ? props.email.sendEmail : props.email.toEmail) ?? '',
))

const mailboxShort = computed(() => (mailbox.value.length > MAILBOX_MAX
    ? `${mailbox.value.slice(0, MAILBOX_MAX)}…`
    : mailbox.value))

const threeLine = computed(() => props.showPreview && props.height >= THREE_LINE_MIN)

/** 内容块 20+20(+16)；剩下的高度上下对半分，行文字才在自己那一档里居中 */
const padY = computed(() => Math.max(0, Math.round((props.height - (threeLine.value ? 56 : 40)) / 2)))
</script>

<template>
  <div
    role="option"
    :aria-selected="selected"
    :data-active="active || undefined"
    :data-unread="unread || undefined"
    :style="{height: `${height}px`, paddingTop: `${padY}px`, paddingBottom: `${padY}px`}"
    :class="cn(
      'group grid w-full cursor-default grid-cols-[20px_20px_minmax(0,1fr)] items-start gap-x-2',
      'overflow-hidden rounded-md px-2 text-left transition-colors hover:bg-hover',
      active && 'bg-selected',
      selected && !active && 'bg-accent-subtle',
      context && 'bg-hover ring-1 ring-line-strong',
      props.class,
    )"
    @click="emit('open', email)"
    @contextmenu="emit('contextmenu', $event, email)"
  >
    <!-- 第一列：勾选。`@click.stop` 挡住整行的打开动作 -->
    <Checkbox
      :model-value="selected"
      :aria-label="selectLabel"
      size="sm"
      class="mt-0.5 justify-self-center"
      @click.stop
      @update:model-value="emit('toggle-select', email)"
    />

    <!-- 第二列：星标。没加星时只是透明，不是 v-if —— 键盘和读屏仍要能到 -->
    <button
      v-if="showStar"
      type="button"
      :aria-label="starLabel"
      :aria-pressed="!!email.isStar"
      :class="cn(
        'grid size-5 place-items-center rounded-sm transition-opacity',
        email.isStar
          ? 'text-accent opacity-100'
          : 'text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 focus-visible:opacity-100',
      )"
      @click.stop="emit('toggle-star', email)"
    >
      <IconStar :class="cn('size-4', email.isStar && 'fill-accent')" aria-hidden="true" />
    </button>
    <span v-else aria-hidden="true" />

    <!-- 第三列：内容。2~3 行，每行自己一个高度档，min-w-0 让 truncate 生效 -->
    <div class="col-start-3 min-w-0">
      <!-- 第一行：状态 · 发件人 ······ 收件邮箱 Chip · 时间 -->
      <div class="flex h-5 items-center gap-1.5">
        <Tooltip v-if="showStatus && email.statusIcon" :text="email.statusIcon.content">
          <span class="grid size-4 shrink-0 place-items-center">
            <span class="size-2 rounded-full" :style="{background: email.statusIcon.color}" aria-hidden="true" />
          </span>
        </Tooltip>

        <Tooltip v-if="email.isDel" :text="email.isDelContent">
          <IconMailX class="size-4 shrink-0 text-danger-fg" aria-hidden="true" />
        </Tooltip>

        <span :class="cn('min-w-0 flex-1 truncate', unread ? 'text-body-strong text-fg' : 'text-body text-fg')">
          {{ sender }}
        </span>

        <Tooltip v-if="showMailbox && mailbox" :text="mailbox">
          <Badge tone="neutral" appearance="subtle" size="sm" class="max-w-28 shrink-0 truncate text-micro">
            {{ mailboxShort }}
          </Badge>
        </Tooltip>

        <span
          :class="cn('shrink-0 text-caption tabular-nums', unread ? 'text-fg' : 'text-fg-muted')"
          :title="absoluteTime"
        >{{ email.formatCreateTime }}</span>
      </div>

      <!-- 第二行：未读点 · 主题 ······ 验证码 Badge -->
      <div class="flex h-5 items-center gap-1.5">
        <span v-if="unread" class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />

        <span :class="cn('min-w-0 flex-1 truncate', unread ? 'text-body-strong text-fg' : 'text-body text-fg')">
          {{ email.subject || ZERO_WIDTH }}
        </span>

        <Badge
          v-if="email.code"
          as="button"
          tone="accent"
          appearance="subtle"
          size="sm"
          class="shrink-0 cursor-pointer gap-1 tabular-nums"
          @click.stop="emit('copy-code', email.code)"
        >
          {{ codeLabel }}{{ email.code }}
          <IconCopy class="size-3 shrink-0" aria-hidden="true" />
        </Badge>

        <span
          v-if="!threeLine && attCount"
          class="flex shrink-0 items-center gap-0.5 text-caption text-fg-muted"
        >
          <IconPaperclip class="size-3.5" aria-hidden="true" />{{ attCount }}
        </span>
      </div>

      <!-- 第三行：摘要 ······ 附件数 -->
      <div v-if="threeLine" class="flex h-4 items-center gap-1.5">
        <span class="min-w-0 flex-1 truncate text-caption text-fg-muted">{{ email.formatText }}</span>
        <span v-if="attCount" class="flex shrink-0 items-center gap-0.5 text-caption text-fg-muted">
          <IconPaperclip class="size-3.5" aria-hidden="true" />{{ attCount }}
        </span>
      </div>
    </div>
  </div>
</template>
