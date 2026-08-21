<template>
  <div class="min-h-full bg-canvas font-sans text-body text-fg">
    <header
      class="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas/85 px-6 backdrop-blur"
      style="height: var(--um-topbar-h)"
    >
      <span class="text-title">Design System</span>
      <span class="rounded-sm bg-accent-subtle px-2 py-px text-micro uppercase text-accent-subtle-fg">P0 · P1 · P2</span>
      <span class="ml-auto text-caption text-fg-muted">断点 {{ current }}</span>
      <div class="flex items-center gap-0.5 rounded-md bg-inset p-0.5">
        <button
          v-for="m in THEME_MODES"
          :key="m"
          class="rounded-sm px-2.5 py-1 text-label transition"
          :class="mode === m ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg'"
          @click="setMode(m, $event)"
        >
          {{ modeLabel[m] }}
        </button>
      </div>
    </header>

    <main class="mx-auto flex max-w-[1280px] flex-col gap-10 px-6 py-8">
      <section>
        <h2 class="text-title-lg">语义色</h2>
        <p class="mt-1 text-caption text-fg-muted">
          Layer 2。业务代码只用这一层；主题切换只改这一层（§4.2）。
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div
            v-for="t in semantic"
            :key="t.token"
            class="overflow-hidden rounded-lg border border-line bg-surface"
          >
            <div class="h-14 border-b border-line" :style="{background: `var(${t.token})`}" />
            <div class="px-3 py-2">
              <div class="truncate text-label">{{ t.name }}</div>
              <div class="truncate font-mono text-mono text-fg-muted">{{ t.token }}</div>
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2 class="text-title-lg">状态色</h2>
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="s in status"
            :key="s.name"
            class="rounded-lg border border-line bg-surface p-4"
          >
            <div class="flex items-center gap-2">
              <span class="size-2.5 rounded-full" :style="{background: `var(${s.solid})`}" />
              <span class="text-label">{{ s.name }}</span>
            </div>
            <div
              class="mt-3 rounded-sm px-2 py-1 text-caption"
              :style="{background: `var(${s.bg})`, color: `var(${s.fg})`}"
            >
              subtle 徽章示例
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-title-lg">字阶</h2>
        <p class="mt-1 text-caption text-fg-muted">基准 14px，密度导向；未读态用 550 而非 bold（§4.3）。</p>
        <div class="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          <div v-for="t in typeScale" :key="t.cls" class="flex items-baseline gap-4 px-4 py-3">
            <code class="w-32 shrink-0 font-mono text-mono text-fg-muted">{{ t.cls }}</code>
            <span :class="t.cls">{{ t.sample }}</span>
            <span class="ml-auto shrink-0 text-caption text-fg-muted">{{ t.meta }}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-title-lg">圆角与投影</h2>
        <div class="mt-4 flex flex-wrap gap-4">
          <div v-for="r in radii" :key="r.cls" class="text-center">
            <div class="size-16 border border-line bg-inset" :class="r.cls" />
            <div class="mt-1.5 font-mono text-mono text-fg-muted">{{ r.label }}</div>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap gap-5">
          <div v-for="s in shadows" :key="s.cls" class="text-center">
            <div class="size-20 rounded-lg bg-surface" :class="s.cls" />
            <div class="mt-1.5 font-mono text-mono text-fg-muted">{{ s.cls }}</div>
          </div>
        </div>
      </section>
      <section>
        <h2 class="text-title-lg">焦点环</h2>
        <p class="mt-1 text-caption text-fg-muted">
          用 Tab 键依次经过下面三个控件：必须看到 2px 紫罗兰环（§4.7 已删除
          <code class="font-mono text-mono">*:focus{'{'}outline:none{'}'}</code>）。鼠标点击不出现环。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button class="rounded-md bg-accent px-3.5 py-2 text-label text-on-accent transition hover:bg-accent-hover">
            主按钮
          </button>
          <button class="rounded-md border border-line-strong bg-surface px-3.5 py-2 text-label transition hover:bg-hover">
            次按钮
          </button>
          <input
            class="rounded-md border border-line-strong bg-inset px-3 py-2 text-body placeholder:text-fg-muted"
            placeholder="原生 input"
          >
          <a class="rounded-sm text-label text-accent-fg underline-offset-4 hover:underline" href="#">链接</a>
        </div>
      </section>

      <section>
        <h2 class="text-title-lg">材质</h2>
        <p class="mt-1 text-caption text-fg-muted">
          玻璃只有 4 个使用面，token 只允许 GlassCard / Overlay / ParticleField 读取（§4.12）。
          全部变体与 §9.5 的 8 种组合在下面的
          <a class="text-accent-fg hover:underline" href="#glasscard">L2 复合层</a>。
        </p>
        <div class="glass-demo mt-4">
          <GlassCard class="max-w-80 p-(--um-card-p)">
            <div class="text-title">GlassCard 预览</div>
            <div class="mt-1 text-caption text-fg-muted">
              alpha {{ isDark ? '0.64' : '0.72' }} · blur {{ isDark ? '24px' : '20px' }}
            </div>
          </GlassCard>
        </div>
      </section>

      <section>
        <h2 class="text-title-lg">布局尺度</h2>
        <div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <div v-for="l in layout" :key="l" class="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
            <code class="font-mono text-mono text-fg-muted">{{ l }}</code>
            <span class="um-tnum text-caption">{{ cssVar(l) }}</span>
          </div>
        </div>
      </section>

      <section id="primitives" class="scroll-mt-20">
        <h2 class="text-title-lg">L1 原语</h2>
        <p class="mt-1 text-caption text-fg-muted">
          §6.1 的 21 类原语共 {{ COMPONENT_COUNT }} 个组件，逐个列出全部变体与状态。
          每一行左侧是被演示的 prop，右侧是实物 —— 请在浅色/深色两套主题下各过一遍（§10.4 P1 验收）。
        </p>
        <nav class="mt-4 flex flex-wrap gap-1.5" aria-label="原语目录">
          <a
            v-for="link in TOC"
            :key="link.id"
            :href="`#${link.id}`"
            class="rounded-sm bg-inset px-2 py-1 font-mono text-mono text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >{{ link.label }}</a>
        </nav>
      </section>

      <DsActions />
      <DsDisplay />
      <DsForms />
      <DsOverlays />
      <DsNavigation />

      <section id="composite" class="scroll-mt-20">
        <h2 class="text-title-lg">L2 复合层</h2>
        <p class="mt-1 text-caption text-fg-muted">
          §10.2 的 `components/composite` + `components/domain` 共 {{ COMPOSITE_COUNT }} 个组件：材质、导航壳零件、
          联体表单控件与两个全局浮层。整壳（Topbar + Sidebar + CommandBar 三段联动）要登录态，走
          <code class="font-mono text-mono">/mail/inbox</code> 人工过审，这里只列能单独成立的零件。
        </p>
        <nav class="mt-4 flex flex-wrap gap-1.5" aria-label="复合组件目录">
          <a
            v-for="link in TOC_L2"
            :key="link.id"
            :href="`#${link.id}`"
            class="rounded-sm bg-inset px-2 py-1 font-mono text-mono text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >{{ link.label }}</a>
        </nav>
      </section>

      <DsShell />
    </main>
  </div>
