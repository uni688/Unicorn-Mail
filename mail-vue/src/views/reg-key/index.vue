<script setup>
/**
 * 注册码 — 管理域表格页第一张（§10.4 / §6.2）
 *
 * 从「卡片网格 + 历史弹窗里的 el-table」换成 `DataTable`。几个和别的管理页不一样
 * 的地方，都是被后端接口的语义逼出来的，不是随手定的：
 *
 * 1. **没有分页器**。`/regKey/list` 返回的是全量列表（`reg-key-service.list()` 里
 *    没有 limit/offset，只有 `code` 前缀过滤），所以 `total` / `pageSize` 都不传 ——
 *    画一个只有一页的分页器是噪音（DataTable 自己也会藏）。
 * 2. **排序在前端做**。同上：整份数据都在手里，本地排序看到的就是全部，不会像
 *    「只排当前页」那样骗人。过期的 `expireTime` 被服务端置成 `null`，排序时一律
 *    沉底，否则「已过期」会插在有效期中间。
 * 3. **可以批量删**。`regKeyDelete()` 本来就收数组（`?regKeyIds=1,2,3`），
 *    所以选择列不是摆设。
 *
 * 顺手修掉一个旧 bug：`submit()` 里空注册码的提示写的是 `$('emptyRegKeyMsg')`
 * —— `$` 在这个文件里不存在，点下去只会抛 ReferenceError，用户看不到任何提示。
 */
