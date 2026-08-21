<script setup>
/**
 * MailReader — 阅读窗格（§7.5 三栏的第三栏 / §7.6 正文安全）
 *
 * ```
 * ┌ 头部：主题 ─────────────────────────── ★ 未读 删除 回复 转发 ┐
 * │ 发件人 <地址> · 收件人 · 绝对时间                             │
 * │ [已屏蔽 3 张图片 · 显示图片]  ← 只在真的拦到东西时出现          │
 * ├ 正文（Shadow DOM，固定浅色，不做暗色反转）                    │
 * ├ 附件：图标 名称 大小 下载                                     │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 *
 * 与旧 `views/content/index.vue`（428 行）的差别：
 * 1. **正文先净化再渲染**。旧实现把 `email.content` 直接 `innerHTML` 进 shadow root，
 *    内联事件处理器与 iframe 照样生效（见 `utils/mail-sanitize.js` 开头那段）。
 * 2. **默认屏蔽远程图片**，本站 R2 域名例外（内嵌图就在那儿）。放行分两级：
 *    这一封（本地 ref）和以后都放行（`useMailPrefs().showImages`）。
 * 3. **它是一个窗格而不是一个页面**：不读路由、不写 store，父视图给 `email`、
 *    接事件。`/mail/:folder/:emailId` 的深链解析属于视图的事。
 * 4. 图片预览用 `<a target=_blank>` 而不是 `el-image-viewer` —— 少一个 Element Plus 依赖，
 *    浏览器自带的看图能力已经够用（§10.1 的目标是把 EP 从主链路上摘掉）。
 */
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import IconStar from '~icons/lucide/star'
import IconTrash from '~icons/lucide/trash-2'
import IconMailOpen from '~icons/lucide/mail-open'
import IconReply from '~icons/lucide/reply'
import IconForward from '~icons/lucide/forward'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconPaperclip from '~icons/lucide/paperclip'
import IconDownload from '~icons/lucide/download'
import IconImageOff from '~icons/lucide/image-off'
import IconMailSearch from '~icons/lucide/mail-search'
import {Avatar, Button, Tooltip} from '@/components/ui'
import {EmptyState} from '@/components/composite'
import MailBody from './MailBody.vue'
import {sanitizeEmailHtml} from '@/utils/mail-sanitize.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'
import {useSettingStore} from '@/store/setting.js'
import {formatDetailDate} from '@/utils/day.js'
import {formatBytes, getExtName} from '@/utils/file-utils.js'
import {cvtR2Url, toOssDomain} from '@/utils/convert.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** null = 还没选邮件，画空状态 @type {Object|null} */
    email: {type: Object, default: null},
    showStar: {type: Boolean, default: true},
    showUnread: {type: Boolean, default: true},
    showReply: {type: Boolean, default: true},
    canDelete: {type: Boolean, default: true},
    /** 回收站：删除换成「还原 / 彻底删除」 */
    trashMode: {type: Boolean, default: false},
    /** 窄屏整页打开时显示返回箭头 */
    showBack: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['back', 'delete', 'restore', 'purge', 'star', 'unstar', 'unread', 'reply', 'forward'])

const {t} = useI18n()
const settingStore = useSettingStore()
const {prefs, setShowImages} = useMailPrefs()

/** 「这一封先放行」——换邮件就归零，不然下一封会继承上一封的决定 */
const allowOnce = ref(false)

watch(() => props.email?.emailId, () => {
    allowOnce.value = false
})

const allowRemote = computed(() => allowOnce.value || prefs.showImages)

/** 邮件正文里的内嵌图写成 `{{domain}}/…`，渲染前换成真实 R2 域名（旧实现 `formatImage`） */
const r2Origin = computed(() => toOssDomain(settingStore.settings?.r2Domain))

const rendered = computed(() => {
    const email = props.email
    if (!email?.content) return {html: '', blocked: 0}
    const html = String(email.content).replace(/{{domain}}/g, `${r2Origin.value}/`)
    return sanitizeEmailHtml(html, {
        allowRemote: allowRemote.value,
        trustedOrigins: r2Origin.value ? [r2Origin.value] : [],
    })
})

const sender = computed(() => props.email?.name || props.email?.sendEmail || '')

const recipients = computed(() => {
    const raw = props.email?.recipient
    if (!raw) return props.email?.toEmail ?? ''
    try {
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw
        return list.map((item) => item.address).join(', ')
    } catch {
        // 旧数据里 recipient 不一定是 JSON，解析失败就原样显示，总比空着好
        return String(raw)
    }
})

const attachments = computed(() => (props.email?.attList ?? []).map((att) => ({
    ...att,
    url: cvtR2Url(att.key),
    sizeText: att.size ? formatBytes(att.size) : '',
    isImage: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'jfif', 'webp', 'avif'].includes(getExtName(att.filename ?? '')),
})))

/** 发信失败 / 投诉 / 延迟：状态提示条（旧实现的三个 el-alert） */
const notice = computed(() => {
    const status = props.email?.status
    if (status === 3) return {tone: 'danger', text: props.email.message || t('bounced')}
    if (status === 4) return {tone: 'warning', text: t('complained')}
    if (status === 5) return {tone: 'warning', text: t('delayed')}
    return null
})

const unread = computed(() => props.email?.unread === EmailUnreadEnum.UNREAD)
</script>

