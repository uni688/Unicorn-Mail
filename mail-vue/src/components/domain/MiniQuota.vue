<script setup>
/**
 * MiniQuota — 头像菜单里常驻的额度块（§5.1「头像菜单（含常驻 MiniQuota）」/ §6.2）
 *
 * 结构照 §6.2：`已发 3 / 50` + 2px 进度条 + 一句人话。判定全在 `useQuota()` 里，
 * 这里只排版 —— 同一个 composable 之后给 `/settings/account/usage` 复用。
 *
 * **与 §5.1 线框的差异（已在 P2 交付说明里报备）**：线框第二行写的是「存储」，
 * 这里换成「邮箱额度」。存储用量前端没有任何数据源（要等 §10.5 的用量接口，排在 P5），
 * 画一条永远 0% 的进度条属于假信息；邮箱额度是现成的（`role.accountCount`）。
 */
import {useI18n} from 'vue-i18n'
import {Badge, Meter} from '@/components/ui'
import {useQuota} from '@/composables/useQuota.js'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    class: {type: [String, Array, Object], default: undefined},
})

const {t} = useI18n()
const {
    sendState, sendMetered, sendLimit, sendUsed, sendLabel, sendValueText, sendHint,
    accountState, accountLabel,
} = useQuota()

/** 关闭 / 禁发是需要解释的状态，给 warning；无权限只是「你没这功能」，保持中性 */
function tone(state) {
    return state === 'disabled' || state === 'banned' ? 'warning' : 'neutral'
}
</script>

<template>
  <dl :class="cn('grid gap-3 text-caption', props.class)">
    <div class="grid gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <dt class="text-fg-muted">{{ t('shell.quotaSend') }}</dt>
        <dd class="flex items-center gap-1.5">
          <span v-if="sendMetered" class="tabular-nums text-fg">{{ sendValueText }}</span>
          <Badge size="sm" :tone="tone(sendState)">{{ sendLabel }}</Badge>
        </dd>
      </div>
      <Meter
        v-if="sendMetered"
        :value="sendUsed"
        :max="sendLimit"
        :label="t('shell.quotaSend')"
        :value-text="sendValueText"
      />
      <!-- 有数字时才需要这句话；没数字时它等于上面的 Badge，重复念一遍反而吵 -->
      <p v-if="sendMetered" class="text-micro text-fg-subtle">{{ sendHint }}</p>
    </div>

    <div class="flex items-baseline justify-between gap-2">
      <dt class="text-fg-muted">{{ t('shell.quotaMailbox') }}</dt>
      <dd>
        <span v-if="accountState === 'limited'" class="tabular-nums text-fg">{{ accountLabel }}</span>
        <Badge v-else size="sm" :tone="tone(accountState)">{{ accountLabel }}</Badge>
      </dd>
    </div>
  </dl>
</template>
