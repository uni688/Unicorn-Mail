<script setup>
/**
 * 权限身份 — 管理域表格页第二张（§10.4 / §6.2）
 *
 * 和注册码同一套骨架（工具条 + `DataTable`，全量列表所以没有分页器），差别都在表单里：
 *
 * 1. **权限树**换成 L1 `Tree`（`cascade` + `checkbox`）。提交仍然是
 *    `permIds = [...选中, ...半选]` —— 后端 `role-perm` 表按 permId 存，半选的父节点
 *    也要落库，否则菜单级的权限会丢。`Tree` 把半选 key 单独发出来正是为了这个。
 * 2. **发信额度 / 邮箱数量**这两个数字输入框长在树节点上（`email:send` 与 `account:add`
 *    两行）。`Tree` 的 `#item` 插槽外面有一层「表单控件自己吃掉 keydown」的挡板，
 *    所以输入框里的方向键不会被树的 ←/→ 抢走。
 * 3. **可用域名**用多选 `Select`。旧代码的 `filterable + allow-create` 是摆设：
 *    `availDomainChange()` 会立刻把不在 `domainList` 里的值删掉，等于只能选不能填。
 * 4. **拦截邮箱**用 `TagsInput`，逗号（中英文都认）分隔，非邮箱/域名/`*` 的输入直接
 *    丢掉并提示 —— 旧的 `banEmailAddTag` 是静默丢，用户不知道自己打错了。
 *
 * 顺手修掉旧页面两个 bug：删除成功弹的是「复制成功」（`copySuccessMsg`），
 * 确认框的取消按钮文案写的是 `t('confirm')`（两个按钮都叫「确定」）。
 */
