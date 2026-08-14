<script setup>
/** `/_ds` — 布局与导航类原语：Tabs / Collapsible / ScrollArea / Pagination / Tree */
import {ref} from 'vue'
import {Collapsible, Pagination, ScrollArea, TabPanel, Tabs, Tree} from '@/components/ui'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const tab = ref('inbox')
const page = ref(3)
const compactPage = ref(1)
const checkedKeys = ref(['mail:read'])
const selectedNode = ref(undefined)

const TAB_ITEMS = [
    {label: '收件箱', value: 'inbox', count: 12},
    {label: '已发送', value: 'sent'},
    {label: '草稿', value: 'draft', count: 2},
    {label: '垃圾箱', value: 'trash', disabled: true},
]

const FOLDER_TREE = [
    {
        id: 'system',
        label: '系统文件夹',
        children: [
            {id: 'inbox', label: '收件箱'},
            {id: 'sent', label: '已发送'},
            {id: 'trash', label: '垃圾箱'},
        ],
    },
    {
        id: 'custom',
        label: '自定义',
        children: [
            {id: 'bill', label: '账单', children: [{id: 'bill-2026', label: '2026'}]},
            {id: 'sub', label: '订阅'},
        ],
    },
]

const PERMISSION_TREE = [
    {
        id: 'mail',
        label: '邮件',
        children: [
            {id: 'mail:read', label: '查看'},
            {id: 'mail:send', label: '发送'},
            {id: 'mail:delete', label: '删除'},
        ],
    },
    {
        id: 'user',
        label: '用户',
        children: [
            {id: 'user:read', label: '查看'},
            {id: 'user:ban', label: '封禁'},
        ],
    },
]
</script>

