<script setup>
/**
 * `/_ds` — P2 的 L2 复合层：材质、认证卡材质组合、导航壳零件、两个联体表单控件。
 *
 * 这一段和上面的 L1 区块有个本质区别：L1 看的是「组件对不对」，这里看的是
 * **材质在真实背板上还能不能读**（§9.5 的 8 种组合）与**壳零件的状态齐不齐**。
 * 所以认证卡那块不用 `DsRow`，而是四块 240px 的真背板 —— 玻璃必须压在会动的东西
 * 上面才看得出问题，摆在 `bg-surface` 上等于什么都没测。
 *
 * 完整的 AppShell（Topbar + Sidebar + CommandBar 三段联动）不在这里预览：它要
 * 登录态、`accountStore` 与真实路由高亮，塞进预览页只能给一堆假数据。壳整体走
 * 浏览器人工过审（`/mail/inbox`），这里只列可以单独成立的零件。
 */
import {ref} from 'vue'
import IconInbox from '~icons/lucide/inbox'
import IconSend from '~icons/lucide/send'
import IconFileText from '~icons/lucide/file-text'
import IconStar from '~icons/lucide/star'
import IconTrash from '~icons/lucide/trash-2'
import {Button, Field, Kbd} from '@/components/ui'
import {
  BrandMark,
  CommandBar,
  CommandPalette,
  EmailInput,
  GlassCard,
  ParticleField,
  PasswordInput,
  ShortcutsDialog,
  SidebarGroup,
  SidebarItem,
} from '@/components/composite'
import {MiniQuota} from '@/components/domain'
import {openPalette} from '@/composables/useCommandPalette.js'
import {openShortcuts} from '@/composables/useShortcutsDialog.js'
import {useBgEffect} from '@/composables/useBgEffect.js'
import {authCardAlpha} from '@/design/glass.js'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const {pref, particleMode, adminPolicy} = useBgEffect()

/**
 * §9.5 验收表：Light/Dark × 有背景图/无背景图 × 粒子开/关 = 8 种组合。
 * 主题是页头的开关，所以页面里同时列的是其中 4 种 —— 两套主题各走一遍就是 8。
 */
const AUTH_COMBOS = [
  {id: 'glow', photo: false, particles: false, label: '无背景图 · 仅柔光'},
  {id: 'glow-dots', photo: false, particles: true, label: '无背景图 · 柔光 + 粒子'},
  {id: 'photo', photo: true, particles: false, label: '有背景图 · 仅柔光'},
  {id: 'photo-dots', photo: true, particles: true, label: '有背景图 · 柔光 + 粒子'},
]

/**
 * 站长可调 0.55–1.00（`setting.login_opacity`，默认 0.88）。
 * 有背景图时 AuthLayout 会把下限抬到 0.88（§9.5 实测：低于这个数近黑照片会把
 * 卡内 `text-fg-muted` 压到 2.2:1），所以这里也走同一个 `authCardAlpha()` ——
 * 预览页要么和生产一致，要么就是在演示一个不存在的状态。
 */
const OPACITY_PRESETS = [0.55, 0.72, 0.88, 1]
const cardOpacity = ref(0.88)

/** 每块背板上真正生效的 alpha：有照片的两块会被抬到 0.88 */
function tileOpacity(combo) {
  return authCardAlpha(cardOpacity.value, combo.photo)
}

/** 联体控件的演示数据 */
const DOMAINS = [
  {label: '@example.com', value: '@example.com'},
  {label: '@alt.example.com', value: '@alt.example.com'},
]
const demoEmail = ref('alice')
const demoSuffix = ref('@example.com')
const demoPwd = ref('hunter2')

/** CommandBar 的选择模型是 P3；这里手动给个数看中段点亮的样子 */
const selectedCount = ref(0)

const sidebarCollapsed = ref(false)
</script>

