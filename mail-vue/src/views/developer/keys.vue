<script setup>
/**
 * 开发者中心 · API Keys（§5.3.5 / §4.4）
 *
 * 三处不同于别的管理表，都是被「凭据」这件事的性质逼出来的：
 *
 * 1. **明文只在创建响应里出现一次**。`apiKeyAdd()` 的返回值里有 `key`，这是唯一一次；
 *    关掉那个 Dialog 之后库里只剩 `prefix + salt + hash`，谁也拿不回来。所以关闭按钮
 *    上写的是「我已保存」而不是「关闭」，且**不允许点遮罩/Esc 关掉**（`dismissible=false`）
 *    —— 误触关掉等于这把 Key 白建了。
 * 2. **停用不是删除**。停用后再调 `/open/*` 立刻 401，但历史日志还挂在这把 Key 上；
 *    删除是软删，同样保留日志（`api-key-service` 的第 3 条规矩）。两个动作都在行菜单里，
 *    删除走 AlertDialog。
 * 3. **排序在前端做**。`/apiKey/list` 返回全量（单用户上限 20 把），所以不传
 *    `total`/`pageSize` —— 画一个只有一页的分页器是噪音，DataTable 自己也会藏。
 *
 * 「过期」不是一个状态位而是算出来的（服务端 `list()` 里的 `expired`）：不需要 cron
 * 去翻状态，也不会出现「已过期但状态还是启用」的中间态。状态列因此有三档：
 * 启用 / 停用 / 已过期，而 `status` 字段只有两档。
 */
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import IconPlus from '~icons/lucide/plus'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconEllipsis from '~icons/lucide/ellipsis'
import IconKey from '~icons/lucide/key-round'
import IconAlert from '~icons/lucide/triangle-alert'
import {
    AlertDialog, Badge, Button, Checkbox, Code, CopyButton, DataTable, Dialog,
    DropdownMenu, Field, Input, MenuItem, MenuSeparator, Select,
} from '@/components/ui'
import {DeveloperNav, EmptyState, ErrorState} from '@/components/composite'
import {toast} from '@/components/ui/Toast/toast.js'
import {useSelection} from '@/composables/useSelection.js'
import {openApiBase} from '@/enums/open-api-enum.js'
import {hasPerm} from '@/perm/perm.js'
import {apiKeyAdd, apiKeyDelete, apiKeyList, apiKeyScopes, apiKeySetStatus} from '@/request/api-key.js'
import {fromNow} from '@/utils/day.js'

defineOptions({name: 'developer-keys'})

const {t} = useI18n()

const list = ref([])
const loading = ref(true)
const error = ref(null)

const canAdd = computed(() => hasPerm('api-key:add'))
const canSet = computed(() => hasPerm('api-key:set'))
const canDelete = computed(() => hasPerm('api-key:delete'))

/* ------------------------------------------------------------------ 列与排序 */

const columns = computed(() => [
    {key: 'name', label: t('developer.keyName'), minWidth: '140px', truncate: true},
    {key: 'prefix', label: t('developer.keyPrefix'), width: '170px'},
    {key: 'scopes', label: t('developer.keyScopes'), minWidth: '160px'},
    {key: 'lastUsedTime', label: t('developer.lastUsed'), width: '130px', sortable: true},
    {key: 'status', label: t('developer.keyStatus'), width: '96px'},
    {key: 'actions', label: t('adminTable.actions'), width: '68px', align: 'end', cardHidden: true},
])

/** 默认不排序：服务端已按 keyId 倒序给了，也就是「最近建的在上」 */
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
        // 从没用过的 Key（lastUsedTime 为 null）沉底且不跟着方向翻
        if (x == null || y == null) {
            return x == null ? (y == null ? 0 : 1) : -1
        }
        return x === y ? 0 : (x > y ? dir : -dir)
    })
})

const selection = useSelection(rows, {idKey: 'keyId'})

