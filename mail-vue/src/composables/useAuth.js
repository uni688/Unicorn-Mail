/**
 * useAuth —— 登录 / 注册 / 绑定 / OAuth 回调四个视图共用的那部分逻辑
 *
 * 旧实现把这四件事全塞在一个 843 行的 `views/login/index.vue` 里（登录表单、注册表单、
 * 绑定弹窗、OAuth 回调、Turnstile、云朵动画共处一室）。§5.3.1 把绑定拆成独立步骤页之后
 * 四个视图各自成文件，但下面三件事是它们真正共享的，抽在这里而不是复制四遍：
 *
 * - `useAuthSession()`：拿到 token 之后的落地流程（写 token → 拉用户 → 注入动态路由 → 跳转）
 * - `useEmailSuffix()`：`前缀 + @域名` 的拼装与三段校验（站长可以用 `login_domain` 关掉后缀选择）
 * - 校验函数返回 **i18n 键**而不是文案：视图把它渲染成 `Field` 的行内 error，
 *   不再像旧代码那样每条都弹一个 toast（同时点空三个字段会叠三条）。
 */
import {computed, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {websiteConfig} from '@/request/setting.js'
import {loginUserInfo} from '@/request/my.js'
import {permsToRouter} from '@/perm/perm.js'
import {isEmail} from '@/utils/verify-utils.js'
import {useAccountStore} from '@/store/account.js'
import {useSettingStore} from '@/store/setting.js'
import {useUiStore} from '@/store/ui.js'
import {useUserStore} from '@/store/user.js'

/** 后端 `register` / `oauthBindUser` 都按这个下限校验邮箱前缀，缺省值与后端一致 */
const DEFAULT_MIN_PREFIX = 1

/**
 * 「授权过了但还没绑邮箱」的中间态存放处（§5.3.1 把绑定弹窗改成独立页 `/register/bind`）。
 *
 * 用 sessionStorage 而不是 query 参数：`oauthUserId` 放进地址栏会留在浏览历史、
 * Referer 和分享链接里。用 pinia 也不行 —— 绑定页刷一下就丢，用户会莫名回到登录页。
 */
const OAUTH_PENDING_KEY = 'um-oauth-pending'

/** @param {{oauthUserId: string|number, provider?: string}} pending */
export function setPendingOauth(pending) {
    sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify(pending))
}

