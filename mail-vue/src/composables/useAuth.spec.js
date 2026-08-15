/**
 * useAuth 的三块纯逻辑：校验函数、密码强度、OAuth 中间态。
 *
 * 这些函数返回 **i18n 键**而不是文案（视图把它渲染成 `Field` 的行内错误），
 * 所以断言的是键名 —— 键名改了就等于四个认证视图的报错都变了，必须显式过审。
 *
 * `useAuthSession()` 不在这里测：它的每一步都是副作用（写 localStorage、拉用户、
 * 注入动态路由、跳转），mock 完四个 store 加 router 之后测到的只剩 mock 本身。
 */
import {beforeEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {
    PASSWORD_MIN,
    checkConfirmPassword,
    checkPassword,
    checkRegKey,
    clearPendingOauth,
    passwordStrength,
    readPendingOauth,
    setPendingOauth,
    useEmailSuffix,
} from './useAuth.js'
import {useSettingStore} from '@/store/setting.js'

describe('useAuth · 校验函数', () => {
    it('密码：登录只查空，注册查长度下限', () => {
        expect(checkPassword('')).toEqual({key: 'emptyPwdMsg'})
        // 登录不查长度 —— 老账号的密码可能短于现在的下限
        expect(checkPassword('abc')).toBeNull()
        expect(checkPassword('abc', {minLength: PASSWORD_MIN})).toEqual({key: 'pwdLengthMsg'})
        expect(checkPassword('abcdef', {minLength: PASSWORD_MIN})).toBeNull()
    })

    it('确认密码：只比对，不重复校验强度', () => {
        expect(checkConfirmPassword('abcdef', 'abcdeg')).toEqual({key: 'confirmPwdFailMsg'})
        expect(checkConfirmPassword('abcdef', 'abcdef')).toBeNull()
    })

    it('注册码：0 必填、2 可选、其他值不参与校验', () => {
        expect(checkRegKey('', 0)).toEqual({key: 'emptyRegKeyMsg'})
        expect(checkRegKey('KEY', 0)).toBeNull()
        expect(checkRegKey('', 2)).toBeNull()
        expect(checkRegKey('', 1)).toBeNull()
    })
})

describe('useAuth · 密码强度（不做拦截，只给直觉）', () => {
    it('空密码没有档位也没有文案键', () => {
        expect(passwordStrength('')).toEqual({score: 0, tone: 'accent', labelKey: ''})
    })

    it.each([
        ['aaaa', 1, 'danger'],
        ['abc123', 2, 'warning'],
        ['Abc123defg', 3, 'info'],
        ['Abc123defghijk', 4, 'success'],
    ])('%s → %i 档', (password, score, tone) => {
        const result = passwordStrength(password)
        expect(result.score).toBe(score)
        expect(result.tone).toBe(tone)
        expect(result.labelKey).toMatch(/^auth\.pwd/)
    })

    it('长度的权重压过字符类别（NIST SP 800-63B 的取向）', () => {
        // 14 位两类 vs 8 位四类：后者字符更杂，但前者不该被判得更弱
        expect(passwordStrength('abcdefgh12345678').score)
            .toBeGreaterThanOrEqual(passwordStrength('Ab1!').score)
    })
})

describe('useAuth · OAuth 中间态', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('存 → 取 → 清', () => {
        expect(readPendingOauth()).toBeNull()
        setPendingOauth({oauthUserId: 42, provider: 'linuxdo'})
        expect(readPendingOauth()).toEqual({oauthUserId: 42, provider: 'linuxdo'})
        clearPendingOauth()
        expect(readPendingOauth()).toBeNull()
    })

    it('脏数据一律当没有：用户直接敲 /register/bind 时要被弹回登录页', () => {
        sessionStorage.setItem('um-oauth-pending', '{不是 JSON')
        expect(readPendingOauth()).toBeNull()

        sessionStorage.setItem('um-oauth-pending', JSON.stringify({provider: 'linuxdo'}))
        expect(readPendingOauth()).toBeNull()
    })
})

describe('useEmailSuffix · 前缀 + @域名', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    /** @param {{domainList?: string[], loginDomain?: number, minEmailPrefix?: number}} config */
    function withSettings(config = {}) {
        const store = useSettingStore()
        store.domainList = config.domainList ?? ['@one.com', '@two.com']
        store.settings = {
            loginDomain: config.loginDomain ?? 0,
            minEmailPrefix: config.minEmailPrefix,
        }
        return store
    }

    it('默认选中第一个域名，选项按 Select 的 {label,value} 给', () => {
        withSettings()
        const {suffix, domainOptions, hideDomain} = useEmailSuffix()
        expect(suffix.value).toBe('@one.com')
        expect(hideDomain.value).toBe(false)
        expect(domainOptions.value).toEqual([
            {label: '@one.com', value: '@one.com'},
            {label: '@two.com', value: '@two.com'},
        ])
    })

    it('域名列表晚到（登录后配置刷新）时补上后缀，已选中的不被顶掉', async () => {
        const store = withSettings({domainList: []})
        const {suffix} = useEmailSuffix()
        expect(suffix.value).toBe('')

        store.domainList = ['@late.com', '@other.com']
        await nextTick()
        expect(suffix.value).toBe('@late.com')

        store.domainList = ['@changed.com']
        await nextTick()
        expect(suffix.value).toBe('@late.com')
    })

    it('拼装：前缀去空白后拼后缀', () => {
        withSettings()
        const {fullEmail} = useEmailSuffix()
        expect(fullEmail('  bob ')).toBe('bob@one.com')
        expect(fullEmail('')).toBe('@one.com')
    })

    it('校验顺序：空 → 前缀长度 → 合法性', () => {
        withSettings({minEmailPrefix: 3})
        const {checkEmail} = useEmailSuffix()

        expect(checkEmail('')).toEqual({key: 'emptyEmailMsg'})
        expect(checkEmail('  ')).toEqual({key: 'emptyEmailMsg'})
        // 登录不查前缀长度，注册/绑定才查
        expect(checkEmail('ab')).toBeNull()
        expect(checkEmail('ab', {checkPrefixLength: true}))
            .toEqual({key: 'minEmailPrefix', params: {msg: 3}})
        expect(checkEmail('bob')).toBeNull()
        expect(checkEmail('bo b')).toEqual({key: 'notEmailMsg'})
    })

    it('站长隐藏域名时用户输完整邮箱，长度只算 @ 之前那段', () => {
        withSettings({loginDomain: 1, minEmailPrefix: 3})
        const {hideDomain, fullEmail, checkEmail} = useEmailSuffix()

        expect(hideDomain.value).toBe(true)
        expect(fullEmail(' bob@x.com ')).toBe('bob@x.com')
        expect(checkEmail('bob@x.com', {checkPrefixLength: true})).toBeNull()
        expect(checkEmail('bo@x.com', {checkPrefixLength: true}))
            .toEqual({key: 'minEmailPrefix', params: {msg: 3}})
        expect(checkEmail('bob', {checkPrefixLength: true})).toEqual({key: 'notEmailMsg'})
    })

    it('后端没下发 minEmailPrefix 时按 1 兜底（与后端缺省一致）', () => {
        withSettings({minEmailPrefix: undefined})
        const {minPrefix, checkEmail} = useEmailSuffix()
        expect(minPrefix.value).toBe(1)
        expect(checkEmail('a', {checkPrefixLength: true})).toBeNull()
    })
})
