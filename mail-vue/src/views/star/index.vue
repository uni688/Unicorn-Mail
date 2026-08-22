<script setup>
/**
 * 星标邮件（§7.4）
 *
 * 只有一处和其它列表不同：**在这里取消星标就等于把这一行拿走**（这个列表的定义就是
 * 「有星标的邮件」）。旧实现靠 `emailStore.starScroll` 这个跨组件 ref 互相调方法
 * （`views/email/index.vue:133`、`views/send/index.vue:66`）；现在改成两步：
 *   - 本视图用 `onStarCancel` 把行摘掉；
 *   - 顺手写一次 `emailStore.cancelStarEmailId`，收件箱/已发送列表里的同一封会跟着变灰
 *     （`useMailList` 的 `syncStore` 三个 watch 之一）。
 *
 * `starList` 的游标同样是「上一页最后一条的 emailId」，所以 `fetch` 的签名和收件箱一致。
 */
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {MailWorkspace} from '@/components/domain'
import {openCompose} from '@/composables/useComposer.js'
import {emailDelete} from '@/request/email.js'
import {starAdd, starCancel, starList} from '@/request/star.js'
import {useEmailStore} from '@/store/email.js'

defineOptions({name: 'star'})

const {t} = useI18n()
const emailStore = useEmailStore()

const workspace = ref(null)

function fetchList(cursor, size) {
    return starList(cursor, size)
}

/** 取消星标：本列表摘行 + 广播给其它列表 */
function onStarCancel(email) {
    emailStore.cancelStarEmailId = email.emailId
    workspace.value?.removeIds([email.emailId])
}
</script>

<template>
  <MailWorkspace
    ref="workspace"
    :fetch="fetchList"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :on-star-cancel="onStarCancel"
    :on-delete="emailDelete"
    :empty-title="t('mail.emptyStar')"
    :empty-description="t('mail.emptyStarHint')"
    @reply="openCompose('reply', {email: $event})"
    @forward="openCompose('forward', {email: $event})"
  />
</template>
