<script setup>
/**
 * 回收站（§5.1 侧栏第五项 / §10.5 增量 2）
 *
 * P2 时这个视图不存在（后端没有 `GET /email/trash`），侧栏也刻意不占位。现在三条接口
 * 都有了：列表 `emailTrashList`、还原 `emailRestore`、彻底删除 `emailPurge`。
 *
 * 与其它三个邮件视图的差别，全部由 `MailWorkspace` 的 prop 表达：
 *   `trashMode`  动作换成「还原 / 彻底删除」（列表表头与阅读窗格同时生效）
 *   `showStar`   回收站里不给星标 —— 星标是「待办」，已删除的邮件不该进待办
 *   `showUnread` 同理，不再谈已读未读
 *   `showReply`  回收站里不回复；真要回复先还原
 *
 * 「清空回收站」单独放在顶部一行：它是唯一一个**不需要选中**的破坏性动作，
 * 混进表头的批量动作里太容易误触。二次确认走 `AlertDialog`（§7.7 破坏性操作必须确认）。
 */
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import IconTrash from '~icons/lucide/trash-2'
import {AlertDialog, Button} from '@/components/ui'
import {MailWorkspace} from '@/components/domain'
import {emailPurge, emailPurgeAll, emailRestore, emailTrashList} from '@/request/email.js'
import {useAccountStore} from '@/store/account.js'
import {useCounts} from '@/composables/useCounts.js'
import {hasPerm} from '@/perm/perm.js'

defineOptions({name: 'trash'})

const {t} = useI18n()
const accountStore = useAccountStore()
const {refresh: refreshCounts} = useCounts()

const workspace = ref(null)
const confirmOpen = ref(false)
const purging = ref(false)

function fetchList(cursor, size) {
    const accountId = accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    // **不传 type**：删掉的已发送邮件同样在回收站里（后端 `trashList` 与 `counts.trash`
    // 都不按 type 过滤）。传 0 会让列表比侧栏角标少几封 —— §10.5 要求两者必须一致。
    return emailTrashList(accountId, allReceive, cursor, size)
}

/**
 * 清空整个回收站。走**专用**的 `all=1` 接口而不是「不传 id 的 emailPurge」：
 * 后者的语义现在是「什么都不做」，全量物理删除必须显式说出口（审计 P1-2）。
 */
function purgeAll() {
    purging.value = true
    emailPurgeAll()
        .then(() => {
            confirmOpen.value = false
            workspace.value?.refresh()
            refreshCounts({force: true})
        })
        .finally(() => {
            purging.value = false
        })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="hasPerm('email:delete')" class="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
      <span class="text-caption text-fg-muted">{{ t('mail.trashRetention') }}</span>
      <Button variant="ghost" size="sm" class="ml-auto text-danger-fg" @click="confirmOpen = true">
        <IconTrash class="size-4" />
        {{ t('mail.emptyTrashAction') }}
      </Button>
    </div>

    <MailWorkspace
      ref="workspace"
      class="min-h-0 flex-1"
      :fetch="fetchList"
      :on-restore="emailRestore"
      :on-purge="emailPurge"
      trash-mode
      :show-star="false"
      :show-unread="false"
      :show-reply="false"
      :empty-title="t('mail.emptyTrash')"
      :empty-description="t('mail.emptyTrashHint')"
    />

    <AlertDialog
      v-model:open="confirmOpen"
      :title="t('mail.emptyTrashConfirmTitle')"
      :description="t('mail.emptyTrashConfirmHint')"
      :confirm-text="t('mail.purgeAll')"
      tone="danger"
      :loading="purging"
      @confirm="purgeAll"
    />
  </div>
</template>
