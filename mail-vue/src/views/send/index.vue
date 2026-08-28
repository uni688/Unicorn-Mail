<script setup>
/**
 * 已发送（§7.4）
 *
 * 和收件箱同一套壳，四点差别：
 *   `type=1`      `/email/list` 的发信侧
 *   `showStatus`  多一列发信状态点（已投递 / 退信 / 被投诉 / 延迟），`useMailList`
 *                 的 `decorate()` 已经把 `statusIcon` 算好了
 *   `showUnread`  发出去的邮件没有已读未读
 *   没有长轮询    新邮件只会出现在收件箱
 */
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {MailWorkspace} from '@/components/domain'
import {openCompose} from '@/composables/useComposer.js'
import {emailDelete, emailList} from '@/request/email.js'
import {starAdd, starCancel} from '@/request/star.js'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'

defineOptions({name: 'send'})

const {t} = useI18n()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const {prefs} = useMailPrefs()

const workspace = ref(null)

function fetchList(cursor, size, filters = {}) {
    const accountId = accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    return emailList(accountId, allReceive, cursor, prefs.timeSort, size, 1, filters)
}

function onStarCancel(email) {
    emailStore.cancelStarEmailId = email.emailId
}

function onStarAdd(email) {
    emailStore.addStarEmailId = email.emailId
}
</script>

<template>
  <MailWorkspace
    ref="workspace"
    :fetch="fetchList"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :on-star-add="onStarAdd"
    :on-star-cancel="onStarCancel"
    :on-delete="emailDelete"
    show-status
    :show-unread="false"
    :empty-title="t('mail.emptySent')"
    :empty-description="t('mail.emptySentHint')"
    @reply="openCompose('reply', {email: $event})"
    @forward="openCompose('forward', {email: $event})"
  />
</template>
