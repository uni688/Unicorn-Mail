/**
 * useQuota — 额度判定（§6.2 MiniQuota：「逻辑来自 `useQuota()`，与 `/settings/account/usage`
 * 共用同一个 composable，不再像 `header/index.vue:98-157` 那样在模板里散着算」）
 *
 * 判定分支逐条搬自旧顶栏（`layout/header/index.vue:100-159`），一个都没改：
 *
 * ```
 * send:    settings.send===1 → disabled
 *          !hasPerm('email:send') → unauthorized
 *          role.sendType==='ban' → banned      | 'internal' → internal
 *          !role.sendCount → unlimited
 *          role.sendType==='day' → day         | 'count' → count      ← 只有这两支有数字
 * account: settings.manyEmail || settings.addEmail → disabled
 *          !hasPerm('account:add') → unauthorized
 *          role.accountCount → limited（只知上限）  | 否则 unlimited
 * ```
 *
 * 「已用」只有发信侧拿得到（`user.sendCount`），所以**只有发信额度画进度条**。
 * 邮箱侧后端没给已用数（旧顶栏也只显示上限），画一条 0% 的条属于假信息。
 * 存储用量同理，前端在 §10.5 的用量接口（P5）之前没有任何数据源，因此不做。
 *
 * 文案全部走既有顶层 i18n 键（`disabled` / `unauthorized` / `unlimited` /
 * `sendBanned` / `sendInternal` / `daily` / `total` / `totalUserAccount`），
 * 只有「一句人话」是新增的两条 `shell.quotaRemain*`。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useUserStore} from '@/store/user.js'
import {useSettingStore} from '@/store/setting.js'
import {hasPerm} from '@/perm/perm.js'

/** 发信额度的 7 种状态；`day` / `count` 之外都没有数字 */
export const SEND_STATES = ['disabled', 'unauthorized', 'banned', 'internal', 'unlimited', 'day', 'count']

/** 状态 → 既有 i18n 键，避免为同一句话再造一套文案 */
const SEND_LABEL_KEY = {
    disabled: 'disabled',
    unauthorized: 'unauthorized',
    banned: 'sendBanned',
    internal: 'sendInternal',
    unlimited: 'unlimited',
    day: 'daily',
    count: 'total',
}

export function useQuota() {
    const {t} = useI18n()
    const userStore = useUserStore()
    const settingStore = useSettingStore()

    const role = computed(() => userStore.user?.role ?? {})

    /* ---------------------------------------------------------- 发信额度 */

    const sendState = computed(() => {
        if (settingStore.settings.send === 1) return 'disabled'
        if (!hasPerm('email:send')) return 'unauthorized'
        if (role.value.sendType === 'ban') return 'banned'
        if (role.value.sendType === 'internal') return 'internal'
        if (!role.value.sendCount) return 'unlimited'
        if (role.value.sendType === 'day') return 'day'
        if (role.value.sendType === 'count') return 'count'
        return 'unlimited'
    })

    const sendMetered = computed(() => sendState.value === 'day' || sendState.value === 'count')
    const sendLimit = computed(() => (sendMetered.value ? Number(role.value.sendCount) || 0 : 0))
    const sendUsed = computed(() => Math.max(0, Number(userStore.user?.sendCount) || 0))
    const sendLeft = computed(() => Math.max(0, sendLimit.value - sendUsed.value))
    const sendLabel = computed(() => t(SEND_LABEL_KEY[sendState.value]))
    /** 读屏与 Meter 的 valueText：「3 / 50」 */
    const sendValueText = computed(() => `${sendUsed.value} / ${sendLimit.value}`)

    /** 一句人话（§6.2）；没有数字时状态词本身就是那句话 */
    const sendHint = computed(() => {
        if (!sendMetered.value) return sendLabel.value
        return t(sendState.value === 'day' ? 'shell.quotaRemainDay' : 'shell.quotaRemainTotal', {n: sendLeft.value})
    })

    /* ---------------------------------------------------------- 邮箱额度 */

    const accountState = computed(() => {
        if (settingStore.settings.manyEmail || settingStore.settings.addEmail) return 'disabled'
        if (!hasPerm('account:add')) return 'unauthorized'
        return role.value.accountCount ? 'limited' : 'unlimited'
    })

    const accountLimit = computed(() => Number(role.value.accountCount) || 0)

    const accountLabel = computed(() => (
        accountState.value === 'limited'
            ? t('totalUserAccount', {msg: accountLimit.value})
            : t(accountState.value)
    ))

    return {
        sendState, sendMetered, sendLimit, sendUsed, sendLeft, sendLabel, sendValueText, sendHint,
        accountState, accountLimit, accountLabel,
    }
}
