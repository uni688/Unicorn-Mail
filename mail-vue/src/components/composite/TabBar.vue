<script setup>
/**
 * TabBar — 移动端底部 Tab（§5.4「底部 Tab：邮件 / 邮箱 / 设置（3 项，不多于 4 项）」）
 *
 * 只在 `< md` 出现（`md:hidden` 写在组件自己身上，调用方不会忘）。高度取
 * `--um-tabbar-h`（56px）并额外垫 `env(safe-area-inset-bottom)`，所以在 iPhone 的
 * 手势条上不会被切掉；§5.4 的「触摸目标 ≥ 44×44」由每格 `min-h-11` 保证。
 *
 * 三个落点都用**路由名**判定存在性（`router.hasRoute`）：
 * - 邮件 → `email`
 * - 邮箱 → 旧账号浮层（`uiStore.accountShow`），这是 §10.7 认可的过渡入口；
 *   `manyEmail !== 0` 或没有 `account:query` 时这一格**不出现**（点了不会有反应的格子
 *   比少一格更糟），此时底部就是 2 格。
 * - 设置 → `setting`
 *
 * 「邮箱」那格是动作而不是路由，所以整条不是 `RouterLink` 列表：选中态由
 * `active` 计算，动作格永远不选中。
 */
import {computed} from 'vue'
import {RouterLink, useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import IconInbox from '~icons/lucide/inbox'
import IconAtSign from '~icons/lucide/at-sign'
import IconSettings from '~icons/lucide/settings'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const settingStore = useSettingStore()

/** 「邮件」高亮的路由集合：列表与正文都算在邮件里（§5.4 移动端是列表 → 正文的推入式） */
const MAIL_ROUTES = ['email', 'content', 'star', 'send', 'draft']

const canSwitch = computed(() => settingStore.settings.manyEmail === 0 && hasPerm('account:query'))

const tabs = computed(() => {
    const out = []
    if (router.hasRoute('email')) {
        out.push({
            key: 'mail', label: t('shell.tabMail'), icon: IconInbox,
            to: {name: 'email'}, active: MAIL_ROUTES.includes(String(route.name)),
        })
    }
    if (canSwitch.value) {
        out.push({
            key: 'mailboxes', label: t('shell.tabMailboxes'), icon: IconAtSign,
            action: () => { uiStore.accountShow = true }, active: false,
        })
    }
    if (router.hasRoute('setting')) {
        out.push({
            key: 'settings', label: t('shell.tabSettings'), icon: IconSettings,
            to: {name: 'setting'}, active: route.name === 'setting',
        })
    }
    return out
})

const ITEM = 'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5'
    + ' text-micro transition-colors'
</script>

<template>
  <nav
    v-if="tabs.length > 1"
    :aria-label="t('shell.mainNav')"
    :class="cn(
      'flex shrink-0 items-stretch gap-1 border-t border-line bg-surface px-2 md:hidden',
      'h-[calc(var(--um-tabbar-h)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]',
      props.class,
    )"
  >
    <template v-for="tab in tabs" :key="tab.key">
      <RouterLink
        v-if="tab.to"
        :to="tab.to"
        :class="cn(ITEM, tab.active ? 'text-accent-fg' : 'text-fg-muted')"
        :aria-current="tab.active ? 'page' : undefined"
      >
        <component :is="tab.icon" class="size-5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ tab.label }}</span>
      </RouterLink>
      <button
        v-else
        type="button"
        :class="cn(ITEM, 'text-fg-muted')"
        @click="tab.action()"
      >
        <component :is="tab.icon" class="size-5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ tab.label }}</span>
      </button>
    </template>
  </nav>
</template>