</template>

<script setup>
import {onMounted, ref} from 'vue'
import {THEME_MODES, useTheme} from '@/composables/useTheme.js'
import {useBreakpoint} from '@/composables/useBreakpoint.js'
import {GlassCard} from '@/components/composite'
import DsActions from './sections/DsActions.vue'
import DsDisplay from './sections/DsDisplay.vue'
import DsForms from './sections/DsForms.vue'
import DsOverlays from './sections/DsOverlays.vue'
import DsNavigation from './sections/DsNavigation.vue'
import DsShell from './sections/DsShell.vue'

const {mode, isDark, setMode} = useTheme()
const {current} = useBreakpoint()

const modeLabel = {light: '浅色', dark: '深色', system: '跟随系统'}

/** `src/components/ui/**\/*.vue` 的个数；`test/ui-barrels.spec.js` 守着别漏导出 */
const COMPONENT_COUNT = 50

/** `composite/` + `domain/` 的个数；同一个测试也守着这两个桶 */
const COMPOSITE_COUNT = 24

/** 目录锚点，顺序与下面五个 section 文件的渲染顺序一致 */
const TOC = [
  {id: 'button', label: 'Button'},
  {id: 'copybutton', label: 'CopyButton'},
  {id: 'kbd', label: 'Kbd'},
  {id: 'avatar', label: 'Avatar'},
  {id: 'badge', label: 'Badge'},
  {id: 'code', label: 'Code'},
  {id: 'separator', label: 'Separator'},
  {id: 'skeleton', label: 'Skeleton'},
  {id: 'spinner', label: 'Spinner'},
  {id: 'progress', label: 'Progress'},
  {id: 'meter', label: 'Meter'},
  {id: 'field', label: 'Field'},
  {id: 'input', label: 'Input'},
  {id: 'textarea', label: 'Textarea'},
  {id: 'numberinput', label: 'NumberInput'},
  {id: 'checkbox', label: 'Checkbox'},
  {id: 'radio', label: 'RadioGroup'},
  {id: 'switch', label: 'Switch'},
  {id: 'select', label: 'Select'},
  {id: 'combobox', label: 'Combobox'},
  {id: 'tagsinput', label: 'TagsInput'},
  {id: 'segmented', label: 'Segmented'},
  {id: 'datepicker', label: 'DatePicker'},
  {id: 'tooltip', label: 'Tooltip'},
  {id: 'popover', label: 'Popover'},
  {id: 'hovercard', label: 'HoverCard'},
  {id: 'dropdownmenu', label: 'DropdownMenu'},
  {id: 'contextmenu', label: 'ContextMenu'},
  {id: 'dialog', label: 'Dialog'},
  {id: 'alertdialog', label: 'AlertDialog'},
  {id: 'sheet', label: 'Sheet'},
  {id: 'command', label: 'Command'},
  {id: 'toast', label: 'Toast'},
  {id: 'tabs', label: 'Tabs'},
  {id: 'collapsible', label: 'Collapsible'},
  {id: 'scrollarea', label: 'ScrollArea'},
  {id: 'pagination', label: 'Pagination'},
  {id: 'tree', label: 'Tree'},
]