import {computed, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import dayjs from 'dayjs'
import IconPlus from '~icons/lucide/plus'
import IconSearch from '~icons/lucide/search'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconEraser from '~icons/lucide/eraser'
import IconShuffle from '~icons/lucide/shuffle'
import IconEllipsis from '~icons/lucide/ellipsis'
import IconKey from '~icons/lucide/key-round'
import IconUser from '~icons/lucide/user-round'
import {
    AlertDialog, Badge, Button, CopyButton, DataTable, DatePicker, Dialog,
    DropdownMenu, Field, Input, MenuItem, MenuSeparator, NumberInput, Select,
} from '@/components/ui'
import {EmptyState, ErrorState} from '@/components/composite'
import {toast} from '@/components/ui/Toast/toast.js'
import {useSelection} from '@/composables/useSelection.js'
import {hasPerm} from '@/perm/perm.js'
import {regKeyAdd, regKeyClearNotUse, regKeyDelete, regKeyHistory, regKeyList} from '@/request/reg-key.js'
import {roleSelectUse} from '@/request/role.js'
import {useRoleStore} from '@/store/role.js'
import {useSettingStore} from '@/store/setting.js'
import {tzDayjs} from '@/utils/day.js'

defineOptions({name: 'reg-key'})

const {t} = useI18n()
const settingStore = useSettingStore()
const roleStore = useRoleStore()

const params = reactive({code: ''})
const list = ref([])
const loading = ref(true)
const error = ref(null)

const canDelete = computed(() => hasPerm('reg-key:delete'))

/* ------------------------------------------------------------------ 列与排序 */

const columns = computed(() => [
    {key: 'code', label: t('regKey'), minWidth: '160px', truncate: true},
    {key: 'roleName', label: t('roleDesc'), width: '140px'},
    {key: 'count', label: t('remainingUses'), width: '120px', align: 'end', sortable: true},
    {key: 'expireTime', label: t('validUntil'), width: '150px', sortable: true},
    {key: 'actions', label: t('admin.actions'), width: '68px', align: 'end', cardHidden: true},
])

/** 默认不排序：服务端已经按 regKeyId 倒序给了，也就是「最近建的在上」 */
const sort = ref(null)

const rows = computed(() => {
    const current = sort.value
    if (!current?.key) {
        return list.value
    }
    const dir = current.order === 'asc' ? 1 : -1
    return [...list.value].sort((a, b) => {
        const x = a[current.key]
        const y = b[current.key]
        // null 沉底且不跟着方向翻：过期的注册码永远排在有效的后面
        if (x == null || y == null) {
            return x == null ? (y == null ? 0 : 1) : -1
        }
        if (x === y) {
            return 0
        }
        return x > y ? dir : -dir
    })
})

const selection = useSelection(rows, {idKey: 'regKeyId'})

/* ---------------------------------------------------------------- 列表请求 */

async function getList() {
    loading.value = true
    error.value = null
    try {
        // noMsg：失败画进 DataTable 的 error 态，不再弹 toast
        const data = await regKeyList(params, {noMsg: true})
        list.value = Array.isArray(data) ? data : []
        selection.clear()
    } catch (e) {
        error.value = e
        list.value = []
    } finally {
        loading.value = false
    }
}

const errorDetail = computed(() => String(error.value?.message ?? ''))

function search() {
    getList()
}

function refresh() {
    params.code = ''
    getList()
}

getList()

/* ------------------------------------------------------------------ 身份下拉 */

const roleList = ref([])

function loadRoles() {
    roleSelectUse().then((data) => {
        roleList.value = Array.isArray(data) ? data : []
    })
}

loadRoles()
watch(() => roleStore.refresh, loadRoles)

const roleOptions = computed(() => roleList.value.map((role) => ({label: role.name, value: role.roleId})))

/* -------------------------------------------------------------------- 时间 */

/** 有效期只到天，同年不重复报年份（沿用旧页面的格式，别让用户重新认一遍日期） */
function formatExpireTime(value) {
    const date = tzDayjs(value)
    const sameYear = date.year() === dayjs().year()
    if (settingStore.lang === 'en') {
        return sameYear ? date.format('MMM D') : date.format('MMM D, YYYY')
    }
    return sameYear ? date.format('M月D日') : date.format('YYYY年M月D日')
}

/** 使用记录到分钟 */
function formatCreateTime(value) {
    const date = tzDayjs(value)
    const sameYear = date.year() === dayjs().year()
    if (settingStore.lang === 'en') {
        return sameYear ? date.format('MMM D, HH:mm') : date.format('MMM D, YYYY HH:mm')
    }
    return sameYear ? date.format('M月D日 HH:mm') : date.format('YYYY年M月D日 HH:mm')
}

/* -------------------------------------------------------------------- 新增 */

const showAdd = ref(false)
const addLoading = ref(false)
const addForm = reactive({code: '', count: 1, roleId: null, expireTime: null})

function randomCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

function genCode() {
    addForm.code = randomCode()
}

/** 菜单里的「复制」；行内那颗按钮是 CopyButton，自己会处理成功/失败 */
async function copyCode(code) {
    try {
        await navigator.clipboard.writeText(code)
        toast.success(t('copySuccessMsg'))
    } catch {
        toast.error(t('ui.copyFailed'))
    }
}

function openAdd() {
    genCode()
    showAdd.value = true
}

async function submit() {
    if (!addForm.code) {
        toast.error(t('emptyRegKeyMsg'))
        return
    }
    if (!addForm.roleId) {
        toast.error(t('emptyRole'))
        return
    }
    if (!addForm.expireTime) {
        toast.error(t('emptyTimeMsg'))
        return
    }
    if (!addForm.count) {
        toast.error(t('emptyCountMsg'))
        return
    }
    addLoading.value = true
    try {
        await regKeyAdd({...addForm})
        showAdd.value = false
        addForm.code = ''
        toast.success(t('addSuccessMsg'))
        await getList()
    } finally {
        addLoading.value = false
    }
}

/* ------------------------------------------------- 删除 / 清除失效（AlertDialog） */

const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmData = ref({title: '', description: '', confirmText: '', run: null})

function ask(next) {
    confirmData.value = {description: '', ...next}
    confirmOpen.value = true
}

function askDelete(row) {
    ask({
        title: t('delConfirm', {msg: row.code}),
        confirmText: t('delete'),
        run: () => regKeyDelete([row.regKeyId]).then(() => toast.success(t('delSuccessMsg'))),
    })
}

function askBatchDelete() {
    const ids = [...selection.ids.value]
    ask({
        title: t('admin.delRegKeysConfirm', {n: ids.length}),
        confirmText: t('delete'),
        run: () => regKeyDelete(ids).then(() => toast.success(t('delSuccessMsg'))),
    })
}

function askClearNotUse() {
    ask({
        title: t('clearRegKey'),
        confirmText: t('clear'),
        run: () => regKeyClearNotUse().then(() => toast.success(t('clearSuccess'))),
    })
}

async function runConfirm() {
    confirmLoading.value = true
    try {
        await confirmData.value.run?.()
        confirmOpen.value = false
        await getList()
    } finally {
        confirmLoading.value = false
    }
}

/* -------------------------------------------------------------- 使用记录弹窗 */

const showHistory = ref(false)
const historyCode = ref('')
const historyId = ref(null)
const historyRows = ref([])
const historyLoading = ref(false)
const historyError = ref(null)

const historyColumns = computed(() => [
    {key: 'email', label: t('user'), minWidth: '180px', truncate: true},
    {key: 'createTime', label: t('date'), width: '150px', align: 'end', formatter: formatCreateTime},
])

async function loadHistory() {
    historyLoading.value = true
    historyError.value = null
    try {
        const data = await regKeyHistory(historyId.value, {noMsg: true})
        historyRows.value = Array.isArray(data) ? data : []
    } catch (e) {
        historyError.value = e
        historyRows.value = []
    } finally {
        historyLoading.value = false
    }
}

function openHistory(row) {
    historyId.value = row.regKeyId
    historyCode.value = row.code
    historyRows.value = []
    showHistory.value = true
    loadHistory()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <!-- 工具条：主行动在左，检索与批量维护在右（§7.9） -->
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <Button v-perm="'reg-key:add'" variant="primary" size="sm" @click="openAdd">
        <IconPlus class="size-4" />
        {{ t('addRegKey') }}
      </Button>

      <div class="ml-auto flex items-center gap-1.5">
        <Input
          v-model="params.code"
          type="search"
          size="sm"
          clearable
          class="w-40 sm:w-56"
          :placeholder="t('searchRegKeyDesc')"
          :aria-label="t('searchRegKeyDesc')"
          @enter="search"
          @clear="search"
        />
        <Button variant="ghost" size="icon-sm" :label="t('ui.search')" @click="search">
          <IconSearch class="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="refresh">
          <IconRefresh class="size-4" />
        </Button>
        <Button
          v-perm="'reg-key:delete'"
          variant="ghost"
          size="icon-sm"
          :label="t('admin.clearInvalid')"
          @click="askClearNotUse"
        >
          <IconEraser class="size-4" />
        </Button>
      </div>
    </div>
    <div class="flex min-h-0 flex-1 flex-col p-4">
      <DataTable
        v-model:sort="sort"
        :columns="columns"
        :rows="rows"
        row-key="regKeyId"
        :aria-label="$t('inviteCode')"
        :loading="loading"
        :error="errorDetail || Boolean(error)"
        :selectable="canDelete"
        :selection="selection"
        class="min-h-0 flex-1"
        scroll-class="min-h-0"
        @retry="getList"
        @empty-action="openAdd"
      >
        <template #cell-code="{value}">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate font-mono text-mono text-fg">{{ value }}</span>
            <CopyButton :value="value" :label="$t('admin.copyCode')" />
          </div>
        </template>

        <template #cell-roleName="{value}">
          <Badge v-if="value">{{ value }}</Badge>
          <span v-else class="text-fg-muted">—</span>
        </template>

        <template #cell-count="{value}">
          <span v-if="value" class="um-tnum">{{ value }}</span>
          <Badge v-else tone="danger">{{ $t('exhausted') }}</Badge>
        </template>

        <!-- 服务端把过期的注册码的 expireTime 置成 null（reg-key-service.list） -->
        <template #cell-expireTime="{value}">
          <span v-if="value" class="um-tnum text-fg-muted">{{ formatExpireTime(value) }}</span>
          <Badge v-else tone="danger">{{ $t('expired') }}</Badge>
        </template>
        <template #cell-actions="{row}">
          <DropdownMenu align="end">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" :label="t('ui.more')">
                <IconEllipsis class="size-4" />
              </Button>
            </template>
            <MenuItem @select="copyCode(row.code)">{{ t('copy') }}</MenuItem>
            <MenuItem @select="openHistory(row)">{{ t('useHistory') }}</MenuItem>
            <template v-if="canDelete">
              <MenuSeparator />
              <MenuItem tone="danger" @select="askDelete(row)">{{ t('delete') }}</MenuItem>
            </template>
          </DropdownMenu>
        </template>

        <!-- 批量删除：`regKeyDelete()` 本来就收数组 -->
        <template #actions="{count}">
          <Button variant="danger" size="sm" @click="askBatchDelete">
            {{ t('admin.batchDelete') }}（{{ count }}）
          </Button>
        </template>

        <template #empty>
          <EmptyState
            :icon="IconKey"
            :title="params.code ? t('mail.emptySearch') : t('admin.emptyRegKey')"
            :description="params.code ? t('mail.emptySearchHint') : t('admin.emptyRegKeyHint')"
            :action-label="params.code ? '' : t('addRegKey')"
            @action="openAdd"
          />
        </template>

        <template #error="{detail, retry}">
          <ErrorState
            :title="t('admin.loadFailed')"
            :description="t('admin.loadFailedHint')"
            :detail="detail"
            :retry-label="t('ui.retry')"
            :detail-label="t('admin.errorDetail')"
            @retry="retry"
          />
        </template>

        <template #footer>{{ t('ui.totalCount', {n: list.length}) }}</template>
      </DataTable>
    </div>

    <!-- 新增 -->
    <Dialog v-model:open="showAdd" :title="t('addRegKey')" size="sm">
      <div class="grid gap-3">
        <Field :label="t('regKey')" required>
          <template #default="{id, invalid}">
            <!-- 重新生成按钮不能放进 Input 的 #suffix：那个槽是 pointer-events-none +
                 aria-hidden 的装饰位，放按钮进去点不动也读不到 -->
            <div class="flex items-center gap-1.5">
              <Input
                :id="id"
                v-model="addForm.code"
                :invalid="invalid"
                class="min-w-0 flex-1"
                :placeholder="t('regKey')"
              />
              <Button variant="secondary" size="icon" :label="t('admin.regenerate')" @click="genCode">
                <IconShuffle class="size-4" />
              </Button>
            </div>
          </template>
        </Field>

        <Field :label="t('roleDesc')" required>
          <template #default="{id, invalid}">
            <Select
              :id="id"
              v-model="addForm.roleId"
              :invalid="invalid"
              :options="roleOptions"
              :placeholder="t('select')"
            />
          </template>
        </Field>

        <Field :label="t('validUntil')" required>
          <template #default="{id, invalid}">
            <DatePicker :id="id" v-model="addForm.expireTime" :invalid="invalid" :placeholder="t('validUntil')" />
          </template>
        </Field>

        <Field :label="t('remainingUses')" required>
          <template #default="{id}">
            <NumberInput :id="id" v-model="addForm.count" :min="1" :max="99999" />
          </template>
        </Field>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showAdd = false">{{ t('cancel') }}</Button>
        <Button variant="primary" :loading="addLoading" @click="submit">{{ t('add') }}</Button>
      </template>
    </Dialog>
    <!-- 删除 / 清除失效：替代 ElMessageBox.confirm，焦点默认落在「取消」 -->
    <AlertDialog
      v-model:open="confirmOpen"
      :title="confirmData.title"
      :description="confirmData.description"
      :confirm-text="confirmData.confirmText"
      :cancel-text="t('cancel')"
      tone="danger"
      :loading="confirmLoading"
      @confirm="runConfirm"
    />

    <!-- 使用记录 -->
    <Dialog v-model:open="showHistory" :title="t('useHistory')" :description="historyCode" size="md">
      <DataTable
        :columns="historyColumns"
        :rows="historyRows"
        row-key="userId"
        :aria-label="t('useHistory')"
        :loading="historyLoading"
        :error="String(historyError?.message ?? '') || Boolean(historyError)"
        :skeleton-rows="3"
        scroll-class="max-h-80"
        @retry="loadHistory"
      >
        <template #empty>
          <EmptyState :icon="IconUser" :title="t('admin.historyEmpty')" />
        </template>
        <template #error="{detail, retry}">
          <ErrorState
            :title="t('admin.loadFailed')"
            :detail="detail"
            :retry-label="t('ui.retry')"
            :detail-label="t('admin.errorDetail')"
            @retry="retry"
          />
        </template>
      </DataTable>
    </Dialog>
  </div>
</template>
