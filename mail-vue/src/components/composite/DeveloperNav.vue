<script setup>
/**
 * DeveloperNav — 开发者中心的四页横向导航
 *
 * **过渡件（P5 需回收）**：§5.3.5 的终态是「设置中心左侧 220px 分组导航 → 开发者分组
 * 下的 4 个条目」，但那个 `SettingsShell` 是 P5 的交付物（§0.8）。P4 的四页是四条独立
 * 整页路由，没有壳可挂，所以这里给一条轻量横向导航；P5 接壳时**整个文件删掉**即可，
 * 四个页面除了少掉 `<DeveloperNav />` 这一行之外不需要改动。
 *
 * 不用 `Tabs`：§5.3.5 明确「不再做成页内 Tab」—— Tab 的语义是「同一页里切换面板」，
 * 而这四项各自是独立路由、独立标题、可深链、可后退。所以这里是一组 `RouterLink`
 * （`<nav>` + `aria-current="page"`），读屏会念成「导航」而不是「标签页」。
 *
 * 条目按权限裁剪：`keys` / `console` / `docs` 要 `api-key:query`，`logs` 要
 * `api-log:query`。没有权限的项**不出现**（路由本身也没注入，见 `perm/perm.js`），
 * 而不是出现但点了 404。
 */
import {computed} from 'vue'
import {RouterLink, useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconKey from '~icons/lucide/key-round'
import IconLogs from '~icons/lucide/scroll-text'
import IconTerminal from '~icons/lucide/terminal'
import IconBook from '~icons/lucide/book-open'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const {t} = useI18n()
const route = useRoute()
const router = useRouter()

const ITEMS = [
    {name: 'developer-keys', label: 'developer.keys', icon: IconKey},
    {name: 'developer-logs', label: 'developer.logs', icon: IconLogs},
    {name: 'developer-console', label: 'developer.console', icon: IconTerminal},
    {name: 'developer-docs', label: 'developer.docs', icon: IconBook},
]

/** 只列真的注入了的路由：没有对应权限时那条 route 根本不存在 */
const items = computed(() => ITEMS
    .filter(item => router.hasRoute(item.name))
    .map(item => ({...item, active: String(route.name) === item.name})))
</script>

<template>
  <nav
    v-if="items.length > 1"
    :aria-label="t('developer.title')"
    :class="cn('flex min-w-0 items-center gap-1 overflow-x-auto', props.class)"
  >
    <RouterLink
      v-for="item in items"
      :key="item.name"
      :to="{name: item.name}"
      :aria-current="item.active ? 'page' : undefined"
      :class="cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body whitespace-nowrap transition-colors',
        item.active
          ? 'bg-selected text-accent-fg'
          : 'text-fg-muted hover:bg-hover hover:text-fg',
      )"
    >
      <component :is="item.icon" class="size-4" aria-hidden="true" />
      {{ t(item.label) }}
    </RouterLink>
  </nav>
</template>
