<script setup>
/**
 * MailComposer — 写信页（§7.7 + §1030「写信：全屏页而不是弹窗」）
 *
 * 取代 `layout/write/index.vue`（788 行的 `position: fixed` 浮层）。为什么换成整页：
 * 那个浮层在移动端几乎不能用（键盘一起来就只剩两行可见），而且它挂在 `layout` 里，
 * 靠 `uiStore.writerRef` 这个全局 ref 被四处调用 —— 谁都能在任何时候把它打开。
 *
 * ```
 * ┌ 顶部：← 返回 ····························· 存草稿 ⌘S  发送 ⌘↵ ┐
 * │ 发件人  me@uni.dev                                            │
 * │ 收件人  [tag] [tag] +                     最近联系人 ▾        │
 * │ 主题    ______________________________________________        │
 * ├ 正文（tiny-editor，沿用旧组件）                               │
 * ├ 附件：一行一个，带大小与删除                                  │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 *
 * 与旧实现的差别，除了「整页」以外都是**行为对齐而不是重写**：发送参数、进度、
 * 草稿落 Dexie、最近联系人（`writerStore.sendRecipientRecord`，上限 500）全部照搬，
 * 只把 Element Plus 的 `ElMessage / ElMessageBox / el-input-tag` 换成 L1 的
 * `toast / AlertDialog / TagsInput`（§10.1 的目标是把 EP 从主链路上摘掉）。
 *
 * 键盘：`⌘/Ctrl+Enter` 发送、`⌘/Ctrl+S` 存草稿（§7.1 写信作用域的两条）。
 */
import {computed, onMounted, onUnmounted, reactive, ref, toRaw} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import dayjs from 'dayjs'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconPaperclip from '~icons/lucide/paperclip'
import IconX from '~icons/lucide/x'
import IconSend from '~icons/lucide/send'
import IconUsers from '~icons/lucide/users'
import {AlertDialog, Button, DropdownMenu, Input, Kbd, MenuItem, Progress, TagsInput, Tooltip} from '@/components/ui'
import TinyEditor from '@/components/tiny-editor/index.vue'
import {emailSend} from '@/request/email.js'
import {useAccountStore} from '@/store/account.js'
import {useUserStore} from '@/store/user.js'
import {useSettingStore} from '@/store/setting.js'
import {useWriterStore} from '@/store/writer.js'
import {userDraftStore} from '@/store/draft.js'
import {useComposer} from '@/composables/useComposer.js'
import {useCounts} from '@/composables/useCounts.js'
import {toast} from '@/components/ui/Toast/toast.js'
import {fileToBase64, formatBytes} from '@/utils/file-utils.js'
import {isEmail} from '@/utils/verify-utils.js'
import {formatDetailDate} from '@/utils/day.js'
import {toOssDomain} from '@/utils/convert.js'
import db from '@/db/db.js'

const {t} = useI18n()
const router = useRouter()
const accountStore = useAccountStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const writerStore = useWriterStore()
const draftStore = userDraftStore()
const {takePrefill} = useComposer()
const {refresh: refreshCounts} = useCounts()

const editor = ref(null)
const defValue = ref('')
const sending = ref(false)
const percent = ref(0)
const discardOpen = ref(false)

const form = reactive({
    sendEmail: '',
    accountId: -1,
    name: '',
    receiveEmail: [],
    subject: '',
    content: '',
    text: '',
    sendType: '',
    emailId: 0,
    attachments: [],
    draftId: null,
})

/** 最近联系人（持久化在 writerStore，上限 500）；只在下拉里出现，不做输入联想 */
const contacts = computed(() => writerStore.sendRecipientRecord.slice(0, 20))

const sendLabel = computed(() => {
    if (form.sendType === 'reply') return t('reply')
    if (form.sendType === 'forward') return t('forward')
    return t('send')
})

/* --------------------------------------------------------------- 预填 */

