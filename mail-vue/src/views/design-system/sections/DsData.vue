<script setup>
/**
 * `/_ds` — DataTable 的四态与交互（§7.8 状态矩阵 + §6.2）
 *
 * 这一节是 DataTable 的人工过审入口：loading / empty / error / data 四态必须
 * 在**浅色与深色两套主题**下各看一遍（页头切主题），窄屏还要看到它退化成卡片列表。
 *
 * 空/错两态故意演示两种用法：不传插槽（组件内置兜底）与传 `EmptyState` /
 * `ErrorState`（真实页面里的样子）—— DataTable 在 L1，不能反向依赖 L2，
 * 所以带图标的版式必须由调用方传进来。
 */
import {computed, ref} from 'vue'
import IconInbox from '~icons/lucide/inbox'
import {Badge, Button, DataTable} from '@/components/ui'
import {EmptyState, ErrorState} from '@/components/composite'
import {useSelection} from '@/composables/useSelection.js'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const COLUMNS = [
    {key: 'userId', label: 'ID', width: '72px', sortable: true},
    {key: 'email', label: '邮箱', minWidth: '180px', truncate: true},
    {key: 'role', label: '角色', width: '110px'},
    {key: 'status', label: '状态', width: '96px'},
    {key: 'count', label: '收件数', width: '96px', align: 'end', sortable: true},
]

const ALL = [
    {userId: 1, email: 'ada@unicorn.mail', role: '管理员', status: 0, count: 1284},
    {userId: 2, email: 'grace.hopper@unicorn.mail', role: '普通用户', status: 0, count: 96},
    {userId: 3, email: 'alan@unicorn.mail', role: '普通用户', status: 1, count: 0},
    {userId: 4, email: 'a-very-long-address-that-must-truncate@unicorn.mail', role: '受限', status: 0, count: 7},
    {userId: 5, email: 'linus@unicorn.mail', role: '普通用户', status: 0, count: 42},
]

/* 数据态：真的接上排序 + 分页 + 选择，光看静态截图看不出交互对不对 */
const sort = ref({key: 'userId', order: 'desc'})
const page = ref(1)
const PAGE_SIZE = 3

const sorted = computed(() => {
    const {key, order} = sort.value
    const dir = order === 'asc' ? 1 : -1
    return [...ALL].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0))
})

const rows = computed(() => sorted.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const selection = useSelection(rows, {idKey: 'userId'})

const STATUS = {0: {tone: 'success', label: '正常'}, 1: {tone: 'danger', label: '封禁'}}
</script>

<template>
  <DsSection
    id="datatable"
    title="DataTable"
    note="真 <table> 语义 + 列配置数组；四态齐备，选择走 useSelection（全选只作用于本页）"
  >
    <DsRow label="state=data" note="排序 / 分页 / 选择都是真的：点表头、翻页、勾选试一下">
      <div class="w-full">
        <DataTable
          v-model:sort="sort"
          v-model:page="page"
          :columns="COLUMNS"
          :rows="rows"
          row-key="userId"
          aria-label="示例用户表"
          selectable
          :selection="selection"
          :page-size="PAGE_SIZE"
          :total="ALL.length"
        >
          <template #cell-status="{value}">
            <Badge :tone="STATUS[value].tone">{{ STATUS[value].label }}</Badge>
          </template>
          <template #actions="{count}">
            <Button variant="danger" size="sm">删除 {{ count }} 项</Button>
          </template>
        </DataTable>
      </div>
    </DsRow>

    <DsRow label="state=loading" note="骨架行，不是转圈遮罩 —— 表头留在原地，用户不丢上下文">
      <div class="w-full">
        <DataTable
          :columns="COLUMNS"
          :rows="[]"
          row-key="userId"
          aria-label="加载中的示例表"
          state="loading"
          :skeleton-rows="4"
          selectable
          :selection="selection"
        />
      </div>
    </DsRow>

    <DsRow label="state=empty + #empty" note="调用方传 EmptyState：图标 + 说明 + 主行动">
      <div class="w-full">
        <DataTable :columns="COLUMNS" :rows="[]" row-key="userId" aria-label="空的示例表" state="empty">
          <template #empty>
            <EmptyState
              :icon="IconInbox"
              title="还没有用户"
              description="邀请码注册或手动新建后，用户会出现在这里。"
              action-label="新建用户"
            />
          </template>
        </DataTable>
      </div>
    </DsRow>

    <DsRow label="state=empty（不传插槽）" note="兜底也不留白：至少有一句「暂无数据」">
      <div class="w-full">
        <DataTable :columns="COLUMNS" :rows="[]" row-key="userId" aria-label="空的示例表（兜底）" state="empty" />
      </div>
    </DsRow>

    <DsRow label="state=error + #error" note="错误态必须有出口 —— 重试按钮，外加折叠的原始报错">
      <div class="w-full">
        <DataTable
          :columns="COLUMNS"
          :rows="[]"
          row-key="userId"
          aria-label="出错的示例表"
          state="error"
          error="Request failed with status code 500"
        >
          <template #error="{detail, retry}">
            <ErrorState
              title="用户列表加载失败"
              description="请检查网络后重试。"
              :detail="detail"
              retry-label="重试"
              detail-label="查看详情"
              @retry="retry"
            />
          </template>
        </DataTable>
      </div>
    </DsRow>

    <DsRow label="layout=cards" note="`<md` 的样子（layout=auto 会自动切）：每行竖排成「列名: 值」">
      <div class="w-full max-w-96">
        <DataTable
          :columns="COLUMNS"
          :rows="rows"
          row-key="userId"
          aria-label="窄屏卡片示例"
          layout="cards"
          selectable
          :selection="selection"
        >
          <template #cell-status="{value}">
            <Badge :tone="STATUS[value].tone">{{ STATUS[value].label }}</Badge>
          </template>
        </DataTable>
      </div>
    </DsRow>

    <DsRow label="rowHeight" note="md=44px（默认，管理域）/ sm=36px（信息密度优先的场合）">
      <div class="w-full">
        <DataTable
          :columns="COLUMNS.slice(0, 3)"
          :rows="rows"
          row-key="userId"
          aria-label="紧凑行高示例"
          row-height="sm"
          layout="table"
        />
      </div>
    </DsRow>
  </DsSection>
</template>
