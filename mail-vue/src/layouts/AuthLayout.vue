<script setup>
/**
 * AuthLayout — 认证页外壳（§5.3.1 / §8.5 / §9.5）
 *
 * ```
 * ░░ 站长背景图 → 12% scrim → 柔光（+ 可选粒子）░░      ◐ 主题  文A 语言
 *                  ┌ 毛玻璃卡片 440px · r20 ┐
 *                  │  ⬡ 站点名 / 副标题      │
 *                  │  <slot />               │
 *                  └────────────────────────┘
 *                        ⓘ 文档 · 源码
 * ```
 *
 * 四层背板自底向上：站长背景图（`setting.background`）→ `--um-auth-scrim` →
 * 柔光渐变 + 3% 点阵 → `ParticleField`。开关判定全在 `useBgEffect()` 里
 * （站长策略优先，`optional` 时才看用户偏好），这里只负责画。
 *
 * 三处刻意的「不做」：
 * - 背景图**不阻塞首屏**。旧实现在路由守卫里 `new Image()` 等 onload、还挂了 3 秒
 *   超时兜底（`router/index.js:136-165`），网络差时用户白等 3 秒才看到输入框。
 *   这里改成 `<img>` 异步解码 + `opacity` 淡入，表单先渲染。
 * - 不做鼠标视差倾斜、不做边框流光（§5.3.1 点名的两个廉价感来源）。
 * - 卡片自己滚（`max-h` + `overflow-y-auto`）而不是整页滚：注册页字段多的时候
 *   整页滚会把背景图一起拖走，玻璃卡的材质感立刻消失（§5.3.1 注册页那条）。
 *
 * 主题与语言开关放在卡片**外侧**右上角 —— 登录前也要能切，旧登录页做不到。
 */
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import IconSun from '~icons/lucide/sun'
import IconMoon from '~icons/lucide/moon'
import IconLanguages from '~icons/lucide/languages'
import IconBookOpen from '~icons/lucide/book-open'
import IconGithub from '~icons/lucide/github'
import {Button, Tooltip} from '@/components/ui'
import {BrandMark, GlassCard, ParticleField} from '@/components/composite'
import {useBgEffect} from '@/composables/useBgEffect.js'
import {useTheme} from '@/composables/useTheme.js'
import {useSettingStore} from '@/store/setting.js'
import {authCardAlpha} from '@/design/glass.js'
import {cvtR2Url} from '@/utils/convert.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 卡片内的标题；缺省用站点名 */
    title: {type: String, default: ''},
    /** 标题下的一行说明 */
    description: {type: String, default: ''},
    /** 卡片额外类名（注册页用来放宽高度上限） */
    cardClass: {type: [String, Array, Object], default: undefined},
})

const {t} = useI18n()
const settingStore = useSettingStore()
const {isDark, toggle: toggleTheme} = useTheme()
const {glowVisible, particleMode} = useBgEffect()

const siteName = computed(() => settingStore.settings.title || 'Unicorn Mail')
const backgroundUrl = computed(() => {
    const raw = settingStore.settings.background
    return raw ? cvtR2Url(raw) : ''
})

/**
 * 站长可调 0.55–1.00，但**设了背景图之后下限抬到 0.88**：照片亮度任意，0.55 时
 * 卡内 `text-fg-muted` 在近黑照片上只有 2.2:1（§9.5 实测，见 `design/glass.js`）。
 * 这一层判断只能在这里做 —— GlassCard 看不见背景图。
 */
const cardOpacity = computed(() => authCardAlpha(settingStore.settings.loginOpacity, !!backgroundUrl.value))

const bgLoaded = ref(false)

function toggleLang() {
    settingStore.lang = settingStore.lang === 'en' ? 'zh' : 'en'
}
</script>

