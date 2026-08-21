<script setup>
/**
 * MailWorkspace — 列表 + 阅读窗格的双栏工作区（§7.5）
 *
 * 收件箱 / 星标 / 已发送 / 回收站四个视图的**共同形状**都在这里，视图本身只剩
 * 「取哪一批数据、允许哪些动作」十几行配置。旧实现里这套壳在 `email-scroll` 与
 * `views/content` 之间来回跳路由，每个视图都要自己写一遍 `jumpContent`。
 *
 * 布局（§7.5）：
 *   - 宽屏：左列表 + 右窗格，窗格位置由 `useMailPrefs().pane` 记忆（right / bottom / off）；
 *   - 窄屏（< md）：列表整页，打开邮件后窗格整页盖上来，带返回箭头。
 *     这里**不写死断点数字**，`useBreakpoint()` 是 §4.4 收敛后的唯一来源。
 *
 * 深链（§5.2 `/mail/:folder/:emailId`）：
 *   打开邮件 = `router.replace` 到带 id 的地址；刷新页面时从列表里找回那一封。
 *   找不到（比如深链指向第 7 页的邮件）就保持列表态而不是空窗格 —— 不为了一个 id
 *   再去请求单封邮件接口，后端也没有这个接口。
 *
 * 已读的时机沿用旧实现：**打开就标已读**（`emailRead`），并同步更新侧栏角标。
 */
import {computed, onUnmounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {MailList, MailReader} from '@/components/domain'
import {useBreakpoint} from '@/composables/useBreakpoint.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'
import {useCounts} from '@/composables/useCounts.js'
import {registerMailActions, setMailSelection} from '@/composables/useMailActions.js'
import {useEmailStore} from '@/store/email.js'
import {emailRead, emailUnread} from '@/request/email.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** `(cursor, size) => Promise<{list, total, latestEmail?}>` */
    fetch: {type: Function, required: true},
    /** 星标接口（星标视图里取消星标要把行摘掉，所以由调用方接管回调） */
    starAdd: {type: Function, default: undefined},
    starCancel: {type: Function, default: undefined},
    onStarAdd: {type: Function, default: undefined},
    onStarCancel: {type: Function, default: undefined},
    /** 删除 / 还原 / 彻底删除。给了才画对应按钮 */
    onDelete: {type: Function, default: undefined},
    onRestore: {type: Function, default: undefined},
    onPurge: {type: Function, default: undefined},
    size: {type: Number, default: 50},
    showUnread: {type: Boolean, default: true},
    showStar: {type: Boolean, default: true},
    showStatus: {type: Boolean, default: false},
    showReply: {type: Boolean, default: true},
    trashMode: {type: Boolean, default: false},
    emptyTitle: {type: String, default: ''},
    emptyDescription: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['reply', 'forward', 'open'])

const route = useRoute()
const router = useRouter()
const {isMobile} = useBreakpoint()
const {prefs} = useMailPrefs()
const {refresh: refreshCounts} = useCounts()
const emailStore = useEmailStore()

const listRef = ref(null)
const active = ref(null)

const canDelete = computed(() => hasPerm('email:delete'))
const canReply = computed(() => props.showReply && hasPerm('email:send'))

/** 窄屏：窗格整页盖上来；宽屏：按记忆的位置分栏 */
const paneMode = computed(() => {
    if (isMobile.value) return active.value ? 'full' : 'none'
    return prefs.pane === 'off' ? 'none' : prefs.pane
})

/* ------------------------------------------------------------ 打开与深链 */

/** 当前视图的路由名，用来拼 `/mail/:folder/:emailId` 而不改路由名 */
const routeName = computed(() => route.name)

function syncUrl(emailId) {
    const params = {...route.params}
    if (emailId) params.emailId = String(emailId)
    else delete params.emailId
    // replace 而不是 push：在列表里连点五封邮件不该在历史里堆五条
    router.replace({name: routeName.value, params, query: route.query})
}

function open(email) {
    active.value = email
    syncUrl(email.emailId)
    emit('open', email)

    if (props.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
        // 乐观：先把行改成已读，请求失败也不回滚（旧实现同样如此，重进列表会纠正）
        listRef.value?.localUnread([email.emailId], EmailUnreadEnum.READ)
        email.unread = EmailUnreadEnum.READ
        emailRead([email.emailId]).then(() => refreshCounts()).catch(() => {})
    }
}

function close() {
    active.value = null
    syncUrl(null)
}

/** 刷新页面 / 直接贴地址进来：从已加载的列表里找回那一封 */
watch(
    () => [route.params.emailId, listRef.value?.mails?.length],
    ([id]) => {
        if (!id) {
            active.value = null
            return
        }
        if (String(active.value?.emailId ?? '') === String(id)) return
        const hit = listRef.value?.mails?.find((mail) => String(mail.emailId) === String(id))
        if (hit) active.value = hit
    },
    {immediate: true},
)

/* ------------------------------------------------------------------ 动作 */

/** 删除后把窗格里那一封也关掉，否则会留着一封已经不在列表里的邮件 */
function afterMutation(ids) {
    listRef.value?.removeIds(ids)
    if (ids.some((id) => String(id) === String(active.value?.emailId))) close()
    refreshCounts()
}

function del(ids) {
    if (!props.onDelete) return
    const list = [...ids]
    props.onDelete(list)
        .then(() => {
            afterMutation(list)
            // 让其它列表（星标 / 回收站）跟着摘掉同一批（旧实现的 emailStore 广播）
            emailStore.deleteIds = list
        })
        .catch(() => {})
}