/** L2 目录，顺序与 `DsShell.vue` 里的区块一致 */
const TOC_L2 = [
  {id: 'glasscard', label: 'GlassCard'},
  {id: 'authcard', label: '登录卡材质 ×8'},
  {id: 'particlefield', label: 'ParticleField'},
  {id: 'brandmark', label: 'BrandMark'},
  {id: 'sidebaritem', label: 'SidebarGroup/Item'},
  {id: 'commandbar', label: 'CommandBar'},
  {id: 'authinputs', label: 'Email/PasswordInput'},
  {id: 'miniquota', label: 'MiniQuota'},
  {id: 'palette', label: 'CommandPalette / ?'},
]

const semantic = [
  {name: 'canvas', token: '--um-bg-canvas'},
  {name: 'subtle', token: '--um-bg-subtle'},
  {name: 'surface', token: '--um-bg-surface'},
  {name: 'raised', token: '--um-bg-raised'},
  {name: 'inset', token: '--um-bg-inset'},
  {name: 'selected', token: '--um-bg-selected'},
  {name: 'overlay', token: '--um-bg-overlay'},
  {name: 'fg default', token: '--um-fg-default'},
  {name: 'fg muted', token: '--um-fg-muted'},
  {name: 'fg subtle', token: '--um-fg-subtle'},
  {name: 'fg disabled', token: '--um-fg-disabled'},
  {name: 'border default', token: '--um-border-default'},
  {name: 'border strong', token: '--um-border-strong'},
  {name: 'border focus', token: '--um-border-focus'},
  {name: 'accent solid', token: '--um-accent-solid'},
  {name: 'accent hover', token: '--um-accent-hover'},
  {name: 'accent active', token: '--um-accent-active'},
  {name: 'accent fg（文字用）', token: '--um-accent-fg'},
  {name: 'accent subtle', token: '--um-accent-subtle-bg'},
  {name: 'sidebar bg', token: '--um-sidebar-bg'},
  {name: 'sidebar fg', token: '--um-sidebar-fg'},
]

