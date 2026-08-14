<script setup>
/** `/_ds` — 浮层类原语：Tooltip / Popover / HoverCard / DropdownMenu + Menu* / ContextMenu / Dialog / AlertDialog / Sheet / Command / Toast */
import {ref} from 'vue'
import IconEllipsis from '~icons/lucide/ellipsis'
import IconArchive from '~icons/lucide/archive'
import IconStar from '~icons/lucide/star'
import IconTrash from '~icons/lucide/trash-2'
import IconReply from '~icons/lucide/reply'
import IconSettings from '~icons/lucide/settings'
import IconLogOut from '~icons/lucide/log-out'
import IconSquarePen from '~icons/lucide/square-pen'
import IconInfo from '~icons/lucide/info'
import {
    AlertDialog, Avatar, Button, Command, ContextMenu, Dialog, DropdownMenu, HoverCard, Kbd,
    MenuCheckboxItem, MenuGroup, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem,
    MenuSeparator, MenuSub, Popover, Sheet, Toaster, Tooltip, toast,
} from '@/components/ui'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const SIDES = ['top', 'right', 'bottom', 'left']

const popoverOpen = ref(false)
const dialogOpen = ref(false)
const confirmOpen = ref(false)
const confirmLoading = ref(false)
const discardOpen = ref(false)
const emptyTrashOpen = ref(false)
const sheetOpen = ref(false)
const unreadOnly = ref(true)
const withAttachment = ref('indeterminate')
const density = ref('cozy')
const lastCommand = ref('')

const COMMAND_ITEMS = [
    {value: 'compose', label: '写邮件', keywords: ['compose', 'new'], shortcut: 'C', icon: IconSquarePen},
    {value: 'refresh', label: '刷新收件箱', hint: '重新拉取未读'},
    {
        label: '跳转',
        options: [
            {value: 'inbox', label: '收件箱', shortcut: 'G I'},
            {value: 'sent', label: '已发送', shortcut: 'G S'},
        ],
    },
    {
        label: '危险',
        options: [
            {value: 'empty-trash', label: '清空垃圾箱', tone: 'danger'},
            {value: 'logout', label: '退出登录', tone: 'danger', disabled: true},
        ],
    },
]

/** 演示「异步确认」：AlertDialog 的 confirm 默认不关闭，等调用方拿到结果再关 */
function confirmDelete() {
    confirmLoading.value = true
    setTimeout(() => {
        confirmLoading.value = false
        confirmOpen.value = false
        toast.undo('已删除 3 封邮件', {onUndo: () => toast.success('已恢复')})
    }, 800)
}
</script>