/** 正文里的内嵌图是 `{{domain}}/…`，引用原文前换成真实 R2 域名（旧实现 formatImage） */
function withDomain(content) {
    return String(content ?? '').replace(/{{domain}}/g, `${toOssDomain(settingStore.settings?.r2Domain)}/`)
}

function quoted(email) {
    const body = withDomain(email.content)
        || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text ?? ''}</pre>`
    return `<div><br></div><div>${formatDetailDate(email.createTime)} ${email.name ?? ''} &lt;${email.sendEmail ?? ''}&gt; ${t('wrote')}:</div>`
        + '<blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">'
        + `${body}</blockquote>`
}

const RE_PREFIX = ['re:', 're：', '回复：', '回复:']

function applyPrefill(prefill) {

    if (!prefill) return

    const {mode, email, draft} = prefill

    if (mode === 'draft' && draft) {
        Object.assign(form, {...draft})
        defValue.value = draft.content ?? ''
        return
    }

    if (!email) return

    const subject = email.subject ?? ''

    if (mode === 'reply') {
        form.receiveEmail = [email.sendEmail].filter(Boolean)
        form.subject = RE_PREFIX.some((p) => subject.toLowerCase().startsWith(p)) ? subject : `Re: ${subject}`
        form.sendType = 'reply'
        form.emailId = email.emailId
        defValue.value = quoted(email)
        return
    }

    if (mode === 'forward') {
        form.subject = subject.toLowerCase().startsWith('fwd:') ? subject : `Fwd: ${subject}`
        form.sendType = 'forward'
        defValue.value = withDomain(email.content) || `<pre>${email.text ?? ''}</pre>`
    }
}

/** 发件人 = 当前邮箱，没选过就用账号自己的邮箱（与旧实现 `open()` 同一套判断） */
function fillSender() {
    if (accountStore.currentAccount?.email) {
        form.sendEmail = accountStore.currentAccount.email
        form.accountId = accountStore.currentAccount.accountId
        form.name = accountStore.currentAccount.name
        return
    }
    form.sendEmail = userStore.user?.email ?? ''
    form.accountId = userStore.user?.account?.accountId ?? -1
    form.name = userStore.user?.name ?? ''
}

/* --------------------------------------------------------------- 收件人 */

function onRecipients(list) {
    // TagsInput 会按逗号拆，这里只做「是不是邮箱」的过滤与去重
    const seen = new Set()
    form.receiveEmail = list
        .map((item) => String(item).trim())
        .filter((item) => {
            if (!isEmail(item) || seen.has(item)) return false
            seen.add(item)
            return true
        })
    if (list.length !== form.receiveEmail.length) toast.error(t('notEmailMsg'))
}

function addContact(email) {
    if (form.receiveEmail.includes(email)) return
    form.receiveEmail = [...form.receiveEmail, email]
}

/* ---------------------------------------------------------------- 附件 */

function chooseFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (event) => {
        for (const file of event.target.files) {
            form.attachments.push({
                content: await fileToBase64(file),
                filename: file.name,
                size: file.size,
                contentType: file.type,
            })
        }
    }
    input.click()
}

function removeAtt(index) {
    form.attachments.splice(index, 1)
}

/* ---------------------------------------------------------------- 发送 */

function syncContent() {
    const html = editor.value?.getContent?.() ?? ''
    if (html) form.content = html
    return form.content
}

function validate() {
    if (form.receiveEmail.length === 0) return t('emptyRecipientMsg')
    if (!form.subject) return t('emptySubjectMsg')
    if (!syncContent()) return t('emptyContentMsg')
    return null
}

async function send() {

    if (sending.value) return

    const problem = validate()

    if (problem) {
        toast.error(problem)
        return
    }

    sending.value = true
    percent.value = 0

    try {
        const list = await emailSend({...toRaw(form)}, (event) => {
            percent.value = Math.round((event.loaded * 98) / event.total)
        })
        rememberRecipients()
        userStore.refreshUserInfo?.()
        refreshCounts({force: true})
        // 草稿发出去就不该留在草稿箱里
        if (form.draftId) await dropDraft(form.draftId)
        toast.success(t('sendSuccessMsg'), {description: list?.[0]?.subject ?? form.subject})
        leave({force: true})
    } catch (e) {
        toast.error(t('sendFailMsg'), {description: e?.message})
    } finally {
        sending.value = false
        percent.value = 0
    }
}

function rememberRecipients() {
    const rest = writerStore.sendRecipientRecord.filter((email) => !form.receiveEmail.includes(email))
    writerStore.sendRecipientRecord = [...form.receiveEmail, ...rest].slice(0, 500)
}

/* ---------------------------------------------------------------- 草稿 */

const dirty = computed(() => !!(form.subject || form.receiveEmail.length || form.content))

async function dropDraft(draftId) {
    await db.value.draft.delete(draftId)
    await db.value.att.where({draftId}).delete()
    draftStore.refreshList++
}

/** 存草稿：Dexie 一张 draft 表 + 一张 att 表（附件不进主表，旧实现如此） */
async function writeDraft({silent = false} = {}) {

    syncContent()

    if (!dirty.value) return false

    const record = {...toRaw(form)}
    delete record.draftId
    delete record.attachments
    record.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss')

    if (form.draftId) {
        await db.value.draft.update(form.draftId, record)
        await db.value.att.where({draftId: form.draftId}).delete()
        await db.value.att.add({draftId: form.draftId, attachments: toRaw(form.attachments)})
    } else {
        const draftId = await db.value.draft.add(record)
        await db.value.att.add({draftId, attachments: toRaw(form.attachments)})
        form.draftId = draftId
    }

    draftStore.refreshList++
    if (!silent) toast.success(t('mail.draftSaved'))
    return true
}

/**
 * 存草稿是**串行**的：`form.draftId` 只在 `draft.add()` 落库之后才有值，两次
 * ⌘S 挨着按（或者「离开时存草稿」赶上一次自动保存）就会各自看到 `draftId == null`，
 * 于是同一封草稿进了两行。排成一条链之后第二次必然看到第一次写下的 id，走 update。
 */
let draftChain = Promise.resolve()

function saveDraft(options) {
    draftChain = draftChain
        .catch(() => {})
        .then(() => writeDraft(options))
    return draftChain
}

/* ------------------------------------------------------------ 离开页面 */

function leave({force = false} = {}) {
    if (!force && dirty.value) {
        discardOpen.value = true
        return
    }
    router.back()
}

async function discard() {
    discardOpen.value = false
    if (form.draftId) await dropDraft(form.draftId)
    router.back()
}

async function keepAsDraft() {
    discardOpen.value = false
    await saveDraft({silent: true})
    toast.success(t('mail.draftSaved'))
    router.back()
}

/* ------------------------------------------------------------------ 键盘 */

function onKeydown(event) {
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    if (event.key === 'Enter') {
        event.preventDefault()
        send()
    }
    if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveDraft()
    }
}

onMounted(() => {
    fillSender()
    applyPrefill(takePrefill())
    window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
})

function onEditorChange(content, text) {
    form.content = content
    form.text = text
}

/**
 * 只给测试用：`<script setup>` 默认什么都不暴露，而这一页的三条不变量
 * （预填、收件人过滤、串行存草稿）都在脚本里，从 DOM 断言反而绕远。
 */
defineExpose({form, defValue, onRecipients, saveDraft, dirty})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <!-- 顶部动作条 -->
    <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
      <Button variant="ghost" size="icon-sm" :label="t('mail.back')" @click="leave()">
        <IconArrowLeft class="size-4" />
      </Button>
      <h1 class="text-title-sm text-fg">{{ sendLabel }}</h1>

      <div class="ml-auto flex items-center gap-2">
        <Tooltip :text="`${t('mail.saveDraft')} ⌘S`">
          <Button variant="ghost" size="sm" :disabled="!dirty" @click="saveDraft()">
            {{ t('mail.saveDraft') }}
          </Button>
        </Tooltip>
        <Button variant="primary" size="sm" :loading="sending" @click="send">
          <template #icon><IconSend class="size-4" /></template>
          {{ sendLabel }}
          <Kbd class="ml-1 max-sm:hidden">⌘↵</Kbd>
        </Button>
      </div>
    </div>

    <Progress v-if="sending" :model-value="percent" class="h-0.5 shrink-0 rounded-none" :label="t('sending')" />

    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <!-- 发件人（当前邮箱；改发件人 = 切邮箱，走侧栏 Picker） -->
      <div class="flex items-center gap-2 text-caption text-fg-muted">
        <span class="w-14 shrink-0">{{ t('sender') }}</span>
        <span class="truncate text-body text-fg">{{ form.sendEmail }}</span>
      </div>

      <!-- 收件人 -->
      <div class="flex items-start gap-2">
        <span class="mt-2 w-14 shrink-0 text-caption text-fg-muted">{{ t('recipient') }}</span>
        <TagsInput
          :model-value="form.receiveEmail"
          :aria-label="t('recipient')"
          :placeholder="t('mail.recipientPlaceholder')"
          clearable
          class="min-w-0 flex-1"
          @update:model-value="onRecipients"
        />
        <DropdownMenu v-if="contacts.length" align="end">
          <template #trigger>
            <Button variant="ghost" size="icon-sm" :label="t('recentContacts')">
              <IconUsers class="size-4" />
            </Button>
          </template>
          <MenuItem
            v-for="email in contacts"
            :key="email"
            :text-value="email"
            @select="addContact(email)"
          >
            {{ email }}
          </MenuItem>
        </DropdownMenu>
      </div>

      <!-- 主题 -->
      <div class="flex items-center gap-2">
        <span class="w-14 shrink-0 text-caption text-fg-muted">{{ t('subject') }}</span>
        <Input
          v-model="form.subject"
          :placeholder="t('subjectInputDesc')"
          :aria-label="t('subject')"
          class="min-w-0 flex-1"
        />
      </div>

      <!-- 正文：沿用旧的 tiny-editor（换编辑器不属于 P3 的范围） -->
      <div class="min-h-64 flex-1 overflow-hidden rounded-lg border border-line">
        <TinyEditor ref="editor" :def-value="defValue" @change="onEditorChange" />
      </div>

      <!-- 附件 -->
      <div class="shrink-0">
        <Button variant="secondary" size="sm" @click="chooseFile">
          <template #icon><IconPaperclip class="size-4" /></template>
          {{ t('mail.addAttachment') }}
        </Button>

        <ul v-if="form.attachments.length" class="mt-2 grid gap-1.5">
          <li
            v-for="(att, index) in form.attachments"
            :key="`${att.filename}:${index}`"
            class="flex items-center gap-2 rounded-md border border-line px-2 py-1.5"
          >
            <IconPaperclip class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-body text-fg">{{ att.filename }}</span>
            <span class="shrink-0 text-caption tabular-nums text-fg-muted">{{ formatBytes(att.size) }}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              :label="`${t('delete')} ${att.filename}`"
              @click="removeAtt(index)"
            >
              <IconX class="size-4" />
            </Button>
          </li>
        </ul>
      </div>
    </div>

    <!-- 离开时的三选一：存草稿 / 丢弃 / 取消（§7.7 破坏性操作必须确认） -->
    <AlertDialog
      v-model:open="discardOpen"
      :title="t('saveDraftConfirm')"
      :confirm-text="t('mail.saveDraft')"
      :cancel-text="t('cancel')"
      @confirm="keepAsDraft"
    >
      <!-- 第三个出口：不存草稿直接丢。AlertDialog 只有确认/取消两个按钮，
           所以「丢弃」放在正文里，且用 danger 前景色标出破坏性 -->
      <Button variant="ghost" size="sm" class="text-danger-fg" @click="discard">
        {{ t('mail.discardDraft') }}
      </Button>
    </AlertDialog>
  </div>
</template>