const status = [
  {name: 'success', solid: '--um-success-solid', bg: '--um-success-subtle-bg', fg: '--um-success-subtle-fg'},
  {name: 'warning', solid: '--um-warning-solid', bg: '--um-warning-subtle-bg', fg: '--um-warning-subtle-fg'},
  {name: 'danger', solid: '--um-danger-solid', bg: '--um-danger-subtle-bg', fg: '--um-danger-subtle-fg'},
  {name: 'info', solid: '--um-info-solid', bg: '--um-info-subtle-bg', fg: '--um-info-subtle-fg'},
]
const typeScale = [
  {cls: 'text-display', sample: '独角邮箱', meta: '28/34 · 600'},
  {cls: 'text-title-lg', sample: '页面标题', meta: '20/28 · 600'},
  {cls: 'text-title', sample: '卡片标题', meta: '16/24 · 600'},
  {cls: 'text-body-lg', sample: '邮件正文 Reading body', meta: '15/24 · 400'},
  {cls: 'text-body', sample: '全局默认 Default body', meta: '14/20 · 400'},
  {cls: 'text-body-strong', sample: '未读邮件 / 表头', meta: '14/20 · 550'},
  {cls: 'text-label', sample: '表单标签 · 按钮', meta: '13/18 · 500'},
  {cls: 'text-caption', sample: '2026-08-10 20:41', meta: '12/16 · 450'},
  {cls: 'text-micro', sample: 'SECTION', meta: '11/14 · 550 · +0.04em'},
  {cls: 'font-mono text-mono', sample: 'um_sk_9f3c…', meta: '12.5/18 · 450'},
]

const radii = [
  {cls: 'rounded-xs', label: 'xs 4'},
  {cls: 'rounded-sm', label: 'sm 6'},
  {cls: 'rounded-md', label: 'md 8'},
  {cls: 'rounded-lg', label: 'lg 12'},
  {cls: 'rounded-xl', label: 'xl 16'},
  {cls: 'rounded-2xl', label: '2xl 20'},
  {cls: 'rounded-full', label: 'full'},
]

const shadows = [
  {cls: 'shadow-xs'}, {cls: 'shadow-sm'}, {cls: 'shadow-md'},
  {cls: 'shadow-lg'}, {cls: 'shadow-xl'},
]

const layout = [
  '--um-sidebar-w', '--um-sidebar-w-collapsed', '--um-list-col-w', '--um-picker-min-w',
  '--um-topbar-h', '--um-row-h', '--um-row-h-compact', '--um-read-max-w',
  '--um-form-max-w', '--um-page-px', '--um-card-p',
]

const computedVars = ref({})

function cssVar(name) {
  return computedVars.value[name] || ''
}

onMounted(() => {
  const style = getComputedStyle(document.documentElement)
  computedVars.value = Object.fromEntries(
      layout.map((name) => [name, style.getPropertyValue(name).trim()]),
  )
})
</script>

<style scoped>
/* 只有 GlassCard / Overlay / ParticleField 允许读玻璃 token（§4.12）。
   这里只留背板：卡片本体从 P2 起就是真的 GlassCard 组件了。 */
.glass-demo {
  padding: 40px;
  border-radius: var(--um-radius-xl);
  background:
      radial-gradient(120% 120% at 20% 0%, var(--um-glow-from), transparent 60%),
      linear-gradient(135deg, var(--um-chart-1), var(--um-chart-4));
}
</style>