<template>
  <DsSection id="tabs" title="Tabs / TabPanel" note="切换的是「同一层级的不同区域」；activationMode=manual 用于面板要拉数据的场合">
    <DsRow label="variant=line" stack>
      <Tabs v-model="tab" :items="TAB_ITEMS" aria-label="邮件分类">
        <TabPanel v-for="item in TAB_ITEMS" :key="item.value" :value="item.value" class="text-body text-fg-muted">
          {{ item.label }} 的内容
        </TabPanel>
      </Tabs>
    </DsRow>

    <DsRow label="variant=segmented" stack>
      <Tabs :default-value="'inbox'" :items="TAB_ITEMS.slice(0, 3)" variant="segmented" aria-label="邮件分类（分段）">
        <TabPanel v-for="item in TAB_ITEMS.slice(0, 3)" :key="item.value" :value="item.value" class="text-body text-fg-muted">
          {{ item.label }}
        </TabPanel>
      </Tabs>
    </DsRow>

    <DsRow label="size" stack>
      <Tabs :default-value="'a'" size="sm" :items="[{label: 'sm 甲', value: 'a'}, {label: 'sm 乙', value: 'b'}]" aria-label="sm" />
      <Tabs :default-value="'a'" size="md" :items="[{label: 'md 甲', value: 'a'}, {label: 'md 乙', value: 'b'}]" aria-label="md" />
    </DsRow>

    <DsRow label="orientation=vertical" note="侧边设置页那种「左标签右内容」" stack>
      <Tabs :default-value="'inbox'" :items="TAB_ITEMS.slice(0, 3)" orientation="vertical" aria-label="竖排分类">
        <TabPanel v-for="item in TAB_ITEMS.slice(0, 3)" :key="item.value" :value="item.value" class="text-body text-fg-muted">
          {{ item.label }} 的内容
        </TabPanel>
      </Tabs>
    </DsRow>

    <DsRow label="activationMode=manual" note="方向键只移动焦点，回车/空格才切换（面板要发请求时用）" stack>
      <Tabs :default-value="'inbox'" :items="TAB_ITEMS.slice(0, 3)" activation-mode="manual" aria-label="手动切换">
        <TabPanel v-for="item in TAB_ITEMS.slice(0, 3)" :key="item.value" :value="item.value" class="text-body text-fg-muted">
          {{ item.label }}
        </TabPanel>
      </Tabs>
    </DsRow>
  </DsSection>

  <DsSection id="collapsible" title="Collapsible" note="侧栏分组、设置页的高级选项；unmount 省渲染但丢状态与高度动画">
    <DsRow label="title + defaultOpen" stack>
      <Collapsible title="高级选项" default-open>
        <p class="px-1.5 text-body text-fg-muted">展开后的内容。高度动画走 grid-rows，不会跳。</p>
      </Collapsible>
      <Collapsible title="默认收起">
        <p class="px-1.5 text-body text-fg-muted">点上面那行展开。</p>
      </Collapsible>
    </DsRow>

    <DsRow label="#trigger" note="需要在触发行放徽章/计数时用插槽" stack>
      <Collapsible default-open>
        <template #trigger>
          <span class="truncate">自定义文件夹</span>
          <span class="ml-auto text-caption text-fg-muted tabular-nums">4</span>
        </template>
        <p class="px-1.5 text-body text-fg-muted">插槽里可以放任何东西，但别放按钮（按钮套按钮）。</p>
      </Collapsible>
    </DsRow>

    <DsRow label="disabled / hideIndicator" stack>
      <Collapsible title="禁用（点不开）" disabled />
      <Collapsible title="不显示箭头" hide-indicator>
        <p class="px-1.5 text-body text-fg-muted">自己画指示器时关掉内置箭头。</p>
      </Collapsible>
    </DsRow>
  </DsSection>

  <DsSection id="scrollarea" title="ScrollArea" note="故意用原生滚动（不是 Reka 那套 JS 滚动条）：虚拟列表与 scrollIntoView 才可预期">
    <DsRow label="orientation=vertical" note="默认 focusable：容器自己能被 Tab 到并用方向键滚" stack>
      <ScrollArea aria-label="纵向滚动示例" class="h-32 rounded-md border border-line bg-canvas p-2">
        <p v-for="i in 12" :key="i" class="text-body text-fg-muted">第 {{ i }} 行内容</p>
      </ScrollArea>
    </DsRow>

    <DsRow label="scrollbar=thin" stack>
      <ScrollArea scrollbar="thin" aria-label="细滚动条" class="h-24 rounded-md border border-line bg-canvas p-2">
        <p v-for="i in 10" :key="i" class="text-body text-fg-muted">细条 {{ i }}</p>
      </ScrollArea>
    </DsRow>

    <DsRow label="fade" note="上下边缘渐隐提示「还有更多」；用 mask 实现，不必知道背景色" stack>
      <ScrollArea fade aria-label="边缘渐隐" class="h-32 rounded-md border border-line bg-canvas p-2">
        <p v-for="i in 12" :key="i" class="text-body text-fg-muted">渐隐 {{ i }}</p>
      </ScrollArea>
    </DsRow>

    <DsRow label="orientation=horizontal + scrollbar=hidden" note="横向 chips 条：靠手势滚，不占高度" stack>
      <ScrollArea
        orientation="horizontal"
        scrollbar="hidden"
        fade
        :focusable="false"
        class="rounded-md border border-line bg-canvas p-2"
      >
        <div class="flex w-max gap-2">
          <span v-for="i in 14" :key="i" class="rounded-full bg-inset px-2.5 py-1 text-caption text-fg-muted whitespace-nowrap">
            标签 {{ i }}
          </span>
        </div>
      </ScrollArea>
    </DsRow>
  </DsSection>

  <DsSection id="pagination" title="Pagination" note="管理端表格用；邮件列表是无限滚动，不用它。页码算法交给 reka，这里只管外观与中文 aria-label">
    <DsRow label="v-model:page + total" note="共 96 条 / 每页 10 条" stack>
      <Pagination v-model:page="page" :items-per-page="10" :total="96" aria-label="日志分页" />
      <p class="text-caption text-fg-muted">当前第 {{ page }} 页</p>
    </DsRow>

    <DsRow label="showEdges" note="加「首页 / 末页」" stack>
      <Pagination v-model:page="page" :items-per-page="10" :total="96" show-edges aria-label="带首末页" />
    </DsRow>

    <DsRow label="siblingCount" note="0 = 只显当前页；2 = 两侧各两个" stack>
      <Pagination :page="5" :items-per-page="10" :total="200" :sibling-count="0" aria-label="siblingCount 0" />
      <Pagination :page="5" :items-per-page="10" :total="200" :sibling-count="2" aria-label="siblingCount 2" />
    </DsRow>

    <DsRow label="size" stack>
      <Pagination :page="2" :items-per-page="10" :total="60" size="sm" aria-label="sm" />
      <Pagination :page="2" :items-per-page="10" :total="60" size="md" aria-label="md" />
    </DsRow>

    <DsRow label="compact" note="移动端：一排页码在 44px 触控目标下必然溢出" stack>
      <Pagination v-model:page="compactPage" :items-per-page="10" :total="96" compact aria-label="紧凑分页" />
    </DsRow>

    <DsRow label="边界 / disabled" note="total=0 时只有一页，两个方向键自己禁用" stack>
      <Pagination :page="1" :items-per-page="10" :total="0" aria-label="空数据" />
      <Pagination :page="3" :items-per-page="10" :total="96" disabled aria-label="禁用" />
    </DsRow>
  </DsSection>

  <DsSection id="tree" title="Tree" note="对外全是 key（后端收发的是 id 数组）；级联与半选自己算，reka 只负责 roving focus 与 ARIA">
    <DsRow label="导航型（无勾选框）" note="点整行 = 选中 + 展开" stack>
      <Tree
        v-model="selectedNode"
        :items="FOLDER_TREE"
        :default-expanded="['system']"
        aria-label="文件夹"
        class="rounded-md border border-line bg-canvas p-1.5"
      />
      <p class="text-caption text-fg-muted">选中 key：{{ selectedNode ?? '（无）' }}</p>
    </DsRow>

    <DsRow label="checkbox + multiple + cascade" note="权限树：勾父带全子，部分勾父半选；半选 key 要和选中 key 一起提交" stack>
      <Tree
        v-model="checkedKeys"
        :items="PERMISSION_TREE"
        checkbox
        multiple
        cascade
        default-expand-all
        aria-label="权限"
        class="rounded-md border border-line bg-canvas p-1.5"
      />
      <p class="text-caption text-fg-muted">选中：{{ checkedKeys.join(', ') || '（无）' }}</p>
    </DsRow>

    <DsRow label="#item" note="插槽拿到 {item, level, isSelected, isIndeterminate, label}" stack>
      <Tree
        :items="FOLDER_TREE"
        default-expand-all
        aria-label="自定义行"
        class="rounded-md border border-line bg-canvas p-1.5"
      >
        <template #item="{label, hasChildren}">
          <span class="truncate" :class="hasChildren && 'text-fg-muted'">{{ label }}</span>
          <span v-if="!hasChildren" class="ml-auto text-caption text-fg-muted tabular-nums">0</span>
        </template>
      </Tree>
    </DsRow>

    <DsRow label="size / indent / disabled" stack>
      <Tree :items="FOLDER_TREE" size="sm" :indent="24" default-expand-all aria-label="sm 缩进 24" class="rounded-md border border-line bg-canvas p-1.5" />
      <Tree :items="FOLDER_TREE" disabled :default-expanded="['system']" aria-label="整树禁用" class="rounded-md border border-line bg-canvas p-1.5" />
    </DsRow>
  </DsSection>
</template>