<template>
  <DsSection id="tooltip" title="Tooltip" note="只放「补充说明」，不放操作；触发器必须是可聚焦元素，否则键盘用户看不到">
    <DsRow label="text + side">
      <Tooltip v-for="s in SIDES" :key="s" :text="`side=${s}`" :side="s">
        <Button variant="secondary" size="sm">{{ s }}</Button>
      </Tooltip>
    </DsRow>

    <DsRow label="align" note="align 只在有空间时生效，边界处会自己翻转">
      <Tooltip v-for="a in ['start', 'center', 'end']" :key="a" :text="`align=${a}`" side="bottom" :align="a">
        <Button variant="secondary" size="sm">{{ a }}</Button>
      </Tooltip>
    </DsRow>

    <DsRow label="delay" note="默认 400ms；工具条按钮那种密集悬停用 0 更跟手">
      <Tooltip text="立刻出现" :delay="0">
        <Button size="icon-sm" variant="ghost" label="归档">
          <IconArchive />
        </Button>
      </Tooltip>
      <Tooltip text="等 800ms" :delay="800">
        <Button size="icon-sm" variant="ghost" label="星标">
          <IconStar />
        </Button>
      </Tooltip>
    </DsRow>

    <DsRow label="#content" note="富内容用插槽；但仍不能放可点击元素（鼠标移过去 tooltip 就关了）">
      <Tooltip>
        <Button variant="secondary" size="sm">带快捷键</Button>
        <template #content>
          <span class="flex items-center gap-1.5">归档 <Kbd keys="E" size="sm" /></span>
        </template>
      </Tooltip>
    </DsRow>

    <DsRow label="arrow=false / disabled">
      <Tooltip text="没有小箭头" :arrow="false">
        <Button variant="secondary" size="sm">无箭头</Button>
      </Tooltip>
      <Tooltip text="不会出现" disabled>
        <Button variant="secondary" size="sm">disabled</Button>
      </Tooltip>
    </DsRow>
  </DsSection>
  <DsSection id="popover" title="Popover" note="可以放交互元素（表单、按钮）；只放说明文字的场合用 Tooltip">
    <DsRow label="title + closable">
      <Popover title="筛选" closable width="w-64">
        <template #trigger>
          <Button variant="secondary">筛选</Button>
        </template>
        <p class="text-body text-fg-muted">面板里可以放真表单。焦点会被收进来，Esc 关闭并还回触发器。</p>
      </Popover>
    </DsRow>

    <DsRow label="side × align" note="空间不够时 reka 自己翻转，这里给的是首选位置">
      <Popover v-for="s in SIDES" :key="s" :side="s" align="center" arrow>
        <template #trigger>
          <Button variant="secondary" size="sm">{{ s }}</Button>
        </template>
        <p class="text-body">side={{ s }}</p>
      </Popover>
    </DsRow>

    <DsRow label="v-model:open" note="受控：外部按钮也能开关同一个面板">
      <Popover v-model:open="popoverOpen" title="受控面板" closable>
        <template #trigger>
          <Button variant="secondary">触发器</Button>
        </template>
        <p class="text-body text-fg-muted">open = {{ popoverOpen }}</p>
      </Popover>
      <Button variant="ghost" size="sm" @click="popoverOpen = !popoverOpen">从外部切换</Button>
    </DsRow>

    <DsRow label="无标题面板" note="面板名称 = 触发器名称，所以图标触发器必须自带 label">
      <Popover width="w-56">
        <template #trigger>
          <Button size="icon" variant="ghost" label="更多">
            <IconEllipsis />
          </Button>
        </template>
        <div class="flex flex-col gap-1.5 text-body">
          <span>无标题面板</span>
          <span class="text-caption text-fg-muted">读屏念的是触发器的「更多」</span>
        </div>
      </Popover>
    </DsRow>
  </DsSection>

  <DsSection id="hovercard" title="HoverCard" note="纯悬停预览（发件人卡片）：不抢焦点，触屏上不出现，所以里面的信息必须别处也能拿到">
    <DsRow label="默认（openDelay 300 / closeDelay 150）">
      <HoverCard>
        <template #trigger>
          <a class="text-label text-accent-fg underline-offset-4 hover:underline" href="#">ada@unicorn.mail</a>
        </template>
        <div class="flex items-start gap-3">
          <Avatar name="Ada Lovelace" size="md" />
          <div class="min-w-0">
            <p class="text-label text-fg">Ada Lovelace</p>
            <p class="truncate text-caption text-fg-muted">ada@unicorn.mail</p>
            <p class="mt-1.5 text-caption text-fg-muted">最近 30 天来往 12 封</p>
          </div>
        </div>
      </HoverCard>
    </DsRow>

    <DsRow label="side / arrow / width">
      <HoverCard v-for="s in ['top', 'right']" :key="s" :side="s" arrow width="w-56">
        <template #trigger>
          <Button variant="ghost" size="sm">side={{ s }}</Button>
        </template>
        <p class="text-body text-fg-muted">箭头指回触发器，宽度可改。</p>
      </HoverCard>
      <HoverCard :open-delay="0" :close-delay="0" width="w-48">
        <template #trigger>
          <Button variant="ghost" size="sm">无延迟</Button>
        </template>
        <p class="text-body text-fg-muted">delay=0：调试定位时好用，正式界面别这么干。</p>
      </HoverCard>
    </DsRow>
  </DsSection>
  <DsSection id="dropdownmenu" title="DropdownMenu + Menu*" note="菜单项词汇（MenuItem / CheckboxItem / RadioItem / Sub / Label / Group / Separator）被 DropdownMenu 与 ContextMenu 共用">
    <DsRow label="MenuItem：#icon / shortcut / tone / disabled">
      <DropdownMenu width="w-56">
        <template #trigger>
          <Button variant="secondary">
            邮件操作
            <template #suffix>
              <IconEllipsis />
            </template>
          </Button>
        </template>
        <MenuItem shortcut="R">
          <template #icon>
            <IconReply />
          </template>
          回复
        </MenuItem>
        <MenuItem shortcut="E">
          <template #icon>
            <IconArchive />
          </template>
          归档
        </MenuItem>
        <MenuItem disabled>
          <template #icon>
            <IconStar />
          </template>
          星标（无权限）
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" shortcut="⌫">
          <template #icon>
            <IconTrash />
          </template>
          删除
        </MenuItem>
      </DropdownMenu>
    </DsRow>

    <DsRow label="MenuLabel / MenuGroup / inset">
      <DropdownMenu width="w-52">
        <template #trigger>
          <Button variant="secondary">分组与标题</Button>
        </template>
        <MenuLabel>ada@unicorn.mail</MenuLabel>
        <MenuSeparator />
        <MenuGroup label="账户">
          <MenuItem inset>个人资料</MenuItem>
          <MenuItem inset>
            <template #icon>
              <IconSettings />
            </template>
            设置
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem tone="danger" inset>
          <template #icon>
            <IconLogOut />
          </template>
          退出登录
        </MenuItem>
      </DropdownMenu>
    </DsRow>

    <DsRow label="MenuCheckboxItem / MenuRadioGroup" note="勾选项支持 'indeterminate'；选中后菜单默认关闭是 reka 的行为，多选场景请自己 preventDefault">
      <DropdownMenu width="w-56">
        <template #trigger>
          <Button variant="secondary">视图选项</Button>
        </template>
        <MenuLabel>筛选</MenuLabel>
        <MenuCheckboxItem v-model="unreadOnly">仅未读</MenuCheckboxItem>
        <MenuCheckboxItem v-model="withAttachment">含附件（部分选中）</MenuCheckboxItem>
        <MenuCheckboxItem :model-value="false" disabled>已加星（禁用）</MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>密度</MenuLabel>
        <MenuRadioGroup v-model="density">
          <MenuRadioItem value="compact" shortcut="1">紧凑</MenuRadioItem>
          <MenuRadioItem value="cozy" shortcut="2">舒适</MenuRadioItem>
          <MenuRadioItem value="comfortable" shortcut="3">宽松</MenuRadioItem>
        </MenuRadioGroup>
      </DropdownMenu>
      <span class="text-caption text-fg-muted">
        未读 {{ unreadOnly }} · 附件 {{ withAttachment }} · 密度 {{ density }}
      </span>
    </DsRow>

    <DsRow label="MenuSub" note="二级面板：→ 展开、← 收起；层级别超过两层">
      <DropdownMenu width="w-52">
        <template #trigger>
          <Button variant="secondary">移动到…</Button>
        </template>
        <MenuItem>收件箱</MenuItem>
        <MenuSub label="自定义文件夹" width="w-44">
          <MenuItem>账单</MenuItem>
          <MenuItem>订阅</MenuItem>
          <MenuSub label="更早" width="w-36">
            <MenuItem>2025</MenuItem>
            <MenuItem>2024</MenuItem>
          </MenuSub>
        </MenuSub>
        <MenuSub label="禁用的子菜单" disabled />
      </DropdownMenu>
    </DsRow>

    <DsRow label="side / align / arrow">
      <DropdownMenu v-for="a in ['start', 'center', 'end']" :key="a" :align="a" arrow width="w-40">
        <template #trigger>
          <Button variant="secondary" size="sm">align={{ a }}</Button>
        </template>
        <MenuItem>选项一</MenuItem>
        <MenuItem>选项二</MenuItem>
      </DropdownMenu>
      <DropdownMenu side="right" align="start" width="w-40">
        <template #trigger>
          <Button variant="secondary" size="sm">side=right</Button>
        </template>
        <MenuItem>选项一</MenuItem>
        <MenuItem>选项二</MenuItem>
      </DropdownMenu>
    </DsRow>

    <DsRow label="modal=false" note="面板打开时仍可滚动页面（工具条上的下拉）">
      <DropdownMenu :modal="false" width="w-40">
        <template #trigger>
          <Button variant="ghost" size="icon" label="更多">
            <IconEllipsis />
          </Button>
        </template>
        <MenuItem>不锁滚动</MenuItem>
        <MenuItem>页面照样能滚</MenuItem>
      </DropdownMenu>
    </DsRow>
  </DsSection>

  <DsSection id="contextmenu" title="ContextMenu" note="右键菜单是「加速器」而不是唯一入口：同样的操作必须在工具条或下拉里也有">
    <DsRow label="#trigger（右键下面这块）" stack>
      <ContextMenu width="w-48" class="rounded-md border border-dashed border-line-strong bg-canvas px-4 py-6 text-center">
        <template #trigger>
          <span class="text-body text-fg-muted">在这块区域右键 / 长按</span>
        </template>
        <MenuItem shortcut="R">
          <template #icon>
            <IconReply />
          </template>
          回复
        </MenuItem>
        <MenuCheckboxItem v-model="unreadOnly">标为未读</MenuCheckboxItem>
        <MenuSub label="移动到…" width="w-40">
          <MenuItem>账单</MenuItem>
          <MenuItem>订阅</MenuItem>
        </MenuSub>
        <MenuSeparator />
        <MenuItem tone="danger">
          <template #icon>
            <IconTrash />
          </template>
          删除
        </MenuItem>
      </ContextMenu>
    </DsRow>

    <DsRow label="disabled" note="整块区域交回浏览器原生右键菜单" stack>
      <ContextMenu disabled class="rounded-md border border-dashed border-line px-4 py-6 text-center">
        <template #trigger>
          <span class="text-body text-fg-muted">这块右键是浏览器自带菜单</span>
        </template>
        <MenuItem>看不到我</MenuItem>
      </ContextMenu>
    </DsRow>
  </DsSection>
  <DsSection id="dialog" title="Dialog" note="需要用户完成一件事才能继续时用；只是展示信息就别拦路。焦点被收进面板，Esc 归还触发器">
    <DsRow label="title + description + #footer" note="footer 里的按钮要自己关（受控 open），因为提交多半是异步的">
      <Dialog v-model:open="dialogOpen" title="新建邮箱" description="创建后登录名不可修改。">
        <template #trigger>
          <Button variant="primary">新建邮箱</Button>
        </template>
        <p class="text-body text-fg-muted">正文区自己滚，超过 85vh 不会把页面顶出去。</p>
        <template #footer>
          <Button variant="secondary" @click="dialogOpen = false">取消</Button>
          <Button variant="primary" @click="dialogOpen = false; toast.success('已创建')">创建</Button>
        </template>
      </Dialog>
    </DsRow>

    <DsRow label="size">
      <Dialog v-for="s in ['sm', 'md', 'lg', 'xl', 'full']" :key="s" :size="s" :title="`size=${s}`">
        <template #trigger>
          <Button variant="secondary" size="sm">{{ s }}</Button>
        </template>
        <p class="text-body text-fg-muted">最大宽度不同，其余一致。</p>
      </Dialog>
    </DsRow>

    <DsRow label="dismissible=false / closable=false" note="不可误关：正在上传、正在写库时用；此时必须自己给出口">
      <Dialog title="正在导入" :dismissible="false">
        <template #trigger>
          <Button variant="secondary" size="sm">点遮罩 / Esc 无效</Button>
        </template>
        <p class="text-body text-fg-muted">只能点右上角的 ×。</p>
      </Dialog>
      <Dialog title="没有关闭按钮" :closable="false">
        <template #trigger>
          <Button variant="secondary" size="sm">closable=false</Button>
        </template>
        <p class="text-body text-fg-muted">Esc 或点遮罩关闭。</p>
      </Dialog>
    </DsRow>

    <DsRow label="ariaLabel（无可见标题）+ #header">
      <Dialog aria-label="邮件预览" :closable="true">
        <template #trigger>
          <Button variant="secondary" size="sm">无标题</Button>
        </template>
        <template #header>
          <div class="flex items-center gap-2">
            <Avatar name="Ada Lovelace" size="sm" />
            <span class="text-label">自定义头部</span>
          </div>
        </template>
        <p class="text-body text-fg-muted">标题被隐藏但仍存在（VisuallyHidden），读屏能念出名字。</p>
      </Dialog>
    </DsRow>
  </DsSection>

  <DsSection id="alertdialog" title="AlertDialog" note="只用于「不可撤销 / 有代价」的确认；点遮罩不关闭（reka 的语义），必须显式选一个按钮">
    <DsRow label="tone=danger + 异步 confirm" note="confirm 默认不关闭：等接口回来再关，期间按钮 loading">
      <AlertDialog
        v-model:open="confirmOpen"
        title="删除 3 封邮件？"
        description="邮件会进入垃圾箱，30 天后彻底清除。"
        confirm-text="删除"
        tone="danger"
        :loading="confirmLoading"
        @confirm="confirmDelete"
      >
        <template #trigger>
          <Button variant="danger">删除</Button>
        </template>
      </AlertDialog>
    </DsRow>

    <DsRow label="tone=default + 默认文案" note="confirmText/cancelText 不给就用 ui.confirm / ui.cancel">
      <AlertDialog
        v-model:open="discardOpen"
        title="放弃这封草稿？"
        description="草稿不会被保存。"
        @confirm="discardOpen = false"
      >
        <template #trigger>
          <Button variant="secondary">放弃草稿</Button>
        </template>
      </AlertDialog>
    </DsRow>

    <DsRow label="#default（额外内容）">
      <AlertDialog
        v-model:open="emptyTrashOpen"
        title="清空垃圾箱？"
        description="这个操作不可撤销。"
        confirm-text="清空"
        tone="danger"
        @confirm="emptyTrashOpen = false"
      >
        <template #trigger>
          <Button variant="secondary">清空垃圾箱</Button>
        </template>
        <p class="rounded-md bg-danger-subtle px-3 py-2 text-caption text-danger-fg">
          将永久删除 128 封邮件（约 42 MB）。
        </p>
      </AlertDialog>
    </DsRow>
  </DsSection>
  <DsSection id="sheet" title="Sheet" note="移动端的对话框形态（vaul 拖拽）：底部升起、可下拉关闭；左右方向就是抽屉">
    <DsRow label="side" note="bottom/top 默认给把手，left/right 默认给关闭按钮">
      <Sheet title="底部 Sheet" description="向下拖或点遮罩关闭。">
        <template #trigger>
          <Button variant="secondary" size="sm">bottom</Button>
        </template>
        <p class="text-body text-fg-muted">默认方向。把手对读屏隐藏，键盘用 Esc。</p>
      </Sheet>
      <Sheet side="top" title="顶部 Sheet">
        <template #trigger>
          <Button variant="secondary" size="sm">top</Button>
        </template>
        <p class="text-body text-fg-muted">通知类内容。</p>
      </Sheet>
      <Sheet side="left" title="左侧抽屉" size="w-80">
        <template #trigger>
          <Button variant="secondary" size="sm">left</Button>
        </template>
        <p class="text-body text-fg-muted">移动端的侧栏就是这个。</p>
      </Sheet>
      <Sheet side="right" title="右侧抽屉" size="w-80">
        <template #trigger>
          <Button variant="secondary" size="sm">right</Button>
        </template>
        <p class="text-body text-fg-muted">详情面板。</p>
      </Sheet>
    </DsRow>

    <DsRow label="#footer + v-model:open" note="操作放 footer，会避开安全区（env(safe-area-inset-bottom)）">
      <Sheet v-model:open="sheetOpen" title="筛选" description="选完点应用。">
        <template #trigger>
          <Button variant="secondary">带页脚</Button>
        </template>
        <p class="text-body text-fg-muted">内容区自己滚，滚动时 vaul 会暂停拖拽，两者不打架。</p>
        <template #footer>
          <Button variant="primary" block @click="sheetOpen = false">应用</Button>
        </template>
      </Sheet>
    </DsRow>

    <DsRow label="snapPoints / handleOnly / dismissible=false">
      <Sheet title="两档高度" :snap-points="[0.4, 1]">
        <template #trigger>
          <Button variant="secondary" size="sm">snapPoints</Button>
        </template>
        <p class="text-body text-fg-muted">先停在 40%，再往上拖到满高。</p>
      </Sheet>
      <Sheet title="只能拖把手" handle-only>
        <template #trigger>
          <Button variant="secondary" size="sm">handleOnly</Button>
        </template>
        <p class="text-body text-fg-muted">内容里有滑块/横向滚动时打开它，避免误拖。</p>
      </Sheet>
      <Sheet title="不可误关" :dismissible="false" :closable="true">
        <template #trigger>
          <Button variant="secondary" size="sm">dismissible=false</Button>
        </template>
        <p class="text-body text-fg-muted">拖不走、点遮罩没反应，只能点 ×。</p>
      </Sheet>
    </DsRow>
  </DsSection>

  <DsSection id="command" title="Command" note="⌘K 面板的内容部分（自己不带边框/浮层，放进 Dialog 才是命令面板）；这里 autoFocus 关掉，否则一进页面焦点就被抢">
    <DsRow label="items（扁平 + 分组）" note="相邻的扁平项自动并成一组，不会每项套一个 group" stack>
      <Command
        :items="COMMAND_ITEMS"
        :auto-focus="false"
        placeholder="搜索命令…"
        aria-label="命令面板"
        max-height="max-h-64"
        class="rounded-lg border border-line bg-raised shadow-md"
        @select="(value) => (lastCommand = value)"
      >
        <template #footer>
          <span class="flex items-center gap-1.5">
            <Kbd keys="↑" /> <Kbd keys="↓" /> 选择 · <Kbd keys="Enter" /> 执行 · <Kbd keys="Esc" /> 关闭
          </span>
        </template>
      </Command>
      <p class="text-caption text-fg-muted">最近执行：{{ lastCommand || '（无）' }}</p>
    </DsRow>

    <DsRow label="过滤" note="label / hint / keywords 都参与匹配，大小写与音标不敏感（Intl.Collator）；输入 new 也能命中「写邮件」" stack>
      <Command
        :items="COMMAND_ITEMS"
        :auto-focus="false"
        search-term="new"
        placeholder="受控搜索词 = new"
        aria-label="过滤示例"
        max-height="max-h-40"
        class="rounded-lg border border-line bg-raised"
      />
    </DsRow>

    <DsRow label="空状态 / emptyText" note="role=status 且在 listbox 之外，读屏才不会把它当选项" stack>
      <Command
        :items="COMMAND_ITEMS"
        :auto-focus="false"
        search-term="zzz"
        empty-text="没有匹配的命令，试试「写邮件」"
        aria-label="空状态示例"
        max-height="max-h-24"
        class="rounded-lg border border-line bg-raised"
      />
    </DsRow>

    <DsRow label="filter=false" note="服务端搜索：自己传已过滤的 items，别让组件再过滤一遍" stack>
      <Command
        :items="COMMAND_ITEMS"
        :auto-focus="false"
        :filter="false"
        search-term="zzz"
        aria-label="服务端过滤"
        max-height="max-h-40"
        class="rounded-lg border border-line bg-raised"
      />
    </DsRow>

    <DsRow label="放进 Dialog（真实用法）" note="Dialog 不给标题时用 ariaLabel；命令面板里 autoFocus 就该开着">
      <Dialog aria-label="命令面板" size="lg" :closable="false">
        <template #trigger>
          <Button variant="secondary">
            打开命令面板
            <template #suffix>
              <Kbd keys="Mod+K" />
            </template>
          </Button>
        </template>
        <Command :items="COMMAND_ITEMS" placeholder="搜索命令…" aria-label="命令面板" class="-mx-5" />
      </Dialog>
    </DsRow>
  </DsSection>

  <DsSection id="toast" title="Toast / Toaster" note="时长由设计系统定（success/info 2.5s、warning 3s、error 4s）；error 自带关闭按钮，loading 不自动关">
    <DsRow label="类型">
      <Button variant="secondary" size="sm" @click="toast('已保存草稿')">default</Button>
      <Button variant="secondary" size="sm" @click="toast.success('已发送')">success</Button>
      <Button variant="secondary" size="sm" @click="toast.info('收件箱已是最新')">info</Button>
      <Button variant="secondary" size="sm" @click="toast.warning('附件超过 20 MB，可能被拒收')">warning</Button>
      <Button variant="secondary" size="sm" @click="toast.error('发送失败：SMTP 连接超时')">error</Button>
    </DsRow>

    <DsRow label="toast.undo" note="撤销窗口固定 5s，与乐观更新的回滚窗口一致">
      <Button
        variant="secondary"
        size="sm"
        @click="toast.undo('已删除 3 封邮件', {onUndo: () => toast.success('已恢复')})"
      >
        undo
      </Button>
    </DsRow>

    <DsRow label="loading → 顶掉" note="同一个 id 会原地更新，不再堆一条">
      <Button
        variant="secondary"
        size="sm"
        @click="toast.loading('正在发送…', {id: 'ds-send'}); setTimeout(() => toast.success('已发送', {id: 'ds-send'}), 1200)"
      >
        loading 1.2s 后转 success
      </Button>
      <Button variant="ghost" size="sm" @click="toast.dismiss()">全部关闭</Button>
    </DsRow>

    <DsRow label="description / action" note="透传 vue-sonner 的选项">
      <Button
        variant="secondary"
        size="sm"
        @click="toast.error('3 封邮件发送失败', {description: '收件人域名不存在（MX 记录缺失）'})"
      >
        带描述
      </Button>
      <Button
        variant="secondary"
        size="sm"
        @click="toast.info('有 12 封新邮件', {action: {label: '查看', onClick: () => toast.success('已跳转')}}) "
      >
        带动作
      </Button>
    </DsRow>

    <DsRow label="Toaster" note="宿主只挂一个（P2 会挂到 App.vue）；桌面右下、移动端顶部居中，最多同时 3 条">
      <span class="flex items-center gap-2 text-caption text-fg-muted">
        <IconInfo class="size-4" aria-hidden="true" />
        本页已挂载一个 Toaster，上面的按钮点了就能看到
      </span>
      <Toaster />
    </DsRow>
  </DsSection>
</template>
