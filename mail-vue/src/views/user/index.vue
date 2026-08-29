<script setup>
/**
 * 用户管理 — 管理域表格页第三张（§10.4 / §7.9）
 *
 * 从 1294 行的 el-table 单文件换成 `DataTable`：取数与动作全在
 * `useUserAdmin()` 里，这里只剩模板与弹窗开合。旧版的 5 个断点列开关
 * （`statusShow` / `createTimeShow` / …）和 `window.onresize` 一起删掉了 ——
 * DataTable 在 `<md` 整表退化成卡片，字段一个都不少，不必再靠藏列保命。
 *
 * 三处和旧版有意不同（原因写在 `useUserAdmin.js` 顶部）：
 * 1. 排序挂在「注册时间」表头，不再是工具条上那个无状态的沙漏图标；
 * 2. 收信/发信/邮箱数的「含已删除」筛选，从 el-table 列筛选器换成表头多选菜单；
 * 3. 详情弹窗永远显示全部字段，不再按窄屏补漏。
 *
 * 右键菜单里的每一项都能在别处找到同样的入口（行内「⋯」菜单 + 工具条批量删除），
 * 这是 ContextMenu 的硬规矩：右键是快捷方式，不是唯一路径。
 */
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import IconPlus from '~icons/lucide/plus'
import IconSearch from '~icons/lucide/search'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconTrash from '~icons/lucide/trash-2'
import IconEllipsis from '~icons/lucide/ellipsis'
import IconUsers from '~icons/lucide/users-round'
import IconMailbox from '~icons/lucide/mailbox'
import IconFilter from '~icons/lucide/filter'
import {
    AlertDialog, Avatar, Badge, Button, ContextMenu, DataTable, Dialog,
    DropdownMenu, Field, Input, MenuCheckboxItem, MenuItem, MenuLabel,
    MenuSeparator, Select,
} from '@/components/ui'
import {EmptyState, ErrorState} from '@/components/composite'
import {hasPerm} from '@/perm/perm.js'
import {useSettingStore} from '@/store/setting.js'
import {useUserStore} from '@/store/user.js'
import {USER_STATUS, useUserAdmin} from '@/composables/useUserAdmin.js'

defineOptions({name: 'user'})

const {t} = useI18n()
const settingStore = useSettingStore()
const userStore = useUserStore()

const admin = useUserAdmin()
const {
    rows, total, loading, errorDetail, params, selection, getList,
    roleOptions, roleName, sort, setSort, search, setPage, setStatus, refresh,
    countMode, countOf, toggleCountMode,
    addForm, addLoading, domainOptions, resetAddForm, submitAdd,
    userForm, formLoading, openForm, resetUserForm, submitPwd, submitType,
    statusActionLabel, statusActionLongLabel, toggleStatus, restore, removeUsers, resetSendCount,
    accountRows, accountLoading, accountErrorDetail, accountParams,
    openAccountList, setAccountPage, removeAccount,
    sendCountText, sendTypeText, formatTime, canManage,
} = admin

const canDelete = computed(() => hasPerm('user:delete'))

/* ------------------------------------------------------------------ 列定义 */

const statusOptions = computed(() => [
    {label: t('allStatus'), value: USER_STATUS.ALL},
    {label: t('active'), value: USER_STATUS.ACTIVE},
    {label: t('banned'), value: USER_STATUS.BANNED},
    {label: t('deleted'), value: USER_STATUS.DELETED},
])

/** 三个计数列共用一套表头菜单，靠 field 区分 */
const COUNT_COLUMNS = [
    {key: 'receiveEmailCount', field: 'receive', labelKey: 'tabReceived'},
    {key: 'sendEmailCount', field: 'send', labelKey: 'tabSent'},
    {key: 'accountCount', field: 'account', labelKey: 'tabMailboxes'},
]

