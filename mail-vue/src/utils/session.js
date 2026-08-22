/**
 * 会话清理 —— 「退出登录 / 掉线 / 注销账号」的唯一出口（审计 P2-5）
 *
 * 之前四条退出路径（`axios/index.js` 的 401、`Topbar.vue`、`useCommandPalette.js`、
 * `views/setting/index.vue` 的注销）都只做两件事：删 token、跳 `/login`。
 * 而**不刷新页面**换人登录时，下面这些东西全都还留在内存里：
 *   - `useMailboxes()` 的邮箱数组（上一个账号的邮箱地址）
 *   - `useCounts()` 的角标数字（新账号的侧栏会先显示上一个人的未读数）
 *   - `useMailPrefs()` 的 `recent`（上一个账号的邮箱地址快照）与 `showImages`
 *     （远程图片放行是逐人做的隐私选择，不能继承）
 *   - 9 个 pinia store 里的账号私有数据（`user.user`、`account.currentAccount`…）
 *
 * 所以退出这件事必须集中成一处：`clearSession()`。
 *
 * 不清的东西：`setting`（站点公开配置 + 语言）与 `ui`（侧栏折叠等设备偏好）——
 * 它们跟着这台设备而不是跟着账号，登录页也要用 `setting.lang` 才能显示对语言。
 * 主题 / 背景效果（`useTheme` / `useBgEffect`）同理，留着。
 */
import router from '@/router'
import {useAccountStore} from '@/store/account.js'
import {useUserStore} from '@/store/user.js'
import {useEmailStore} from '@/store/email.js'
import {useSendStore} from '@/store/send.js'
import {userDraftStore} from '@/store/draft.js'
import {useRoleStore} from '@/store/role.js'
import {useWriterStore} from '@/store/writer.js'
import {useCounts} from '@/composables/useCounts.js'
import {useMailboxes} from '@/composables/useMailboxes.js'
import {useMailPrefs} from '@/composables/useMailPrefs.js'

/** 账号私有的 store。`$reset()` 对 option store 就是「回到 state() 的初值」 */
const SCOPED_STORES = [
    useAccountStore, useUserStore, useEmailStore,
    useSendStore, userDraftStore, useRoleStore, useWriterStore,
]

/**
 * 清掉当前账号在内存 / localStorage 里的一切痕迹。
 *
 * 每一步都各自 try/catch：这个函数跑在「已经决定要退出」之后，
 * 其中任何一环报错都不该把用户留在一个半退出的界面上。
 *
 * 调用顺序有讲究，见 [[endSession]] —— 直接在邮件页上调这个函数会先触发
 * `MailList` 的「切邮箱」watch（`currentAccountId` 被重置成 0），
 * 那一次请求已经没有 token，会以一条多余的 401 报错收场。
 *
 * @param {boolean} [keepToken] token 已经被调用方删掉时传 true
 */
export function clearSession({keepToken = false} = {}) {

    if (!keepToken) removeToken()

    for (const useStore of SCOPED_STORES) {
        try {
            useStore().$reset()
        } catch { /* store 还没被任何组件用过：本来就是初值 */ }
    }

    try {
        useCounts().resetCounts()
    } catch { /* empty */ }

    try {
        useMailboxes().resetMailboxes()
    } catch { /* empty */ }

    try {
        useMailPrefs().resetPrefs()
    } catch { /* empty */ }
}

function removeToken() {
    try {
        localStorage.removeItem('token')
    } catch { /* 隐私模式下 localStorage 可能整个不可用 */ }
}

/**
 * 退出登录的完整动作，四条路径（顶栏、命令面板、注销账号、掉线 401）都走这一个。
 *
 * 顺序是：**先删 token → 再离开当前页 → 最后才清状态**。
 * 反过来（先清状态）会让还挂在屏幕上的邮件视图看见 `currentAccountId` 变化并重新取一次列表，
 * 那一次必然 401，用户在跳转前先吃到一条无意义的报错。
 */
export function endSession({to = '/login', keepToken = false} = {}) {

    if (!keepToken) removeToken()

    const reset = () => clearSession({keepToken: true})

    return Promise.resolve(router.replace(to)).then(reset, reset)
}

export default clearSession
