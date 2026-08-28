<script setup>
/**
 * 收件箱（§7.4 / §7.5）
 *
 * 这一版只剩「取哪一批数据」和「新邮件长轮询」两件事，列表、阅读窗格、选择、删除、
 * 已读全在 `MailWorkspace` 里（旧版是 `email-scroll` 1367 行 + `views/content` 428 行）。
 *
 * 长轮询照搬旧实现（`views/email/index.vue:77-131`）的每一条防御，它们都是踩过的坑：
 *   - 请求发出时校验「最后一封属于当前邮箱」，回来后再校验一次邮箱 / 排序没变；
 *   - `existIds` 去重：`/email/latest` 在边界上会重复给同一封；
 *   - 401/403 直接把 autoRefresh 关掉，否则会以固定间隔一直撞墙；
 *   - 每插一封停 50ms，让插入动画一封一封出现。
 * 改动只有一处：循环条件从 `while (true)` 改成组件存活标记，卸载后不再空转
 * （旧实现里这个循环会随页面一直跑到刷新为止）。
 */
import {onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {MailWorkspace} from '@/components/domain'
import {openCompose} from '@/composables/useComposer.js'
import {emailDelete, emailLatest, emailList} from '@/request/email.js'
import {starAdd, starCancel} from '@/request/star.js'
import {useAccountStore} from '@/store/account.js'
import {useSettingStore} from '@/store/setting.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'
import {matchesQuery, useSearchQuery} from '@/composables/useSearchQuery.js'
import {sleep} from '@/utils/time-utils.js'

defineOptions({name: 'email'})

const {t} = useI18n()
const route = useRoute()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const {prefs} = useMailPrefs()
const search = useSearchQuery()

const workspace = ref(null)

/** `filters` 由 `MailWorkspace` 传进来（`?q=` 解析结果），没在搜时是 `{}` */
function fetchList(cursor, size, filters = {}) {
    const accountId = accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    return emailList(accountId, allReceive, cursor, prefs.timeSort, size, 0, filters).then((data) => {
        if (data?.latestEmail) {
            // 长轮询要靠这两个字段判断「这一批还属于当前邮箱吗」
            data.latestEmail.reqAccountId = accountId
            data.latestEmail.allReceive = allReceive
        }
        return data
    })
}

/* -------------------------------------------------------------- 长轮询 */

const existIds = new Set()
let alive = true

async function latest() {
    while (alive) {
        const autoRefresh = settingStore.settings.autoRefresh
        await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000)

        if (!alive || route.name !== 'email' || autoRefresh <= 1) continue
        if (workspace.value?.firstLoad) continue

        const latestEmail = workspace.value?.latestEmail
        const accountId = accountStore.currentAccountId
        const allReceive = latestEmail?.allReceive
        const sort = prefs.timeSort

        // 发起前：最后一封必须是当前邮箱的
        if (!latestEmail || accountId !== latestEmail.reqAccountId) continue

        try {
            const list = await emailLatest(latestEmail.emailId, accountId, allReceive)

            // 回来后：邮箱、排序、「全部邮件」范围都没变才允许回填
            if (accountId !== accountStore.currentAccountId
                || sort !== prefs.timeSort
                || allReceive !== accountStore.currentAccount?.allReceive) continue

            for (const email of list ?? []) {
                if (existIds.has(email.emailId)) continue
                existIds.add(email.emailId)
                // 搜索态下列表是筛选结果，新邮件也得过一遍同一套条件，否则会插进一封不符合条件的行。
                // `/email/latest` 刻意不带过滤参数（它的游标是「全局最新一封的 id」，
                // 缩小它会让轮询从一个偏小的 id 起反复拉回同一批），所以判定放在这里，
                // 用的是 `useSearchQuery` 的本地兜底谓词 —— 字段与后端过滤一一对应。
                if (search.active.value && !matchesQuery(email, search.query.value)) continue
                email.reqAccountId = accountId
                email.allReceive = allReceive
                workspace.value?.addItem(email)
                await sleep(50)
            }
        } catch (e) {
            if (e?.code === 401 || e?.code === 403) settingStore.settings.autoRefresh = 0
            console.error(e)
        }
    }
}

onMounted(() => {
    latest()
})

onUnmounted(() => {
    alive = false
})

/* ------------------------------------------------------------ 写信入口 */

/** 回复 / 转发 = 带着这封邮件去写信页（§7.7 整页写信） */
function reply(email) {
    openCompose('reply', {email})
}

function forward(email) {
    openCompose('forward', {email})
}
</script>

<template>
  <MailWorkspace
    ref="workspace"
    :fetch="fetchList"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :on-delete="emailDelete"
    :empty-title="t('mail.emptyInbox')"
    :empty-description="t('mail.emptyInboxHint')"
    @reply="reply"
    @forward="forward"
  />
</template>