const columns = computed(() => [
    {key: 'email', label: t('userEmail'), minWidth: '200px', truncate: true},
    ...COUNT_COLUMNS.map(c => ({
        key: c.key, label: t(c.labelKey), width: '110px', align: 'end',
    })),
    {key: 'createTime', label: t('tabRegisteredAt'), width: '150px', sortable: true, sortKey: 'createTime'},
    {key: 'status', label: t('tabStatus'), width: '96px'},
    {key: 'type', label: t('perm'), width: '130px', truncate: true},
    {key: 'actions', label: t('adminTable.actions'), width: '68px', align: 'end', cardHidden: true},
])

/** 选择列：超级管理员不能被批量删（和旧版 `:selectable` 一致） */
const selectableRow = (row) => row.type !== 0

/* -------------------------------------------------------------- 弹窗开合 */

const showAdd = ref(false)
const showPwd = ref(false)
const showType = ref(false)
const showAccounts = ref(false)
const showDetails = ref(false)
const details = ref(null)

function openAdd() {
    resetAddForm()
    showAdd.value = true
}

async function onSubmitAdd() {
    if (await submitAdd()) showAdd.value = false
}

function openSetPwd(user) {
    openForm(user)
    showPwd.value = true
}

function openSetType(user) {
    openForm(user)
    showType.value = true
}

async function onSubmitPwd() {
    if (await submitPwd()) {
        showPwd.value = false
        resetUserForm()
    }
}

async function onSubmitType() {
    if (await submitType()) {
        showType.value = false
        resetUserForm()
    }
}

function openAccounts(user) {
    showAccounts.value = true
    openAccountList(user.userId)
}

function openDetails(user) {
    details.value = user
    showDetails.value = true
}

/* ------------------------------------------------------------ 确认类动作 */

const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmData = ref({title: '', description: '', confirmText: '', tone: 'danger', run: null})

function ask(next) {
    confirmData.value = {description: '', tone: 'danger', ...next}
    confirmOpen.value = true
}

function askDelete(user) {
    ask({
        title: t('delConfirm', {msg: user.email}),
        description: t('adminTable.delUserHint'),
        confirmText: t('delete'),
        run: () => removeUsers([user.userId]),
    })
}

function askBatchDelete() {
    const ids = [...selection.ids.value]
    ask({
        title: t('adminTable.delUsersConfirm', {n: ids.length}),
        description: t('adminTable.delUserHint'),
        confirmText: t('delete'),
        run: () => removeUsers(ids),
    })
}

/** 封禁要问，启用不问：启用是把限制放开，误点的代价小得多 */
function askToggleStatus(user) {
    if (user.status === 0) {
        ask({
            title: t('adminTable.banConfirm', {msg: user.email}),
            description: t('adminTable.banHint'),
            confirmText: t('btnBan'),
            run: () => toggleStatus(user),
        })
        return
    }
    toggleStatus(user)
}

function askRestore(user) {
    ask({
        title: t('adminTable.restoreConfirm', {msg: user.email}),
        description: t('adminTable.restoreHint'),
        confirmText: t('restore'),
        tone: 'default',
        run: () => restore(user),
    })
}

/** 已删除的行只有「恢复」，其余按当前状态在封禁/启用之间切 */
function onStatusAction(user) {
    if (user.isDel === 1) {
        askRestore(user)
        return
    }
    askToggleStatus(user)
}

function askDeleteAccount(account) {
    ask({
        title: t('delConfirm', {msg: account.email}),
        confirmText: t('delete'),
        run: () => removeAccount(account),
    })
}

async function runConfirm() {
    confirmLoading.value = true
    try {
        await confirmData.value.run?.()
        confirmOpen.value = false
    } finally {
        confirmLoading.value = false
    }
}

/* ------------------------------------------------------ 用户邮箱子表的列 */

const accountColumns = computed(() => [
    {key: 'email', label: t('userEmail'), minWidth: '200px', truncate: true},
    {key: 'createTime', label: t('tabRegisteredAt'), width: '150px', formatter: v => formatTime(v)},
    {key: 'actions', label: t('adminTable.actions'), width: '68px', align: 'end', cardHidden: true},
])