<template>
  <DsSection
    id="glasscard"
    title="GlassCard"
    note="全站 4 个使用面（登录卡 / 命令面板 / 移动端 Sheet / 模态遮罩）；材质数值全部来自 §4.12 的 token"
  >
    <DsRow label="radius" note="登录卡用 2xl（20px，全站唯一一处）">
      <div class="ds-backdrop flex flex-wrap gap-3 rounded-lg p-5">
        <GlassCard v-for="r in ['lg', 'xl', '2xl']" :key="r" :radius="r" class="px-4 py-3">
          <span class="font-mono text-mono text-fg">radius {{ r }}</span>
        </GlassCard>
      </div>
    </DsRow>

    <DsRow label="opacity" note="传 0.2 会被抬回 0.55（§5.3.1 对比度守卫）；1 就是纯色卡片">
      <div class="ds-backdrop flex flex-wrap gap-3 rounded-lg p-5">
        <GlassCard v-for="o in [0.2, ...OPACITY_PRESETS]" :key="o" :opacity="o" class="px-4 py-3">
          <span class="font-mono text-mono text-fg">{{ o }}{{ o === 0.2 ? ' → 0.55' : '' }}</span>
        </GlassCard>
      </div>
    </DsRow>

    <DsRow label="blur / elevation" note="blur 缺省读 --um-glass-blur（Light 20 / Dark 24）">
      <div class="ds-backdrop flex flex-wrap gap-3 rounded-lg p-5">
        <GlassCard :blur="4" class="px-4 py-3">
          <span class="font-mono text-mono text-fg">blur 4</span>
        </GlassCard>
        <GlassCard class="px-4 py-3">
          <span class="font-mono text-mono text-fg">blur token</span>
        </GlassCard>
        <GlassCard v-for="e in ['md', 'none']" :key="e" :elevation="e" class="px-4 py-3">
          <span class="font-mono text-mono text-fg">elevation {{ e }}</span>
        </GlassCard>
      </div>
    </DsRow>

    <DsRow label="prefers-contrast: more" note="系统开高对比后：模糊与高光撤掉、底色转实色、边框转实线 —— 这一行要靠系统设置验，不是 class 切换">
      <p class="text-caption text-fg-muted">
        macOS「增强对比度」/ Windows「对比主题」打开后重看上面三行：四张卡应当全部变成实色卡片。
      </p>
    </DsRow>
  </DsSection>

  <section id="authcard" class="scroll-mt-20">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 class="font-mono text-title text-fg">AuthLayout · 登录卡材质</h3>
      <p class="text-caption text-fg-muted">
        §9.5 验收：Light/Dark × 有背景图/无背景图 × 粒子开/关 = 8 种。下面是 4 种，用页头的主题开关再走一遍。
      </p>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3">
      <span class="text-label text-fg">login_opacity</span>
      <div class="flex items-center gap-0.5 rounded-md bg-inset p-0.5">
        <button
          v-for="o in OPACITY_PRESETS"
          :key="o"
          class="rounded-sm px-2.5 py-1 font-mono text-mono transition"
          :class="cardOpacity === o ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg'"
          @click="cardOpacity = o"
        >
          {{ o.toFixed(2) }}
        </button>
      </div>
      <p class="text-caption text-fg-muted">
        站长可调范围；0.88 是现有默认值，1.00 是纯色退路。卡片内正文必须始终 ≥ 4.5:1 ——
        所以**有背景图的两块会把低于 0.88 的档位抬回 0.88**（`authCardAlpha()`），下面每块角上标着实际生效值。
      </p>
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-2">
      <div
        v-for="combo in AUTH_COMBOS"
        :key="combo.id"
        :data-ds-combo="combo.id"
        class="relative isolate overflow-hidden rounded-lg border border-line"
      >
        <!-- ① 站长背景图的替身：一张同时有近白与近黑区域的渐变，用来逼出最坏情况 -->
        <div v-if="combo.photo" class="ds-photo absolute inset-0 -z-30" aria-hidden="true" />
        <!-- ② scrim：只在有背景图时压（与 AuthLayout 同一个 token） -->
        <div v-if="combo.photo" class="absolute inset-0 -z-20 bg-(--um-auth-scrim)" aria-hidden="true" />
        <!-- ③ 柔光 + ④ 粒子 -->
        <div class="ds-glow absolute inset-0 -z-10" aria-hidden="true" />
        <ParticleField v-if="combo.particles" mode="animated" class="absolute inset-0 -z-10" />

        <div class="flex min-h-70 items-center justify-center p-6">
          <GlassCard radius="2xl" :opacity="tileOpacity(combo)" class="w-[min(320px,100%)] p-6">
            <div class="flex items-center gap-2 text-fg">
              <BrandMark class="size-5 shrink-0" />
              <span class="truncate text-title font-semibold" data-ds-text="title">Unicorn Mail</span>
            </div>
            <h4 class="mt-4 text-h4 text-fg" data-ds-text="fg">登录到你的邮箱</h4>
            <p class="mt-1 text-label text-fg-muted" data-ds-text="fg-muted">使用邮箱与密码登录</p>
            <Button variant="primary" size="lg" block class="mt-4">登录</Button>
            <p class="mt-4 text-center text-label text-fg-muted">
              还没有账号？
              <a class="rounded-xs font-medium text-accent-fg hover:underline" href="#authcard" data-ds-text="accent">注册</a>
            </p>
            <p class="mt-3 text-center text-caption text-fg-muted" data-ds-text="fg-caption">
              {{ combo.label }} · α {{ tileOpacity(combo).toFixed(2) }}
              <template v-if="tileOpacity(combo) !== cardOpacity">（下限抬升）</template>
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  </section>

  <DsSection
    id="particlefield"
    title="ParticleField"
    note="自写 Canvas 2D；点数按面积算（上限 72，平板 40，移动端不启动），30fps 节流，超预算自动减半再退场"
  >
    <DsRow label="mode" note="static = 只画一帧（prefers-reduced-motion）；off = 连 canvas 都不挂">
      <div class="grid w-full gap-3 sm:grid-cols-3">
        <div
          v-for="m in ['animated', 'static', 'off']"
          :key="m"
          class="ds-glow relative isolate h-36 overflow-hidden rounded-lg border border-line"
        >
          <ParticleField :mode="m" />
          <span class="absolute bottom-2 left-2 font-mono text-mono text-fg-muted">mode {{ m }}</span>
        </div>
      </div>
    </DsRow>

    <DsRow label="density" note="应用内空状态插画区把点数减半（调用方传，组件不猜）">
      <div class="grid w-full gap-3 sm:grid-cols-2">
        <div
          v-for="d in [12, 40]"
          :key="d"
          class="ds-glow relative isolate h-36 overflow-hidden rounded-lg border border-line"
        >
          <ParticleField :density="d" />
          <span class="absolute bottom-2 left-2 font-mono text-mono text-fg-muted">density {{ d }}</span>
        </div>
      </div>
    </DsRow>

    <DsRow label="useBgEffect()" note="两级开关：站长策略优先，optional 时才看用户偏好（localStorage，P5 落库）">
      <dl class="grid gap-1 font-mono text-mono text-fg-muted">
        <div class="flex gap-2"><dt>adminPolicy</dt><dd class="text-fg">{{ adminPolicy }}</dd></div>
        <div class="flex gap-2"><dt>pref</dt><dd class="text-fg">{{ pref }}</dd></div>
        <div class="flex gap-2"><dt>particleMode</dt><dd class="text-fg">{{ particleMode }}</dd></div>
      </dl>
    </DsRow>
  </DsSection>

  <DsSection id="brandmark" title="BrandMark" note="单色 currentColor 字标（§3.3 否掉了旧的渐变胶囊）；换品牌资产只改这一个文件">
    <DsRow label="尺寸 × 颜色">
      <BrandMark class="size-4 text-fg" />
      <BrandMark class="size-5 text-fg" />
      <BrandMark class="size-6 text-accent" />
      <BrandMark class="size-8 text-fg-muted" />
      <span class="inline-flex items-center gap-2 text-fg">
        <BrandMark class="size-5 text-accent" />
        <span class="text-title font-semibold">Unicorn Mail</span>
      </span>
    </DsRow>
  </DsSection>

  <DsSection
    id="sidebaritem"
    title="SidebarGroup / SidebarItem"
    note="h32 · 选中态 = bg-selected + 左侧 2px 指示条；计数 >999 记 999+，=0 与 null 都不画"
  >
    <DsRow label="展开态" note="给了 to 就是 RouterLink（可中键新标签打开），没给就是 button">
      <div class="w-64 rounded-lg bg-sidebar p-2">
        <SidebarGroup title="邮件">
          <SidebarItem :to="{name: 'email'}" label="收件箱" :icon="IconInbox" :active="true" :count="12" count-label="12 封未读" />
          <SidebarItem :to="{name: 'send'}" label="已发送" :icon="IconSend" />
          <SidebarItem :to="{name: 'draft'}" label="草稿" :icon="IconFileText" badge="本机" :count="3" count-label="3 封草稿" />
          <SidebarItem :to="{name: 'star'}" label="星标" :icon="IconStar" :count="1200" count-label="1200 封" />
          <SidebarItem label="回收站（P3）" :icon="IconTrash" :count="0" />
        </SidebarGroup>
      </div>
    </DsRow>

    <DsRow label="collapsed" note="56px 图标态：不渲染组头，计数降级成右上角圆点，全名进 Tooltip 与 aria-label">
      <div class="flex w-16 justify-center rounded-lg bg-sidebar p-2">
        <SidebarGroup title="邮件" collapsed>
          <SidebarItem :to="{name: 'email'}" label="收件箱" :icon="IconInbox" collapsed :active="true" :count="12" count-label="12 封未读" />
          <SidebarItem :to="{name: 'send'}" label="已发送" :icon="IconSend" collapsed />
          <SidebarItem :to="{name: 'star'}" label="星标" :icon="IconStar" collapsed :count="1200" count-label="1200 封" />
        </SidebarGroup>
      </div>
      <Button size="sm" @click="sidebarCollapsed = !sidebarCollapsed">
        对照：切换下面这组 → {{ sidebarCollapsed ? '折叠' : '展开' }}
      </Button>
      <div :class="sidebarCollapsed ? 'w-16 justify-center' : 'w-64'" class="flex rounded-lg bg-sidebar p-2">
        <SidebarGroup title="邮件" :collapsed="sidebarCollapsed" class="w-full">
          <SidebarItem
            :to="{name: 'email'}"
            label="收件箱"
            :icon="IconInbox"
            :collapsed="sidebarCollapsed"
            :count="12"
            count-label="12 封未读"
          />
          <SidebarItem :to="{name: 'send'}" label="已发送" :icon="IconSend" :collapsed="sidebarCollapsed" />
        </SidebarGroup>
      </div>
    </DsRow>
  </DsSection>

  <DsSection
    id="commandbar"
    title="CommandBar"
    note="44px · 三段；上下文动作常驻 + disabled（位置不跳），disabled 时 Tooltip 说明原因"
  >
    <DsRow label="selectedCount" note="选择模型是 P3；这里手动给个数看中段点亮。右段（排序/密度/窗格/刷新）P2 不渲染">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-for="n in [0, 2]"
          :key="n"
          size="sm"
          :variant="selectedCount === n ? 'primary' : 'secondary'"
          @click="selectedCount = n"
        >
          已选 {{ n }} 项
        </Button>
      </div>
      <div class="w-full overflow-hidden rounded-lg border border-line">
        <CommandBar :selected-count="selectedCount" />
      </div>
      <p class="text-caption text-fg-muted">
        窄屏把中段折进 <code class="font-mono text-mono">⋯</code>、&lt; 768 整条隐藏，都在组件自己的断点类里 —— 缩窗口验。
      </p>
    </DsRow>
  </DsSection>

  <DsSection
    id="authinputs"
    title="EmailInput / PasswordInput"
    note="由 L1 拼出来的联体控件；$attrs（id / aria-describedby / autocomplete）必须落在真正的 <input> 上"
  >
    <DsRow label="EmailInput" stack note="左 Input + 右 Select，两个都在 Tab 序里（旧实现是透明 el-select 盖在 append 上）">
      <Field label="邮箱">
        <template #default="{id, describedBy, invalid}">
          <EmailInput
            :id="id"
            v-model="demoEmail"
            v-model:suffix="demoSuffix"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :domain-options="DOMAINS"
            placeholder="邮箱前缀"
            domain-label="选择域名"
            autocomplete="username"
          />
        </template>
      </Field>
      <Field label="站长隐藏了域名（loginDomain === 1）">
        <template #default="{id}">
          <EmailInput :id="id" v-model="demoEmail" hide-domain placeholder="完整邮箱" />
        </template>
      </Field>
      <Field label="错误态" error="邮箱格式不正确">
        <template #default="{id, describedBy, invalid}">
          <EmailInput
            :id="id"
            v-model="demoEmail"
            v-model:suffix="demoSuffix"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :domain-options="DOMAINS"
            domain-label="选择域名"
          />
        </template>
      </Field>
      <Field label="禁用态">
        <template #default="{id}">
          <EmailInput
            :id="id"
            v-model="demoEmail"
            :suffix="demoSuffix"
            :domain-options="DOMAINS"
            domain-label="选择域名"
            disabled
          />
        </template>
      </Field>
    </DsRow>

    <DsRow label="PasswordInput" stack note="按钮是 type=button（在 <form> 里不会误提交）+ aria-pressed + 切换不抢焦点">
      <Field label="密码">
        <template #default="{id, describedBy, invalid}">
          <PasswordInput
            :id="id"
            v-model="demoPwd"
            :aria-describedby="describedBy"
            :invalid="invalid"
            placeholder="密码"
            show-label="显示密码"
            hide-label="隐藏密码"
            autocomplete="current-password"
          />
        </template>
      </Field>
      <Field label="错误态" error="密码长度至少 6 位">
        <template #default="{id, describedBy, invalid}">
          <PasswordInput :id="id" v-model="demoPwd" :aria-describedby="describedBy" :invalid="invalid" />
        </template>
      </Field>
      <Field label="禁用态">
        <template #default="{id}">
          <PasswordInput :id="id" v-model="demoPwd" disabled />
        </template>
      </Field>
    </DsRow>
  </DsSection>

  <DsSection
    id="miniquota"
    title="MiniQuota"
    note="头像菜单里常驻的额度块；判定全在 useQuota()（7 种发信状态 × 3 种邮箱状态，见 useQuota.spec.js）"
  >
    <DsRow label="当前登录态" note="未登录时两行都走 unauthorized 分支 —— 这也正是它必须能优雅退化的那一支">
      <div class="w-64 rounded-lg border border-line bg-raised p-3 shadow-md">
        <MiniQuota />
      </div>
    </DsRow>
  </DsSection>

  <DsSection
    id="palette"
    title="CommandPalette / ShortcutsDialog"
    note="面板全站各挂一份，模块单例；顶栏、⌘K、/、头像菜单共用同一个 open"
  >
    <DsRow label="四种意图" note="无前缀 = 全局；> 命令；@ 邮箱；# 设置。未登录时「邮箱」组静默为空，不弹 Toast">
      <Button v-for="p in ['', '>', '@', '#']" :key="p || 'all'" size="sm" @click="openPalette(p)">
        {{ p ? `开面板（${p}）` : '开面板' }}
      </Button>
      <span class="inline-flex items-center gap-1.5 text-caption text-fg-muted">
        应用内是 <Kbd keys="Mod+K" size="sm" /> / <Kbd keys="/" size="sm" />；键盘注册在 AppShell 里，
        这页不在壳内，所以只有按钮能开
      </span>
    </DsRow>

    <DsRow label="? 面板" note="数据源是完整的 HOTKEY_CATALOG；当前没注册的键置灰，无权限的整行剔除">
      <Button size="sm" @click="openShortcuts()">开快捷键面板</Button>
      <span class="inline-flex items-center gap-1.5 text-caption text-fg-muted">
        应用内是 <Kbd keys="?" size="sm" />（同上，这页只能点按钮）
      </span>
    </DsRow>
  </DsSection>

  <!-- 预览页不在 AppShell 里，两个面板得自己挂 -->
  <CommandPalette />
  <ShortcutsDialog />
