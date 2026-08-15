<script setup>
/**
 * CommandPalette — ⌘K 命令面板（§6.2「CommandPalette」/ §7.2）
 *
 * 全站只挂一份（`AppShell`），开关与输入是 `useCommandPalette.js` 里的模块单例，
 * 所以顶栏搜索框、`⌘K`、`/`、头像菜单都能打开同一个面板，不会出现两份输入状态。
 *
 * 结构 = 「reka Dialog（焦点陷阱 / Esc / 滚动锁 / 返回焦点）+ GlassCard（材质）+
 * L1 `Command`（列表本体与键盘导航）」。这里没有用 L1 `Dialog`：它固定渲染一段
 * 标题区留白，而命令面板的第一行必须就是输入框（§6.2 的尺寸表也是按这个算的）。
 * 玻璃是 §4.12 点名允许的四个面之一（登录卡 / 命令面板 / Sheet / 遮罩）。
 *
 * 尺寸按 §6.2：640 × min(420, 60vh)。这里写成 `max-h` 而不是定高 —— 结果只有
 * 两三行时跟着内容收，420 是上限不是下限。
 *
 * 过滤**全部交给 `useCommandPalette()`**（`:filter="false"`）：面板要支持
 * `>` `@` `#` 前缀分流和中文子串匹配，reka 的 `useFilter` 只做单词包含，
 * 两套过滤并存必然打架。
 *
 * 水平居中用 `inset-x-0 mx-auto` 而不是 `left-1/2 -translate-x-1/2`：进出场
 * 关键帧要动 `transform`（scale .97→1），和位移共用一个属性会在动画那 200ms 里
 * 把面板甩到左边去。
 */
import {useI18n} from 'vue-i18n'
import {
    DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden,
} from 'reka-ui'
import {Command, Kbd, Spinner} from '@/components/ui'
import {OVERLAY_CLASS} from '@/components/ui/_shared/overlay.variants.js'
import GlassCard from './GlassCard.vue'
import {closePalette, useCommandPalette} from '@/composables/useCommandPalette.js'
import {cn} from '@/utils/cn.js'

const {t} = useI18n()
const {open, query, groups, run, mailboxLoading} = useCommandPalette()

function onOpenChange(value) {
    if (!value) closePalette()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay :class="OVERLAY_CLASS" />
      <!-- v-bind 那句是盖掉 reka 无条件写的 aria-describedby：没有 DialogDescription，
           留着就是一个悬空引用（axe aria-valid-attr-value，serious） -->
      <DialogContent
        v-bind="{'aria-describedby': undefined}"
        :class="cn(
          'fixed inset-x-0 top-[12vh] z-50 mx-auto flex w-[calc(100vw-2rem)] max-w-160 flex-col',
          'max-h-[min(420px,60vh)] outline-none',
          'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
        )"
      >
        <!-- 输入框就是第一行，所以标题只给读屏 -->
        <VisuallyHidden as-child>
          <DialogTitle>{{ t('shell.searchAria') }}</DialogTitle>
        </VisuallyHidden>

        <GlassCard class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Command
            :items="groups"
            :search-term="query"
            :filter="false"
            max-height="max-h-none"
            :placeholder="t('shell.searchPlaceholder')"
            :aria-label="t('shell.searchAria')"
            :empty-text="t('shell.paletteEmpty')"
            class="min-h-0 flex-1"
            @update:search-term="query = $event"
            @select="run"
          >
            <template #footer>
              <div class="flex items-center gap-3">
                <span class="truncate">{{ t('shell.paletteHint') }}</span>
                <Spinner v-if="mailboxLoading" size="xs" class="shrink-0" />
                <span class="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                  <Kbd :keys="['Up', 'Down']" aria-hidden="true" />
                  <Kbd keys="Enter" aria-hidden="true" />
                  <Kbd keys="Esc" aria-hidden="true" />
                </span>
              </div>
            </template>
          </Command>
        </GlassCard>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