<template>
  <div class="relative flex min-h-full flex-col overflow-hidden bg-canvas">
    <!-- ① 站长背景图：异步淡入，不参与布局，也不阻塞表单 -->
    <img
      v-if="backgroundUrl"
      :src="backgroundUrl"
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchpriority="low"
      :class="cn(
        'pointer-events-none absolute inset-0 -z-30 size-full object-cover transition-opacity duration-300',
        bgLoaded ? 'opacity-100' : 'opacity-0',
      )"
      @load="bgLoaded = true"
    >
    <!-- ② scrim：只在有背景图时压，纯色底上没有对比度风险 -->
    <div
      v-if="backgroundUrl"
      class="pointer-events-none absolute inset-0 -z-20 bg-(--um-auth-scrim)"
      aria-hidden="true"
    />

    <!-- ③ 柔光：紫罗兰径向渐变 + 3% 点阵（§9.5 两套主题各一组值） -->
    <div
      v-if="glowVisible"
      class="auth-glow pointer-events-none absolute inset-0 -z-10 animate-auth-glow"
      aria-hidden="true"
    />

    <!-- ④ 粒子：桌面 + 未减少动效才动，移动端/低端机由 useBgEffect 判成 off -->
    <ParticleField
      v-if="particleMode !== 'off'"
      :mode="particleMode"
      class="absolute inset-0 -z-10"
    />

    <!-- 卡片外侧的主题 / 语言开关 -->
    <div class="absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-3">
      <Tooltip :text="t('shell.toggleTheme')">
        <Button variant="ghost" size="icon-sm" :label="t('shell.toggleTheme')" @click="toggleTheme($event)">
          <IconSun v-if="isDark" class="size-4.5" aria-hidden="true" />
          <IconMoon v-else class="size-4.5" aria-hidden="true" />
        </Button>
      </Tooltip>
      <Tooltip :text="t('shell.toggleLang')">
        <Button variant="ghost" size="icon-sm" :label="t('shell.toggleLang')" @click="toggleLang">
          <IconLanguages class="size-4.5" aria-hidden="true" />
        </Button>
      </Tooltip>
    </div>

    <main class="flex flex-1 items-center justify-center px-4 py-14">
      <!-- 宽度 min(440px, 100% - 32px)：父级 px-4 已经让出两侧 16px，所以这里只写 min(440px,100%) -->
      <GlassCard
        radius="2xl"
        :opacity="cardOpacity"
        :class="cn(
          'w-[min(440px,100%)] animate-auth-card p-8',
          'max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain',
          props.cardClass,
        )"
      >
        <header class="mb-6">
          <div class="flex items-center gap-2 text-fg">
            <BrandMark class="size-5 shrink-0" />
            <span class="truncate text-title font-semibold">{{ siteName }}</span>
          </div>
          <h1 v-if="props.title" class="mt-4 text-h4 text-fg">{{ props.title }}</h1>
          <p v-if="props.description" class="mt-1 text-label text-fg-muted">{{ props.description }}</p>
        </header>

        <slot />
      </GlassCard>
    </main>

    <footer class="relative z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-4 text-caption text-fg-muted">
      <a
        class="inline-flex items-center gap-1 rounded-xs hover:text-fg"
        href="https://doc.cloud-mail.top"
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconBookOpen class="size-3.5" aria-hidden="true" />{{ t('document') }}
      </a>
      <a
        v-if="settingStore.settings.projectLink"
        class="inline-flex items-center gap-1 rounded-xs hover:text-fg"
        href="https://github.com/uni688/Unicorn-Mail"
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconGithub class="size-3.5" aria-hidden="true" />GitHub
      </a>
    </footer>
  </div>
</template>

<style scoped>
/**
 * 柔光层用 CSS 而不是工具类：两层渐变 + 一个 background-size 写成 arbitrary value
 * 会长到没人愿意读。数值全部来自 token，主题切换自动跟随（§9.5）。
 */
.auth-glow {
    background-image:
        radial-gradient(120% 90% at 15% -10%, var(--um-glow-from), transparent 60%),
        radial-gradient(90% 80% at 90% 110%, var(--um-glow-from), transparent 65%),
        radial-gradient(var(--um-glow-dots) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 22px 22px;
}
</style>