/* ---------------------------------------------------------------- 列表请求 */

async function getList() {
    loading.value = true
    error.value = null
    try {
        // noMsg：失败画进 DataTable 的 error 态，不再弹 toast
        const data = await apiKeyList({noMsg: true})
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

getList()

/* ------------------------------------------------------------------ 时间 */

/**
 * 「最近使用」用相对时间（§5.3.5 的示例是「2 分钟前 / 3 天前 / 90 天前」）。
 *
 * 用项目自己的 [[fromNow]] 而不是 dayjs 的 `.fromNow()`：`utils/day.js` 只 extend 了
 * `utc` 与 `timezone`，没有 `relativeTime` —— 直接调 `.fromNow()` 是运行时 TypeError。
 * 这个helper 还顺带处理了「入参是 UTC 字符串」和中英两套措辞，与邮件列表同一口径。
 */
function formatLastUsed(value) {
    return value ? fromNow(value) : null
}

/* -------------------------------------------------------------------- 新增 */

/**
 * scope 清单从服务端拉（`/apiKey/scopes`）。硬编码在前端等于同一份映射维护两遍
 * —— 服务端加一个 scope、前端忘了加，用户就永远勾不到那一项。
 */
const scopeOptions = ref([])

apiKeyScopes({noMsg: true}).then((data) => {
    scopeOptions.value = Array.isArray(data) ? data : []
}).catch(() => {
    // 拉不到就让创建弹窗显示空清单 + 提示，而不是弹一个用户看不懂的 toast
    scopeOptions.value = []
})

/** 过期时间：30/90/365/永不（§5.3.5）。`0` = 永不，与服务端 `expireDays` 的口径一致 */
const expireOptions = computed(() => [
    {label: t('developer.expire30'), value: 30},
    {label: t('developer.expire90'), value: 90},
    {label: t('developer.expire365'), value: 365},
    {label: t('developer.expireNever'), value: 0},
])

const showAdd = ref(false)
const addLoading = ref(false)
const addForm = reactive({name: '', scopes: [], expireDays: 30})

function openAdd() {
    addForm.name = ''
    addForm.scopes = []
    addForm.expireDays = 30
    showAdd.value = true
}

function toggleScope(key, checked) {
    const next = new Set(addForm.scopes)
    checked ? next.add(key) : next.delete(key)
    addForm.scopes = [...next]
}

/* 创建成功后的一次性明文（§5.3.5：只显示一次） */
const showPlain = ref(false)
const plainKey = ref('')

/**
 * cURL 片段的基址走 [[openApiBase]]，不自己拼 `location.origin + '/open/...'` ——
 * `index.js` 只把 `/api/` 前缀的请求交给 hono，少了 `VITE_BASE_URL` 那一段就是 404。
 * 三个页面（这里、调试台、文档页）共用同一个函数，才不会出现「文档里的命令能跑、
 * Key 创建后给的命令跑不通」。
 */
const curlSnippet = computed(() => [
    `curl -H "Authorization: Bearer ${plainKey.value}" \\`,
    `  ${openApiBase({absolute: true})}/open/email/list?size=20`,
].join('\n'))

async function submit() {
    if (!addForm.name.trim()) {
        toast.error(t('developer.emptyKeyName'))
        return
    }
    if (addForm.scopes.length === 0) {
        toast.error(t('developer.emptyKeyScope'))
        return
    }
    addLoading.value = true
    try {
        const data = await apiKeyAdd({
            name: addForm.name.trim(),
            scopes: addForm.scopes.join(','),
            expireDays: addForm.expireDays,
        })
        showAdd.value = false
        plainKey.value = String(data?.key ?? '')
        showPlain.value = true
        await getList()
    } finally {
        addLoading.value = false
    }
}

/** 明文弹窗关掉的同时把它从内存里清掉 —— 没必要让它继续留在 Vue 的响应式树上 */
function closePlain() {
    showPlain.value = false
    plainKey.value = ''
}

/* ---------------------------------------------------------- 停用 / 启用 / 删除 */

async function setStatus(row, status) {
    await apiKeySetStatus(row.keyId, status)
    toast.success(status === 1 ? t('developer.keyDisabled') : t('developer.keyEnabled'))
    await getList()
}

const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmData = ref({title: '', description: '', confirmText: '', run: null})

function ask(next) {
    confirmData.value = {description: '', ...next}
    confirmOpen.value = true
}

function askDelete(row) {
    ask({
        title: t('delConfirm', {msg: row.name}),
        description: t('developer.delKeyHint'),
        confirmText: t('delete'),
        run: () => apiKeyDelete([row.keyId]).then(() => toast.success(t('delSuccessMsg'))),
    })
}

function askBatchDelete() {
    const ids = [...selection.ids.value]
    ask({
        title: t('developer.delKeysConfirm', {n: ids.length}),
        description: t('developer.delKeyHint'),
        confirmText: t('delete'),
        run: () => apiKeyDelete(ids).then(() => toast.success(t('delSuccessMsg'))),
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
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <!-- 工具条：主行动在左，导航与刷新在右（§7.9） -->
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <Button v-if="canAdd" variant="primary" size="sm" @click="openAdd">
        <IconPlus class="size-4" />
        {{ t('developer.createKey') }}
      </Button>
      <DeveloperNav class="ml-auto" />
      <Button variant="ghost" size="icon-sm" :label="t('mail.refresh')" @click="getList">
        <IconRefresh class="size-4" />
      </Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col p-4">
      <DataTable
        v-model:sort="sort"
        :columns="columns"
        :rows="rows"
        row-key="keyId"
        :aria-label="t('developer.keys')"
        :loading="loading"
        :error="errorDetail || Boolean(error)"
        :selectable="canDelete"
        :selection="selection"
        class="min-h-0 flex-1"
        scroll-class="min-h-0"
        @retry="getList"
        @empty-action="openAdd"
      >
        <template #cell-name="{value}">
          <span class="truncate text-fg">{{ value }}</span>
        </template>

        <!-- 只显示前缀：明文库里没有，谁也拿不回来 -->
        <template #cell-prefix="{value}">
          <span class="font-mono text-mono text-fg-muted">{{ value }}…</span>
        </template>

        <template #cell-scopes="{value}">
          <div class="flex flex-wrap gap-1">
            <Badge v-for="scope in value" :key="scope" size="sm">{{ scope }}</Badge>
            <span v-if="!value?.length" class="text-fg-muted">—</span>
          </div>
        </template>

        <template #cell-lastUsedTime="{value}">
          <span v-if="value" class="text-fg-muted">{{ formatLastUsed(value) }}</span>
          <span v-else class="text-fg-subtle">{{ t('developer.neverUsed') }}</span>
        </template>

        <!-- 三档：已过期优先于停用（过期的 Key 即使 status=0 也调不通） -->
        <template #cell-status="{row}">
          <Badge v-if="row.expired" tone="warning" dot size="sm">{{ t('expired') }}</Badge>
          <Badge v-else-if="row.status === 1" tone="neutral" dot size="sm">{{ t('developer.disabled') }}</Badge>
          <Badge v-else tone="success" dot size="sm">{{ t('developer.enabled') }}</Badge>
        </template>

        <template #cell-actions="{row}">
          <DropdownMenu align="end">
            <template #trigger>
              <Button variant="ghost" size="icon-sm" :label="t('ui.more')">
                <IconEllipsis class="size-4" />
              </Button>
            </template>
            <MenuItem v-if="canSet && row.status === 1" @select="setStatus(row, 0)">
              {{ t('developer.enable') }}
            </MenuItem>
            <MenuItem v-else-if="canSet" @select="setStatus(row, 1)">
              {{ t('developer.disable') }}
            </MenuItem>
            <template v-if="canDelete">
              <MenuSeparator />
              <MenuItem tone="danger" @select="askDelete(row)">{{ t('delete') }}</MenuItem>
            </template>
          </DropdownMenu>
        </template>

        <template #actions="{count}">
          <Button variant="danger" size="sm" @click="askBatchDelete">
            {{ t('adminTable.batchDelete') }}（{{ count }}）
          </Button>
        </template>

        <template #empty>
          <EmptyState
            :icon="IconKey"
            :title="t('developer.emptyKeys')"
            :description="t('developer.emptyKeysHint')"
            :action-label="canAdd ? t('developer.createKey') : ''"
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

        <template #footer>{{ t('ui.totalCount', {n: list.length}) }}</template>
      </DataTable>
    </div>

    <!-- 创建：名称 → scopes → 过期时间（§5.3.5 的三步） -->
    <Dialog v-model:open="showAdd" :title="t('developer.createKey')" size="md">
      <div class="grid gap-3">
        <Field :label="t('developer.keyName')" :hint="t('developer.keyNameHint')" required>
          <template #default="{id, invalid}">
            <Input
              :id="id"
              v-model="addForm.name"
              :invalid="invalid"
              :maxlength="30"
              :placeholder="t('developer.keyNamePlaceholder')"
            />
          </template>
        </Field>

        <Field :label="t('developer.keyScopes')" :hint="t('developer.keyScopesHint')" required>
          <div class="grid gap-2 rounded-md border border-line p-3">
            <!-- `allowed === false`：你的身份没有对应的站内权限，勾了服务端也会拒（scope 只能收窄、不能放大） -->
            <Checkbox
              v-for="scope in scopeOptions"
              :key="scope.key"
              :model-value="addForm.scopes.includes(scope.key)"
              :label="scope.key"
              :hint="scope.allowed === false ? t('developer.scopeNotInRole') : scope.paths?.join('  ')"
              :disabled="scope.allowed === false"
              size="sm"
              @update:model-value="toggleScope(scope.key, $event)"
            />
            <p v-if="!scopeOptions.length" class="text-caption text-fg-muted">
              {{ t('developer.scopesUnavailable') }}
            </p>
          </div>
        </Field>

        <Field :label="t('developer.expireIn')">
          <template #default="{id}">
            <Select :id="id" v-model="addForm.expireDays" :options="expireOptions" />
          </template>
        </Field>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showAdd = false">{{ t('cancel') }}</Button>
        <Button variant="primary" :loading="addLoading" @click="submit">{{ t('add') }}</Button>
      </template>
    </Dialog>

    <!--
      一次性明文（§5.3.5）。`dismissible=false` + 没有右上角关闭按钮：
      误触遮罩关掉等于这把 Key 白建了，只能从「我已保存」这一条路走出去。
    -->
    <Dialog
      v-model:open="showPlain"
      :title="t('developer.plainTitle')"
      size="xl"
      :closable="false"
      :dismissible="false"
    >
      <div class="grid gap-3">
        <div class="flex items-start gap-2 rounded-md border border-warning-line bg-warning-subtle p-3">
          <IconAlert class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p class="text-caption text-fg">{{ t('developer.plainWarning') }}</p>
        </div>

        <div class="flex items-center gap-1.5">
          <Code variant="block" wrap class="min-w-0 flex-1">{{ plainKey }}</Code>
          <CopyButton :value="plainKey" :label="t('developer.copyKey')" />
        </div>

        <div class="grid gap-1.5">
          <p class="text-label text-fg-muted">{{ t('developer.curlExample') }}</p>
          <div class="flex items-start gap-1.5">
            <Code variant="block" wrap class="min-w-0 flex-1">{{ curlSnippet }}</Code>
            <CopyButton :value="curlSnippet" :label="t('developer.copyCurl')" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="primary" @click="closePlain">{{ t('developer.plainSaved') }}</Button>
      </template>
    </Dialog>

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
  </div>
</template>
