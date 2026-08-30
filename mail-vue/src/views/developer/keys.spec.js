/**
 * API Keys 页单测（§5.3.5）。
 *
 * 钉的都是「凭据」这件事逼出来的规矩：
 *
 * 1. 明文只在创建响应里出现一次 —— 那个弹窗不能被遮罩/Esc 误触关掉，
 *    关掉之后内存里也不许再留着。
 * 2. 名称/权限范围为空时**不发请求**：请求发出去再被服务端拒，用户已经以为建成了。
 * 3. 「已过期」压过「停用」：过期的 Key 即使 status=0 也调不通，状态列不能骗人。
 * 4. 「最近使用」用 `utils/day.js` 的 `fromNow()`。dayjs 没 extend `relativeTime`，
 *    写成 `.fromNow()` 是运行时 TypeError —— 这条用例就是那个回归。
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: ref('zh')}),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/components/ui/Toast/toast.js', () => ({
    toast: {error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a)},
}))

const perms = ref(['api-key:add', 'api-key:set', 'api-key:delete'])
vi.mock('@/perm/perm.js', () => ({
    hasPerm: (key) => perms.value.includes(key),
    default: {mounted() {}},
}))

const api = {
    list: vi.fn(),
    add: vi.fn(),
    del: vi.fn(),
    setStatus: vi.fn(),
    scopes: vi.fn(),
}
vi.mock('@/request/api-key.js', () => ({
    apiKeyList: (...a) => api.list(...a),
    apiKeyAdd: (...a) => api.add(...a),
    apiKeyDelete: (...a) => api.del(...a),
    apiKeySetStatus: (...a) => api.setStatus(...a),
    apiKeyScopes: (...a) => api.scopes(...a),
}))

const pinia = createPinia()
setActivePinia(pinia)

const Keys = (await import('./keys.vue')).default

const Blank = {template: '<div />'}

const ROWS = [
    {keyId: 1, name: 'backup', prefix: 'um_live_aaaa', scopes: ['email:read'], status: 0, expired: false, lastUsedTime: '2026-08-29 00:00:00'},
    {keyId: 2, name: 'old', prefix: 'um_live_bbbb', scopes: ['email:send'], status: 0, expired: true, lastUsedTime: null},
    {keyId: 3, name: 'off', prefix: 'um_live_cccc', scopes: [], status: 1, expired: false, lastUsedTime: null},
]

async function mountKeys() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/settings/developer/keys', name: 'developer-keys', component: Blank}],
    })
    router.push({name: 'developer-keys'})
    await router.isReady()
    const wrapper = mount(Keys, {global: {plugins: [router, pinia]}, attachTo: document.body})
    await nextTick()
    await Promise.resolve()
    await nextTick()
    await nextTick()
    return wrapper
}

const byText = (wrapper, text) => wrapper.findAll('button').find((b) => b.text().includes(text))

/** Dialog / DropdownMenu 的内容是 teleport 到 body 的，wrapper 里找不到 */
async function flush() {
    await nextTick()
    await Promise.resolve()
    await nextTick()
    await nextTick()
}

function bodyEl(text) {
    return [...document.querySelectorAll('button, [role="menuitem"], label')]
        .find((el) => el.textContent.includes(text))
}

async function clickInBody(text) {
    const el = bodyEl(text)
    if (!el) {
        throw new Error(`clickInBody: 找不到「${text}」`)
    }
    el.click()
    await flush()
}

async function typeInBody(selector, value) {
    const input = document.querySelector(selector)
    input.value = value
    input.dispatchEvent(new Event('input', {bubbles: true}))
    await flush()
}

async function openAdd(wrapper) {
    await byText(wrapper, 'developer.createKey').trigger('click')
    await flush()
}

async function openRowMenu(wrapper, index) {
    const triggers = wrapper.findAll('button').filter((b) => b.attributes('aria-label') === 'ui.more')
    await triggers[index].trigger('click')
    await flush()
}

beforeEach(() => {
    perms.value = ['api-key:add', 'api-key:set', 'api-key:delete']
    Object.values(api).forEach((fn) => fn.mockReset())
    api.list.mockResolvedValue(ROWS)
    api.scopes.mockResolvedValue([{key: 'email:read', paths: ['/open/email/list']}])
    api.add.mockResolvedValue({key: 'um_live_PLAINTEXT'})
    api.del.mockResolvedValue(true)
    api.setStatus.mockResolvedValue(true)
    toastError.mockClear()
    toastSuccess.mockClear()
})

