<script setup>
/**
 * ShortcutsDialog — `?` 快捷键面板（§7.1 末句「`?` 打开快捷键面板；设置中可整体关闭」）
 *
 * 数据源是 `HOTKEY_CATALOG`（§7.1 那张表的全文）而不是运行时注册表，所以面板永远
 * 显示完整的一份表；某个键**当前是否可用**由注册表决定，不可用的行置灰并标
 * `aria-disabled`。两个方向的谎都被这个设计挡住了：忘了注册不会少一行，
 * 没实现的键也不会被说成能用。
 *
 * 无权限的行**整行剔除**（`useHotkeyCatalog(hasPerm)`），这是 §7.1 的原话
 * 「无权限时不响应且不出现在 `?` 面板」——「置灰」会泄露站点有哪些管理功能。
 *
 * 「启用快捷键」开关落在 localStorage（`useHotkeys.js` 的 `ENABLED_KEY`）；
 * P5 有了 `user_setting` 之后换成落库，面板这边不用改。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {Dialog, Kbd, Switch} from '@/components/ui'
import {hotkeysEnabled, setHotkeysEnabled, useHotkeyCatalog} from '@/composables/useHotkeys.js'
import {useShortcutsDialog} from '@/composables/useShortcutsDialog.js'
import {hasPerm} from '@/perm/perm.js'

const {t} = useI18n()
const {open, closeShortcuts} = useShortcutsDialog()
const catalog = useHotkeyCatalog(hasPerm)

/** 两列瀑布：作用域块不拆行，靠 `columns` 排版，比手工分配左右两栏稳 */
const groups = computed(() => catalog.value.map((group) => ({
    scope: group.scope,
    title: t(`hotkey.scope_${group.scope}`),
    items: group.items.map((item) => ({
        ...item,
        text: t(`hotkey.${item.label}`),
        // 序列键（`g i`）拆成两枚 Kbd —— Kbd 只认 `+`，整串塞进去会渲染成一个大键帽
        combos: String(item.keys).trim().split(/\s+/),
    })),
})))

function onOpenChange(value) {
    if (!value) closeShortcuts()
}
</script>

<template>
  <Dialog
    :open="open"
    size="xl"
    :title="t('shell.shortcutsTitle')"
    :description="t('shell.shortcutsDesc')"
    @update:open="onOpenChange"
  >
    <div class="pb-2 sm:columns-2 sm:gap-6">
      <section v-for="group in groups" :key="group.scope" class="mb-4 break-inside-avoid">
        <h3 class="mb-1 text-caption text-fg-muted">{{ group.title }}</h3>
        <dl class="grid gap-0.5">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="flex min-h-7 items-center gap-3 rounded-sm px-1"
            :aria-disabled="item.available ? undefined : 'true'"
          >
            <dt :class="['min-w-0 flex-1 truncate text-body', item.available ? 'text-fg' : 'text-fg-disabled']">
              {{ item.text }}
            </dt>
            <dd class="flex shrink-0 items-center gap-1">
              <Kbd
                v-for="(combo, i) in item.combos"
                :key="`${item.id}-${i}`"
                :keys="combo"
                :class="item.available ? '' : 'opacity-60'"
              />
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <template #footer>
      <Switch
        :model-value="hotkeysEnabled"
        :label="t('shell.shortcutsToggle')"
        class="mr-auto"
        @update:model-value="setHotkeysEnabled"
      />
    </template>
  </Dialog>
</template>