<template>
  <div :class="cn('flex h-full min-h-0 flex-col', props.class)">
    <EmptyState
      v-if="!email"
      :icon="IconMailSearch"
      :title="t('mail.noSelection')"
      :description="t('mail.noSelectionHint')"
    />

    <template v-else>
      <!-- 头部动作条 -->
      <div class="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <Button
          v-if="showBack"
          variant="ghost"
          size="icon-sm"
          :label="t('mail.back')"
          @click="emit('back')"
        >
          <IconArrowLeft class="size-4" />
        </Button>

        <Tooltip v-if="showStar" :text="email.isStar ? t('mail.unstar') : t('mail.star')">
          <Button
            variant="ghost"
            size="icon-sm"
            :label="email.isStar ? t('mail.unstar') : t('mail.star')"
            :aria-pressed="!!email.isStar"
            @click="emit(email.isStar ? 'unstar' : 'star', email)"
          >
            <IconStar :class="cn('size-4', email.isStar && 'fill-warning text-warning-strong')" />
          </Button>
        </Tooltip>

        <Tooltip v-if="showUnread" :text="unread ? t('mail.markRead') : t('mail.markUnread')">
          <Button
            variant="ghost"
            size="icon-sm"
            :label="unread ? t('mail.markRead') : t('mail.markUnread')"
            @click="emit('unread', email)"
          >
            <IconMailOpen class="size-4" />
          </Button>
        </Tooltip>

        <template v-if="canDelete">
          <template v-if="trashMode">
            <Button variant="ghost" size="sm" @click="emit('restore', email)">{{ t('mail.restore') }}</Button>
            <Button variant="ghost" size="sm" class="text-danger-fg" @click="emit('purge', email)">
              {{ t('mail.purge') }}
            </Button>
          </template>
          <Tooltip v-else :text="t('mail.moveToTrash')">
            <Button variant="ghost" size="icon-sm" :label="t('mail.moveToTrash')" @click="emit('delete', email)">
              <IconTrash class="size-4" />
            </Button>
          </Tooltip>
        </template>

        <template v-if="showReply">
          <Tooltip :text="t('mail.reply')">
            <Button variant="ghost" size="icon-sm" :label="t('mail.reply')" @click="emit('reply', email)">
              <IconReply class="size-4" />
            </Button>
          </Tooltip>
          <Tooltip :text="t('mail.forward')">
            <Button variant="ghost" size="icon-sm" :label="t('mail.forward')" @click="emit('forward', email)">
              <IconForward class="size-4" />
            </Button>
          </Tooltip>
        </template>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <!-- 信头 -->
        <div class="grid gap-2 px-4 py-3">
          <h2 class="text-title-sm text-fg">{{ email.subject || t('mail.noSubject') }}</h2>

          <div class="flex items-start gap-2">
            <Avatar :name="sender" size="sm" decorative />
            <div class="min-w-0 flex-1 text-caption">
              <p class="truncate text-body text-fg">
                {{ email.name || email.sendEmail }}
                <span v-if="email.name" class="text-fg-muted">&lt;{{ email.sendEmail }}&gt;</span>
              </p>
              <p class="truncate text-fg-muted">
                {{ t('recipient') }}: {{ recipients }}
              </p>
            </div>
            <time
              v-if="email.createTime"
              class="shrink-0 text-caption text-fg-muted"
            >{{ formatDetailDate(email.createTime) }}</time>
          </div>

          <p
            v-if="notice"
            :class="cn(
              'rounded-md px-2 py-1.5 text-caption',
              notice.tone === 'danger' ? 'bg-danger-subtle text-danger-fg' : 'bg-warning-subtle text-warning-fg',
            )"
          >
            {{ notice.text }}
          </p>

          <!-- 远程图片横幅：只在真的拦到东西时出现（§7.6） -->
          <div
            v-if="rendered.blocked > 0"
            class="flex flex-wrap items-center gap-2 rounded-md border border-line bg-inset px-2 py-1.5"
          >
            <IconImageOff class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span class="text-caption text-fg-muted">
              {{ t('mail.imagesBlocked', {n: rendered.blocked}) }}
            </span>
            <Button variant="ghost" size="sm" class="ml-auto" @click="allowOnce = true">
              {{ t('mail.showImagesOnce') }}
            </Button>
            <Button variant="ghost" size="sm" @click="setShowImages(true)">
              {{ t('mail.showImagesAlways') }}
            </Button>
          </div>
        </div>

        <!-- 正文：HTML 走 Shadow DOM，纯文本走 pre -->
        <div class="px-4 pb-4">
          <MailBody
            v-if="rendered.html"
            :html="rendered.html"
            class="overflow-hidden rounded-lg border border-line"
          />
          <pre
            v-else
            class="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-4 text-body text-fg"
          >{{ email.text }}</pre>
        </div>

        <!-- 附件 -->
        <div v-if="attachments.length" class="border-t border-line px-4 py-3">
          <p class="mb-2 flex items-center gap-1.5 text-caption text-fg-muted">
            <IconPaperclip class="size-4" aria-hidden="true" />
            {{ t('attachments') }} · {{ t('attCount', {total: attachments.length}) }}
          </p>
          <ul class="grid gap-1.5">
            <li
              v-for="att in attachments"
              :key="att.attId ?? att.key"
              class="flex items-center gap-2 rounded-md border border-line px-2 py-1.5"
            >
              <IconPaperclip class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <a
                :href="att.url"
                target="_blank"
                rel="noopener noreferrer"
                class="min-w-0 flex-1 truncate text-body text-fg hover:underline"
              >{{ att.filename }}</a>
              <span class="shrink-0 text-caption tabular-nums text-fg-muted">{{ att.sizeText }}</span>
              <a
                :href="att.url"
                download
                :aria-label="`${t('mail.download')} ${att.filename}`"
                class="grid size-7 shrink-0 place-items-center rounded-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              >
                <IconDownload class="size-4" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