/** @returns {{oauthUserId: string|number, provider?: string}|null} */
export function readPendingOauth() {
    try {
        const raw = sessionStorage.getItem(OAUTH_PENDING_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed?.oauthUserId ? parsed : null
    } catch {
        return null
    }
}

export function clearPendingOauth() {
    sessionStorage.removeItem(OAUTH_PENDING_KEY)
}

/**
 * 登录成功后的收尾。三个入口（密码登录 / OAuth 直登 / OAuth 绑定）完全共用。
 */
export function useAuthSession() {
    const router = useRouter()
    const accountStore = useAccountStore()
    const userStore = useUserStore()
    const uiStore = useUiStore()
    const settingStore = useSettingStore()

    /**
     * 重新拉一次站点配置：登录后拿到的字段比匿名态多（额度、推送开关…）。
     * 故意**不 await** —— 它只影响后续页面的展示，让它去阻塞跳转纯属浪费。
     */
    function refreshWebsiteConfig() {
        return websiteConfig().then((setting) => {
            settingStore.settings = setting
            settingStore.domainList = setting.domainList
            document.title = setting.title
        }).catch((e) => {
            console.error(e)
        })
    }

    /**
     * @param {string} token 后端下发的登录 token
     */
    async function saveToken(token) {
        localStorage.setItem('token', token)
        refreshWebsiteConfig()

        const user = await loginUserInfo()
        accountStore.currentAccountId = user.account.accountId
        accountStore.currentAccount = user.account
        userStore.user = user

        // 权限键 → 动态路由。刷新前的这一次注入只在内存里，`init()` 会在下次启动时重做
        permsToRouter(user.permKeys).forEach((route) => {
            router.addRoute('layout', route)
        })

        await router.replace({name: 'layout'})
        uiStore.showNotice()
    }

    return {saveToken, refreshWebsiteConfig}
}

/**
 * 「邮箱前缀 + @域名」控件的状态与校验。
 *
 * `settings.loginDomain === 1` 时站长选择了隐藏域名，此时用户输入的是完整邮箱，
 * 后缀选择器整个不出现 —— 拼装和校验都要跟着变，所以两件事放在一起。
 */
export function useEmailSuffix() {
    const settingStore = useSettingStore()

    const domainList = computed(() => settingStore.domainList ?? [])
    const domainOptions = computed(() => domainList.value.map((d) => ({label: d, value: d})))
    /** 站长隐藏了域名：用户自己输完整邮箱 */
    const hideDomain = computed(() => settingStore.settings.loginDomain === 1)
    const minPrefix = computed(() => settingStore.settings.minEmailPrefix ?? DEFAULT_MIN_PREFIX)

    const suffix = ref(domainList.value[0] ?? '')
    // 匿名态下 `init()` 已经把 domainList 灌好了，这条 watch 只兜「登录后配置刷新」的情况
    watch(domainList, (list) => {
        if (!suffix.value && list.length > 0) suffix.value = list[0]
    })

    /** @returns {string} 提交给后端的完整邮箱 */
    function fullEmail(prefix) {
        const value = (prefix ?? '').trim()
        return hideDomain.value ? value : value + suffix.value
    }

    /**
     * 邮箱三段校验，顺序与旧实现一致：空 → 前缀长度 → 合法性。
     *
     * @param {string} prefix 输入框里的原始值
     * @param {{checkPrefixLength?: boolean}} [options] 注册/绑定要查前缀长度，登录不查
     * @returns {{key: string, params?: Record<string, unknown>}|null} null 表示通过
     */
    function checkEmail(prefix, {checkPrefixLength = false} = {}) {
        const value = (prefix ?? '').trim()
        if (!value) return {key: 'emptyEmailMsg'}

        if (checkPrefixLength) {
            const name = hideDomain.value ? value.split('@')[0] : value
            if (name.length < minPrefix.value) {
                return {key: 'minEmailPrefix', params: {msg: minPrefix.value}}
            }
        }

        if (!isEmail(fullEmail(value))) return {key: 'notEmailMsg'}
        return null
    }

    return {suffix, domainList, domainOptions, hideDomain, minPrefix, fullEmail, checkEmail}
}

/** 后端 `register` 的密码下限，与 `pwdLengthMsg` 文案对应 */
export const PASSWORD_MIN = 6

/**
 * @param {string} password
 * @param {{minLength?: number}} [options] 登录只查空（老密码可能短于 6 位）
 * @returns {{key: string}|null}
 */
export function checkPassword(password, {minLength = 0} = {}) {
    if (!password) return {key: 'emptyPwdMsg'}
    if (minLength > 0 && password.length < minLength) return {key: 'pwdLengthMsg'}
    return null
}

/**
 * @returns {{key: string}|null}
 */
export function checkConfirmPassword(password, confirmPassword) {
    if (password !== confirmPassword) return {key: 'confirmPwdFailMsg'}
    return null
}

/**
 * 注册码：站长把 `regKey` 设成 0 时必填、2 时可选、其他值不出现这个字段。
 * @returns {{key: string}|null}
 */
export function checkRegKey(code, regKey) {
    if (regKey === 0 && !code) return {key: 'emptyRegKeyMsg'}
    return null
}

/**
 * 密码强度：只用来给用户一个「够不够」的直觉，不做拦截（拦截规则在后端）。
 *
 * 有意不引 zxcvbn（gzip 400KB+，为一根进度条不值）。四档判定用长度 + 字符类别数，
 * 与 NIST SP 800-63B 的取向一致：长度权重最大，不强制「必须含特殊字符」。
 *
 * @param {string} password
 * @returns {{score: 0|1|2|3|4, tone: string, labelKey: string}}
 */
export function passwordStrength(password) {
    const value = password ?? ''
    if (!value) return {score: 0, tone: 'accent', labelKey: ''}

    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
    let score = 1
    if (value.length >= PASSWORD_MIN && classes >= 2) score = 2
    if (value.length >= 10 && classes >= 3) score = 3
    if (value.length >= 14 && classes >= 3) score = 4

    const META = {
        1: {tone: 'danger', labelKey: 'auth.pwdWeak'},
        2: {tone: 'warning', labelKey: 'auth.pwdFair'},
        3: {tone: 'info', labelKey: 'auth.pwdGood'},
        4: {tone: 'success', labelKey: 'auth.pwdStrong'},
    }
    return {score, ...META[score]}
}