getList()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <!-- 工具条：主行动在左，检索与批量维护在右（§7.9） -->
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <Button v-perm="'user:add'" variant="primary" size="sm" @click="openAdd">
        <IconPlus class="size-4" />
        {{ t('addUser') }}
      </Button>

      <div class="ml-auto flex items-center gap-1.5">
        <Select
          :model-value="params.status"
          size="sm"
          class="w-28"
          :options="statusOptions"
          :aria-label="t('tabStatus')"
          @update:model-value="setStatus"
        />
        <Input
          v-model="params.email"
          type="search"
          size="sm"
          clearable
          class="w-36 sm:w-52"
          :placeholder="t('searchEmail')"
          :aria-label="t('searchEmail')"
          @enter="search"
          @clear="search"
        />
        <Button variant="ghost" size="icon-sm" :label="t('ui.search')" @click="search">
          <IconSearch class="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="refresh">
          <IconRefresh class="size-4" />
        </Button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col p-4">
      <DataTable
        :columns="columns"
        :rows="rows"
        row-key="userId"
        :aria-label="t('userManage')"
        :loading="loading"
        :error="errorDetail"
        :selectable="canDelete && selectableRow"
        :selection="selection"
        :sort="sort"
        :page="params.num"
        :page-size="params.size"
        :total="total"
        class="min-h-0 flex-1"
        scroll-class="min-h-0"
        @update:sort="setSort"
        @update:page="setPage"
        @retry="getList"
        @empty-action="openAdd"
      >
        <!-- 三个计数列的表头：勾「正常 / 已删除」，语义照搬旧列筛选器 -->
        <template v-for="c in COUNT_COLUMNS" #[`header-${c.key}`]="{column}" :key="c.key">
          <DropdownMenu align="end">
            <template #trigger>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-sm text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                :aria-label="t('adminTable.filterCount', {name: column.label})"
              >
                {{ column.label }}
                <IconFilter
                  class="size-3 shrink-0"
                  :class="countMode[c.field].length === 2 ? 'opacity-40' : 'text-accent opacity-100'"
                  aria-hidden="true"
                />
              </button>
            </template>
            <MenuLabel>{{ column.label }}</MenuLabel>
            <MenuCheckboxItem
              :model-value="countMode[c.field].includes('normal')"
              @select="$event.preventDefault()"
              @update:model-value="toggleCountMode(c.field, 'normal')"
            >
              {{ t('active') }}
            </MenuCheckboxItem>
            <MenuCheckboxItem
              :model-value="countMode[c.field].includes('del')"
              @select="$event.preventDefault()"
              @update:model-value="toggleCountMode(c.field, 'del')"
            >
              {{ t('deleted') }}
            </MenuCheckboxItem>
          </DropdownMenu>
        </template>

        <template #cell-email="{row}">
          <ContextMenu>
            <template #trigger>
              <div class="flex min-w-0 items-center gap-1.5">
                <span class="truncate text-fg">{{ row.email }}</span>
                <!-- LinuxDo 绑定过的账号：旧版用一个 warning 色的「L」标记 -->
                <Badge v-if="row.username" tone="warning" appearance="subtle">L</Badge>
              </div>
            </template>
            <MenuItem @select="openSetPwd(row)">{{ t('changePassword') }}</MenuItem>
            <MenuItem @select="openSetType(row)">{{ t('setRole') }}</MenuItem>
            <MenuItem v-if="row.type !== 0" @select="onStatusAction(row)">
              {{ statusActionLongLabel(row) }}
            </MenuItem>
            <MenuItem @select="openAccounts(row)">{{ t('userEmail') }}</MenuItem>
            <MenuItem @select="openDetails(row)">{{ t('userDetails') }}</MenuItem>
            <template v-if="canDelete && row.type !== 0">
              <MenuSeparator />
              <MenuItem tone="danger" @select="askDelete(row)">{{ t('adminDeleteUser') }}</MenuItem>
            </template>
          </ContextMenu>
        </template>

        <template v-for="c in COUNT_COLUMNS" #[`cell-${c.key}`]="{row}" :key="`cell-${c.key}`">
          <span class="um-tnum">{{ countOf(row, c.field) }}</span>
        </template>

        <template #cell-createTime="{value}">
          <span class="um-tnum text-fg-muted">{{ formatTime(value) }}</span>
        </template>

        <template #cell-status="{row}">
          <Badge v-if="row.isDel === 1" tone="neutral">{{ t('deleted') }}</Badge>
          <Badge v-else-if="row.status === 0" tone="success" appearance="subtle">{{ t('active') }}</Badge>
          <Badge v-else tone="danger">{{ t('banned') }}</Badge>
        </template>

        <template #cell-type="{row}">
          <span class="truncate">{{ roleName(row.type) }}</span>
        </template>

        <!-- 超级管理员这一行，非管理员看不到菜单（旧版画的是个点不动的假按钮） -->
        <template #cell-actions="{row}">
          <DropdownMenu v-if="canManage(row)" align="end">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" :label="t('ui.more')">
                <IconEllipsis class="size-4" />
              </Button>
            </template>
            <MenuItem @select="openSetPwd(row)">{{ t('changePassword') }}</MenuItem>
            <MenuItem @select="openSetType(row)">{{ t('setRole') }}</MenuItem>
            <MenuItem v-if="row.type !== 0" @select="onStatusAction(row)">
              {{ statusActionLabel(row) }}
            </MenuItem>
            <MenuItem @select="openAccounts(row)">{{ t('userEmail') }}</MenuItem>
            <MenuItem @select="openDetails(row)">{{ t('userDetails') }}</MenuItem>
            <template v-if="canDelete && row.type !== 0">
              <MenuSeparator />
              <MenuItem tone="danger" @select="askDelete(row)">{{ t('adminDeleteUser') }}</MenuItem>
            </template>
          </DropdownMenu>
        </template>

        <template #actions="{count}">
          <Button variant="danger" size="sm" @click="askBatchDelete">
            <IconTrash class="size-4" />
            {{ t('adminTable.batchDelete') }}（{{ count }}）
          </Button>
        </template>

        <template #empty>
          <EmptyState
            :icon="IconUsers"
            :title="params.email ? t('mail.emptySearch') : t('adminTable.emptyUser')"
            :description="params.email ? t('mail.emptySearchHint') : t('adminTable.emptyUserHint')"
            :action-label="params.email ? '' : t('addUser')"
            @action="openAdd"
          />
        </template>

        <template #error="{detail, retry}">
          <ErrorState
            :title="t('adminTable.loadFailed')"
            :description="t('adminTable.loadFailedHint')"
            :detail="detail"
            :retry-label="t('ui.retry')"
            :detail-label="t('adminTable.errorDetail')"
            @retry="retry"
          />
        </template>
      </DataTable>
    </div>

    <!-- 新增用户：邮箱前缀 + 域名下拉，和注册页同一套语义 -->
    <Dialog v-model:open="showAdd" :title="t('addUser')" size="sm">
      <div class="grid gap-3">
        <Field :label="t('userEmail')" required>
          <template #default="{id, invalid}">
            <div class="flex items-center gap-1.5">
              <Input
                :id="id"
                v-model="addForm.email"
                :invalid="invalid"
                class="min-w-0 flex-1"
                :placeholder="t('auth.emailPrefixPlaceholder')"
              />
              <Select
                v-model="addForm.suffix"
                :options="domainOptions"
                class="w-40 shrink-0"
                :aria-label="t('auth.domainSelect')"
              />
            </div>
          </template>
        </Field>

        <Field :label="t('password')" required>
          <template #default="{id, invalid}">
            <Input
              :id="id"
              v-model="addForm.password"
              type="password"
              :invalid="invalid"
              :placeholder="t('password')"
            />
          </template>
        </Field>

        <Field :label="t('role')" required>
          <template #default="{id, invalid}">
            <Select
              :id="id"
              v-model="addForm.type"
              :invalid="invalid"
              :options="roleOptions"
              :placeholder="t('select')"
            />
          </template>
        </Field>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showAdd = false">{{ t('cancel') }}</Button>
        <Button variant="primary" :loading="addLoading" @click="onSubmitAdd">{{ t('add') }}</Button>
      </template>
    </Dialog>

    <!-- 改密码 -->
    <Dialog v-model:open="showPwd" :title="t('changePassword')" size="sm" @update:open="!$event && resetUserForm()">
      <Field :label="t('password')" required :hint="t('adminTable.pwdHint')">
        <template #default="{id, invalid, describedBy}">
          <Input
            :id="id"
            v-model="userForm.password"
            type="password"
            :invalid="invalid"
            :aria-describedby="describedBy"
            :placeholder="t('password')"
          />
        </template>
      </Field>

      <template #footer>
        <Button variant="ghost" @click="showPwd = false">{{ t('cancel') }}</Button>
        <Button variant="primary" :loading="formLoading" @click="onSubmitPwd">{{ t('confirm') }}</Button>
      </template>
    </Dialog>

    <!-- 改身份：超级管理员不在 role 表里，只读显示 -->
    <Dialog v-model:open="showType" :title="t('setRole')" size="sm" @update:open="!$event && resetUserForm()">
      <Field :label="t('role')">
        <template #default="{id}">
          <Input v-if="userForm.type === 0" :id="id" :model-value="t('admin')" readonly />
          <Select v-else :id="id" v-model="userForm.type" :options="roleOptions" :placeholder="t('select')" />
        </template>
      </Field>

      <template #footer>
        <Button variant="ghost" @click="showType = false">{{ t('cancel') }}</Button>
        <Button
          variant="primary"
          :loading="formLoading"
          :disabled="userForm.type === 0"
          @click="onSubmitType"
        >
          {{ t('confirm') }}
        </Button>
      </template>
    </Dialog>

    <!-- 用户的邮箱：服务端的 total 含用户主邮箱，列表不含（account-service.allAccount） -->
    <Dialog v-model:open="showAccounts" :title="t('userEmail')" size="md">
      <DataTable
        :columns="accountColumns"
        :rows="accountRows"
        row-key="accountId"
        :aria-label="t('userEmail')"
        :loading="accountLoading"
        :error="accountErrorDetail"
        :skeleton-rows="3"
        :page="accountParams.num"
        :page-size="accountParams.size"
        :total="accountParams.total"
        scroll-class="max-h-80"
        @update:page="setAccountPage"
        @retry="openAccountList(accountParams.userId)"
      >
        <template #cell-actions="{row}">
          <Button
            v-perm="'email:delete'"
            variant="ghost"
            size="icon-sm"
            :label="t('delete')"
            @click="askDeleteAccount(row)"
          >
            <IconTrash class="size-4" />
          </Button>
        </template>
        <template #empty>
          <EmptyState :icon="IconMailbox" :title="t('adminTable.emptyAccount')" />
        </template>
        <template #error="{detail, retry}">
          <ErrorState
            :title="t('adminTable.loadFailed')"
            :detail="detail"
            :retry-label="t('ui.retry')"
            :detail-label="t('adminTable.errorDetail')"
            @retry="retry"
          />
        </template>
      </DataTable>
    </Dialog>

    <!-- 用户详情：不再按屏宽补漏，永远显示全部字段 -->
    <Dialog v-model:open="showDetails" :title="t('userDetails')" size="md">
      <dl v-if="details" class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <template v-if="details.username">
          <dt class="text-fg-muted">LinuxDo</dt>
          <dd class="flex items-center gap-2">
            <Avatar :src="details.avatar" :name="details.username" size="sm" />
            <span class="truncate text-fg">{{ details.username }}</span>
            <Badge tone="success" appearance="subtle">{{ t('trustLevel') }} {{ details.trustLevel }}</Badge>
          </dd>
        </template>

        <dt class="text-fg-muted">{{ t('userEmail') }}</dt>
        <dd class="truncate text-fg">{{ details.email }}</dd>

        <dt class="text-fg-muted">{{ t('perm') }}</dt>
        <dd class="text-fg">{{ roleName(details.type) }}</dd>

        <dt class="text-fg-muted">{{ t('tabStatus') }}</dt>
        <dd>
          <Badge v-if="details.isDel === 1" tone="neutral">{{ t('deleted') }}</Badge>
          <Badge v-else-if="details.status === 0" tone="success" appearance="subtle">{{ t('active') }}</Badge>
          <Badge v-else tone="danger">{{ t('banned') }}</Badge>
        </dd>

        <dt class="text-fg-muted">{{ t('tabReceived') }}</dt>
        <dd class="um-tnum text-fg">{{ countOf(details, 'receive') }}</dd>

        <dt class="text-fg-muted">{{ t('tabSent') }}</dt>
        <dd class="um-tnum text-fg">{{ countOf(details, 'send') }}</dd>

        <dt class="text-fg-muted">{{ t('tabMailboxes') }}</dt>
        <dd class="um-tnum text-fg">{{ countOf(details, 'account') }}</dd>

        <dt class="text-fg-muted">{{ t('tabRegisteredAt') }}</dt>
        <dd class="um-tnum text-fg">{{ formatTime(details.createTime) }}</dd>

        <dt class="text-fg-muted">{{ t('registrationIp') }}</dt>
        <dd class="um-tnum text-fg">{{ details.createIp || t('unknown') }}</dd>

        <dt class="text-fg-muted">{{ t('recentIP') }}</dt>
        <dd class="um-tnum text-fg">{{ details.activeIp || t('unknown') }}</dd>

        <dt class="text-fg-muted">{{ t('recentActivity') }}</dt>
        <dd class="um-tnum text-fg">
          {{ details.activeTime ? formatTime(details.activeTime, 'YYYY-MM-DD') : t('unknown') }}
        </dd>

        <dt class="text-fg-muted">{{ t('loginDevice') }}</dt>
        <dd class="text-fg">{{ details.device || t('unknown') }}</dd>

        <dt class="text-fg-muted">{{ t('loginSystem') }}</dt>
        <dd class="text-fg">{{ details.os || t('unknown') }}</dd>

        <dt class="text-fg-muted">{{ t('browserLogin') }}</dt>
        <dd class="text-fg">{{ details.browser || t('unknown') }}</dd>

        <dt class="text-fg-muted">{{ t('sendEmail') }}</dt>
        <dd class="flex flex-wrap items-center gap-2">
          <span class="um-tnum text-fg">{{ sendCountText(details) }}</span>
          <Badge v-if="details.sendAction?.hasPerm" appearance="subtle">{{ sendTypeText(details) }}</Badge>
          <Button
            v-if="details.sendAction?.hasPerm && details.sendAction?.sendCount"
            variant="secondary"
            size="sm"
            @click="resetSendCount(details)"
          >
            {{ t('reset') }}
          </Button>
        </dd>
      </dl>
    </Dialog>

    <!-- 删除 / 封禁 / 恢复：替代 ElMessageBox.confirm，焦点默认落在「取消」 -->
    <AlertDialog
      v-model:open="confirmOpen"
      :title="confirmData.title"
      :description="confirmData.description"
      :confirm-text="confirmData.confirmText"
      :cancel-text="t('cancel')"
      :tone="confirmData.tone"
      :loading="confirmLoading"
      @confirm="runConfirm"
    />
  </div>
</template>