</template>

<style scoped>
/* 玻璃必须压在有内容的背板上才看得出材质；这块渐变只服务预览页 */
.ds-backdrop {
  background:
      radial-gradient(120% 120% at 20% 0%, var(--um-glow-from), transparent 60%),
      linear-gradient(135deg, var(--um-chart-1), var(--um-chart-4));
}

/* AuthLayout 的柔光层，一模一样地抄一份（那是 scoped 样式，跨组件用不了） */
.ds-glow {
  background-image:
      radial-gradient(120% 90% at 15% -10%, var(--um-glow-from), transparent 60%),
      radial-gradient(90% 80% at 90% 110%, var(--um-glow-from), transparent 65%),
      radial-gradient(var(--um-glow-dots) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 22px 22px;
}

/**
 * 站长背景图（`setting.background`）的替身。故意做成**同时有近白与近黑区域**的渐变：
 * 玻璃后面的实际亮度由背景图决定，而 §9.5 说这是唯一可能踩线的地方 —— 用一张温和的
 * 风景图当替身等于放过了这个风险。两端都能过审，任何真实背景图就都能过。
 */
.ds-photo {
  background-image: linear-gradient(
      118deg,
      #07080f 0%,
      #241a4d 22%,
      #6e56cf 40%,
      #cfc6ff 56%,
      #ffffff 70%,
      #f0e9d8 82%,
      #0b0b10 100%
  );
}
</style>