import {computed, nextTick, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import IconPlus from '~icons/lucide/plus'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconEllipsis from '~icons/lucide/ellipsis'
import IconShield from '~icons/lucide/shield'
import IconInfo from '~icons/lucide/info'
import {
    AlertDialog, Badge, Button, DataTable, Dialog, DropdownMenu, Field, Input,
    MenuItem, MenuSeparator, NumberInput, Popover, Segmented, Select, TagsInput, Tree,
} from '@/components/ui'
import {EmptyState, ErrorState} from '@/components/composite'
import {toast} from '@/components/ui/Toast/toast.js'
import {hasPerm} from '@/perm/perm.js'
import {roleAdd, roleDelete, rolePermTree, roleRoleList, roleSet, roleSetDef} from '@/request/role.js'
import {useRoleStore} from '@/store/role.js'
import {useSettingStore} from '@/store/setting.js'
import {useUserStore} from '@/store/user.js'
import {isDomain, isEmail} from '@/utils/verify-utils.js'

defineOptions({name: 'role'})

const {t} = useI18n()
const {domainList} = useSettingStore()
const userStore = useUserStore()
const roleStore = useRoleStore()

const rows = ref([])
const loading = ref(true)
const error = ref(null)

const canSet = computed(() => hasPerm('role:set'))
const canDelete = computed(() => hasPerm('role:delete'))

/* -------------------------------------------------------------------- 列表 */

const columns = computed(() => [
    {key: 'name', label: t('role'), minWidth: '160px', truncate: true},
    {key: 'sort', label: t('order'), width: '90px', align: 'end'},
    {key: 'description', label: t('description'), minWidth: '180px', truncate: true},
    {key: 'actions', label: t('admin.actions'), width: '68px', align: 'end', cardHidden: true},
])

async function getList() {
    loading.value = true
    error.value = null
    try {
        const data = await roleRoleList({noMsg: true})
        rows.value = Array.isArray(data) ? data : []
    } catch (e) {
        error.value = e
        rows.value = []
    } finally {
        loading.value = false
    }
}

const errorDetail = computed(() => String(error.value?.message ?? ''))

getList()

/* ---------------------------------------------------------------- 权限树数据 */

const treeItems = ref([])

rolePermTree().then((data) => {
    treeItems.value = Array.isArray(data) ? data : []
})

/* -------------------------------------------------------------------- 表单 */

const showForm = ref(false)
/** @type {'add'|'set'} */
const formMode = ref('add')
const formLoading = ref(false)
let editing = {}

const form = reactive({
    name: '',
    description: '',
    banEmail: [],
    sendType: 'count',
    sendCount: 0,
    accountCount: 0,
    sort: 0,
    availDomain: [],
})

/** 选中 + 半选：两份都要提交（见文件头注释 2） */
const checkedPerms = ref([])
const halfCheckedPerms = ref([])
const treeRef = ref(null)
const expandAll = ref(false)

const domainOptions = domainList.map((domain) => {
    const clean = domain.replace(/^@/, '')
    return {label: clean, value: clean}
})

const sendTypeOptions = computed(() => [
    {label: t('total'), value: 'count'},
    {label: t('daily'), value: 'day'},
    {label: t('internal'), value: 'internal'},
    {label: t('btnBan'), value: 'ban'},
])

const expandItems = computed(() => [
    {label: t('expand'), value: true},
    {label: t('collapse'), value: false},
])

watch(expandAll, (value) => {
    if (value) {
        treeRef.value?.expandAll()
    } else {
        treeRef.value?.collapseAll()
    }
})

/** 只有 count / day 这两种额度才需要填数字，站内与禁用没有「多少封」可言 */
const showSendCount = computed(() => form.sendType === 'count' || form.sendType === 'day')

/** 非邮箱 / 非域名 / 非 `*` 一律丢掉并说明原因（旧实现静默丢） */
function onBanEmailUpdate(value) {
    const next = []
    let dropped = false
    for (const raw of value) {
        const item = String(raw).trim()
        if (!item) continue
        if (isEmail(item) || isDomain(item) || item === '*') {
            if (!next.includes(item)) next.push(item)
        } else {
            dropped = true
        }
    }
    if (dropped) {
        toast.error(t('notEmailMsg'))
    }
    form.banEmail = next
}

function resetForm() {
    form.name = ''
    form.description = ''
    form.banEmail = []
    form.sendType = 'count'
    form.sendCount = 0
    form.accountCount = 0
    form.sort = 0
    form.availDomain = []
    checkedPerms.value = []
    halfCheckedPerms.value = []
}

watch(showForm, (open) => {
    if (!open) resetForm()
})

function openAdd() {
    formMode.value = 'add'
    resetForm()
    showForm.value = true
}

function openEdit(role) {
    editing = role
    formMode.value = 'set'
    form.name = role.name ?? ''
    form.description = role.description ?? ''
    form.banEmail = [...(role.banEmail ?? [])]
    form.sendType = role.sendType ?? 'count'
    form.sendCount = role.sendCount ?? 0
    form.accountCount = role.accountCount ?? 0
    form.sort = role.sort ?? 0
    form.availDomain = [...(role.availDomain ?? [])]
    showForm.value = true
    // 树要等自己挂上来才吃得下选中项
    nextTick(() => {
        checkedPerms.value = [...(role.permIds ?? [])]
    })
}

async function submit() {
    if (!form.name) {
        toast.error(t('emptyRoleNameMsg'))
        return
    }
    const params = {
        ...form,
        permIds: [...checkedPerms.value, ...halfCheckedPerms.value],
    }
    formLoading.value = true
    try {
        if (formMode.value === 'add') {
            await roleAdd(params)
            toast.success(t('addSuccessMsg'))
            roleStore.refreshSelect()
        } else {
            await roleSet({...params, roleId: editing.roleId})
            toast.success(t('saveSuccessMsg'))
            // 改了名字，所有用到身份下拉的地方都得跟着刷
            if (editing.name !== params.name) {
                roleStore.refreshSelect()
            }
        }
        showForm.value = false
        await getList()
    } finally {
        formLoading.value = false
    }
}

/* ---------------------------------------------------- 设为默认 / 删除 */

const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmData = ref({title: '', description: '', confirmText: '', tone: 'danger', run: null})

function askDelete(role) {
    confirmData.value = {
        title: t('delConfirm', {msg: role.name}),
        description: t('admin.delRoleHint'),
        confirmText: t('delete'),
        tone: 'danger',
        run: async () => {
            await roleDelete(role.roleId)
            toast.success(t('delSuccessMsg'))
            userStore.refreshUserList()
            roleStore.refreshSelect()
        },
    }
    confirmOpen.value = true
}

function askSetDefault(role) {
    confirmData.value = {
        title: t('admin.setDefaultConfirm', {msg: role.name}),
        description: t('admin.setDefaultHint'),
        confirmText: t('confirm'),
        tone: 'default',
        run: async () => {
            await roleSetDef(role.roleId)
            toast.success(t('saveSuccessMsg'))
        },
    }
    confirmOpen.value = true
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
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <Button v-perm="'role:add'" variant="primary" size="sm" @click="openAdd">
        <IconPlus class="size-4" />
        {{ t('addRoleTitle') }}
      </Button>
      <div class="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="getList">
          <IconRefresh class="size-4" />
        </Button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col p-4">
      <DataTable
        :columns="columns"
        :rows="rows"
        row-key="roleId"
        :aria-label="t('permissions')"
        :loading="loading"
        :error="errorDetail || Boolean(error)"
        class="min-h-0 flex-1"
        scroll-class="min-h-0"
        @retry="getList"
        @empty-action="openAdd"
      >
        <template #cell-name="{row, value}">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-fg">{{ value }}</span>
            <Badge v-if="row.isDefault" tone="accent" appearance="subtle">{{ t('default') }}</Badge>
          </div>
        </template>

        <template #cell-sort="{value}">
          <span class="um-tnum text-fg-muted">{{ value }}</span>
        </template>

        <template #cell-actions="{row}">
          <DropdownMenu align="end">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" :label="t('ui.more')">
                <IconEllipsis class="size-4" />
              </Button>
            </template>
            <MenuItem v-if="canSet" @select="openEdit(row)">{{ t('change') }}</MenuItem>
            <MenuItem v-if="canSet && !row.isDefault" @select="askSetDefault(row)">
              {{ t('admin.setDefault') }}
            </MenuItem>
            <template v-if="canDelete && !row.isDefault">
              <MenuSeparator />
              <MenuItem tone="danger" @select="askDelete(row)">{{ t('delete') }}</MenuItem>
            </template>
          </DropdownMenu>
        </template>

        <template #empty>
          <EmptyState
            :icon="IconShield"
            :title="t('admin.emptyRole')"
            :description="t('admin.emptyRoleHint')"
            :action-label="t('addRoleTitle')"
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

        <template #footer>{{ t('ui.totalCount', {n: rows.length}) }}</template>
      </DataTable>
    </div>

    <!-- 新增 / 修改 -->
    <Dialog
      v-model:open="showForm"
      :title="formMode === 'add' ? t('addRoleTitle') : t('changeRoleTitle')"
      size="lg"
    >
      <template #header>
        <Popover :title="t('featDesc')" width="w-80" side="bottom" align="end">
          <template #trigger>
            <Button variant="ghost" size="icon-sm" :label="t('featDesc')">
              <IconInfo class="size-4" />
            </Button>
          </template>
          <div class="grid gap-3 text-caption">
            <div>
              <p class="text-label text-fg">{{ t('emailInterception') }}</p>
              <p class="mt-0.5 text-fg-muted">{{ t('emailInterceptionDesc') }}</p>
            </div>
            <div>
              <p class="text-label text-fg">{{ t('availableDomains') }}</p>
              <p class="mt-0.5 text-fg-muted">{{ t('availableDomainsDesc') }}</p>
            </div>
          </div>
        </Popover>
      </template>

      <div class="grid gap-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <Field :label="t('roleName')" required>
            <template #default="{id, invalid}">
              <Input :id="id" v-model="form.name" :invalid="invalid" :maxlength="12" />
            </template>
          </Field>
          <Field :label="t('order')" :hint="t('admin.sortHint')">
            <template #default="{id}">
              <NumberInput :id="id" v-model="form.sort" :min="0" :max="9999" />
            </template>
          </Field>
        </div>

        <Field :label="t('description')" optional>
          <template #default="{id}">
            <Input :id="id" v-model="form.description" :maxlength="30" />
          </template>
        </Field>

        <Field :label="t('emailInterception')" optional :hint="t('admin.banEmailHint')">
          <template #default="{id}">
            <TagsInput
              :id="id"
              :model-value="form.banEmail"
              :delimiter="/[,，]/"
              :placeholder="t('admin.banEmailPlaceholder')"
              @update:model-value="onBanEmailUpdate"
            />
          </template>
        </Field>

        <Field :label="t('availableDomains')" optional :hint="t('admin.availDomainHint')">
          <template #default="{id}">
            <Select
              :id="id"
              v-model="form.availDomain"
              multiple
              :options="domainOptions"
              :placeholder="t('admin.availDomainAll')"
            />
          </template>
        </Field>

        <div class="grid gap-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-label text-fg">{{ t('permissions') }}</span>
            <Segmented v-model="expandAll" :items="expandItems" size="sm" :aria-label="t('expand')" />
          </div>

          <!-- 树自己滚：权限有二十多条，让整个弹窗跟着长会把按钮推出屏幕 -->
          <div class="max-h-64 overflow-y-auto rounded-md border border-line p-1.5">
            <Tree
              ref="treeRef"
              v-model="checkedPerms"
              :items="treeItems"
              item-key="permId"
              label-key="name"
              multiple
              cascade
              checkbox
              size="sm"
              :aria-label="t('permissions')"
              @update:indeterminate-keys="halfCheckedPerms = $event"
            >
              <template #item="{item, label}">
                <span class="truncate">{{ label }}</span>

                <!-- 发信额度：类型决定要不要填数字（§7.4 的「别问用不上的问题」） -->
                <span v-if="item.permKey === 'email:send'" class="flex items-center gap-1.5">
                  <NumberInput
                    v-if="showSendCount"
                    v-model="form.sendCount"
                    :min="0"
                    :max="99999"
                    size="sm"
                    class="w-24"
                    :aria-label="t('total')"
                  />
                  <Select
                    v-model="form.sendType"
                    :options="sendTypeOptions"
                    size="sm"
                    class="w-24"
                    :aria-label="t('admin.sendType')"
                  />
                </span>

                <span v-if="item.permKey === 'account:add'" class="flex items-center">
                  <NumberInput
                    v-model="form.accountCount"
                    :min="0"
                    :max="99999"
                    size="sm"
                    class="w-24"
                    :aria-label="t('total')"
                  />
                </span>
              </template>
            </Tree>
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showForm = false">{{ t('cancel') }}</Button>
        <Button variant="primary" :loading="formLoading" @click="submit">{{ t('save') }}</Button>
      </template>
    </Dialog>

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