describe('Keys 列表 · 状态与时间', () => {
    it('三行都画出来，前缀后面跟省略号（明文库里没有）', async () => {
        const wrapper = await mountKeys()
        expect(wrapper.text()).toContain('backup')
        expect(wrapper.text()).toContain('um_live_aaaa…')
        wrapper.unmount()
    })

    it('已过期压过停用、停用压过启用', async () => {
        const wrapper = await mountKeys()
        const text = wrapper.text()
        expect(text).toContain('expired')
        expect(text).toContain('developer.disabled')
        expect(text).toContain('developer.enabled')
        wrapper.unmount()
    })

    it('最近使用走 fromNow()：出得来相对时间，且不抛 TypeError', async () => {
        const wrapper = await mountKeys()
        expect(wrapper.text()).toContain('developer.neverUsed')
        // 相对时间的具体措辞跟时区/当天时间有关，只钉「不是原始时间戳、也没崩」
        expect(wrapper.text()).not.toContain('2026-08-29 00:00:00')
        wrapper.unmount()
    })

    it('列表失败画错误态，不弹 toast（noMsg）', async () => {
        api.list.mockRejectedValue(new Error('boom'))
        const wrapper = await mountKeys()
        expect(wrapper.text()).toContain('adminTable.loadFailed')
        expect(toastError).not.toHaveBeenCalled()
        wrapper.unmount()
    })
})

describe('Keys 创建 · 先本地拦一遍', () => {
    it('名称为空不发请求', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await clickInBody('add')
        expect(api.add).not.toHaveBeenCalled()
        expect(toastError).toHaveBeenCalledWith('developer.emptyKeyName')
        wrapper.unmount()
    })

    it('一项权限范围都没勾也不发请求', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await typeInBody('input[maxlength="30"]', 'ci')
        await clickInBody('add')
        expect(api.add).not.toHaveBeenCalled()
        expect(toastError).toHaveBeenCalledWith('developer.emptyKeyScope')
        wrapper.unmount()
    })

    it('名称 + 权限范围都齐了才发，参数按服务端口径拼（scopes 逗号串、expireDays 天数）', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await typeInBody('input[maxlength="30"]', 'ci')
        await clickInBody('email:read')
        await clickInBody('add')
        expect(api.add).toHaveBeenCalledWith({name: 'ci', scopes: 'email:read', expireDays: 30})
        wrapper.unmount()
    })
})

describe('Keys 创建 · 一次性明文（§5.3.5）', () => {
    it('创建成功后弹出明文，并给一条能直接跑的 cURL', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await typeInBody('input[maxlength="30"]', 'ci')
        await clickInBody('email:read')
        await clickInBody('add')
        await flush()
        expect(document.body.textContent).toContain('um_live_PLAINTEXT')
        expect(document.body.textContent).toContain('developer.plainWarning')
        expect(document.body.textContent).toContain('/open/email/list?size=20')
        wrapper.unmount()
    })

    it('那个弹窗不给遮罩/Esc/关闭按钮 —— 误触关掉等于这把 Key 白建了', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await typeInBody('input[maxlength="30"]', 'ci')
        await clickInBody('email:read')
        await clickInBody('add')
        await flush()
        const dialog = [...document.querySelectorAll('[role="dialog"]')]
            .find((el) => el.textContent.includes('um_live_PLAINTEXT'))
        expect(dialog).toBeTruthy()
        // 没有右上角关闭按钮（`closable=false`）：只能从「我已保存」这一条路出去
        expect(dialog.querySelector('[aria-label="close"]')).toBeNull()
        // Esc 关不掉（`dismissible=false`）。事件必须是 cancelable 的，
        // 否则 `preventDefault()` 是空操作，测的就不是 guard 了
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))
        await flush()
        expect(document.body.textContent).toContain('um_live_PLAINTEXT')
        wrapper.unmount()
    })

    it('点「我已保存」关闭后，明文不再留在内存里', async () => {
        const wrapper = await mountKeys()
        await openAdd(wrapper)
        await typeInBody('input[maxlength="30"]', 'ci')
        await clickInBody('email:read')
        await clickInBody('add')
        await flush()
        await clickInBody('developer.plainSaved')
        await flush()
        expect(document.body.textContent).not.toContain('um_live_PLAINTEXT')
        wrapper.unmount()
    })
})

describe('Keys · 权限裁剪与停用/删除', () => {
    it('没有 api-key:add 就没有创建按钮', async () => {
        perms.value = []
        const wrapper = await mountKeys()
        expect(byText(wrapper, 'developer.createKey')).toBeUndefined()
        wrapper.unmount()
    })

    it('停用调 setStatus(keyId, 1) 并重新拉列表', async () => {
        const wrapper = await mountKeys()
        api.list.mockClear()
        await openRowMenu(wrapper, 0)
        await clickInBody('developer.disable')
        await flush()
        expect(api.setStatus).toHaveBeenCalledWith(1, 1)
        expect(api.list).toHaveBeenCalled()
        wrapper.unmount()
    })

    it('删除要过确认框，确认前不调接口', async () => {
        const wrapper = await mountKeys()
        await openRowMenu(wrapper, 0)
        await clickInBody('delete')
        await flush()
        expect(api.del).not.toHaveBeenCalled()
        expect(document.body.textContent).toContain('developer.delKeyHint')
        wrapper.unmount()
    })
})