function restore(ids) {
    if (!props.onRestore) return
    const list = [...ids]
    props.onRestore(list).then(() => afterMutation(list)).catch(() => {})
}

function purge(ids) {
    if (!props.onPurge) return
    const list = [...ids]
    props.onPurge(list).then(() => afterMutation(list)).catch(() => {})
}

/** 星标数也在侧栏角标里（§10.5：角标必须和列表一致），所以切星标之后也要重新取 */
function afterStar() {
    refreshCounts()
}

function markRead(ids) {
    listRef.value?.localUnread(ids, EmailUnreadEnum.READ)
    emailRead([...ids]).then(() => refreshCounts()).catch(() => {})
}

function markUnread(ids) {
    listRef.value?.localUnread(ids, EmailUnreadEnum.UNREAD)
    if (active.value && ids.some((id) => String(id) === String(active.value.emailId))) {
        active.value.unread = EmailUnreadEnum.UNREAD
    }
    emailUnread([...ids]).then(() => refreshCounts()).catch(() => {})
}

/** 阅读窗格里的星标：优先走列表的乐观切换，两处状态才不会分叉 */
function toggleStar(email, next) {
    if (!email || !!email.isStar === !!next) return

    const row = listRef.value?.mails?.find((mail) => mail.emailId === email.emailId)

    if (row && listRef.value?.toggleStar) {
        listRef.value.toggleStar(row)
        if (row !== email) email.isStar = row.isStar
        afterStar()
        return
    }

    // 列表不在场（窄屏整页阅读）：直接调接口，失败翻回来
    const request = next ? props.starAdd : props.starCancel
    email.isStar = next
    request?.(email.emailId).then(afterStar).catch(() => {
        email.isStar = next ? 0 : 1
    })
}

/* ------------------------------------------------- 命令条（§6.2）的接线 */

/** 勾选的那些，一封都没勾时退回窗格里正在看的那封 —— 命令条的动作不该「什么都没发生」 */
const actionIds = () => {
    const ids = listRef.value?.selection?.ids?.value ?? []
    if (ids.length) return [...ids]
    return active.value ? [active.value.emailId] : []
}

const unregister = registerMailActions({
    'mark-read': () => {
        const ids = actionIds()
        if (ids.length) markRead(ids)
    },
    star: () => {
        const ids = actionIds()
        for (const id of ids) {
            const row = listRef.value?.mails?.find((mail) => mail.emailId === id)
            if (row) listRef.value?.toggleStar?.(row)
        }
        if (ids.length) afterStar()
    },
    delete: () => {
        const ids = actionIds()
        if (!ids.length) return
        // 回收站里「删除」就是彻底删除：这一层不做语义翻译，谁注册谁定义
        if (props.trashMode) purge(ids)
        else del(ids)
    },
    'copy-code': () => {
        const ids = actionIds()
        const row = listRef.value?.mails?.find((mail) => mail.emailId === ids[0])
        if (row?.code) navigator.clipboard?.writeText?.(String(row.code))
    },
})

watch(
    () => {
        const ids = listRef.value?.selection?.ids?.value ?? []
        return {count: ids.length, first: ids[0]}
    },
    ({count, first}) => {
        const row = listRef.value?.mails?.find((mail) => mail.emailId === first)
        setMailSelection({count, hasCode: !!row?.code})
    },
    {deep: true},
)

onUnmounted(unregister)

defineExpose({
    addItem: (email) => listRef.value?.addItem(email),
    /** 星标视图取消星标后要摘行 */
    removeIds: (ids) => afterMutation([...ids]),
    refresh: () => listRef.value?.refresh(),
    latestEmail: computed(() => listRef.value?.latestEmail),
    firstLoad: computed(() => listRef.value?.firstLoad),
    active,
})
</script>

<template>
  <div
    :class="cn(
      'flex h-full min-h-0',
      paneMode === 'bottom' ? 'flex-col' : 'flex-row',
      props.class,
    )"
  >
    <MailList
      v-show="paneMode !== 'full'"
      ref="listRef"
      :fetch="fetch"
      :size="size"
      :star-add="starAdd"
      :star-cancel="starCancel"
      :on-star-add="onStarAdd"
      :on-star-cancel="onStarCancel"
      :active-id="active?.emailId ?? null"
      :show-unread="showUnread"
      :show-star="showStar"
      :show-status="showStatus"
      :trash-mode="trashMode"
      :can-delete="canDelete"
      :empty-title="emptyTitle"
      :empty-description="emptyDescription"
      :class="paneMode === 'none' || paneMode === 'full'
        ? 'flex-1'
        : (paneMode === 'bottom' ? 'h-1/2 shrink-0' : 'w-[380px] shrink-0 border-r border-line xl:w-[440px]')"
      @open="open"
      @delete="del"
      @restore="restore"
      @purge="purge"
      @read="markRead"
      @unread="markUnread"
      @star="afterStar"
      @unstar="afterStar"
    />

    <MailReader
      v-if="paneMode === 'right' || paneMode === 'bottom' || paneMode === 'full'"
      :email="active"
      :show-star="showStar"
      :show-unread="showUnread"
      :show-reply="canReply"
      :can-delete="canDelete"
      :trash-mode="trashMode"
      :show-back="paneMode === 'full'"
      class="min-w-0 flex-1"
      @back="close"
      @delete="del([active.emailId])"
      @restore="restore([active.emailId])"
      @purge="purge([active.emailId])"
      @star="toggleStar(active, 1)"
      @unstar="toggleStar(active, 0)"
      @unread="markUnread([active.emailId])"
      @reply="emit('reply', active)"
      @forward="emit('forward', active)"
    />
  </div>
</template>
