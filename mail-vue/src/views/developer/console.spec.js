/**
 * 调试台单测（§4.3）。
 *
 * 这一页最要紧的不是「能不能发」，而是**什么时候不发**：
 *
 * 1. 选接口、填参数、粘 Key 都不能碰网络。用户在这一页填的是真凭据、真收件人，
 *    任何一次「顺手预览一下」的请求都可能真的把信发出去。
 * 2. 写操作要再过一次 AlertDialog，确认之前一个请求都不许出去。
 * 3. 明文 Key 只进 Authorization 头，不进 localStorage —— 一次 XSS 就能把它捞走。
 * 4. 不能走 axios 实例（会带上会话 token，401 还会把用户踢下线），所以钉住裸 fetch 的调用形状。
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

const toastError = vi.fn()
vi.mock('@/components/ui/Toast/toast.js', () => ({toast: {error: (...a) => toastError(...a), success: vi.fn()}}))

/*
 * pinia 要在 import 之前就位：`utils/day.js` 在模块顶层调 `useSettingStore()`
 * （composite 桶 → MailRow → day.js），没有 activePinia 时整个 suite 直接挂。
 */
const pinia = createPinia()
setActivePinia(pinia)

const Console = (await import('./console.vue')).default
const {openApiEndpoints} = await import('@/enums/open-api-enum.js')

const Blank = {template: '<div />'}

function makeRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/settings/developer/console', name: 'developer-console', component: Blank}],
    })
}

let fetchMock

async function mountConsole() {
    const router = makeRouter()
    router.push({name: 'developer-console'})
    await router.isReady()
    const wrapper = mount(Console, {global: {plugins: [router, pinia]}, attachTo: document.body})
    await nextTick()
    return wrapper
}

/** 左侧列表里点某个接口 */
async function pick(wrapper, id) {
    const label = `openApi.${id}`
    const btn = wrapper.findAll('nav button').find((b) => b.text().includes(label))
    await btn.trigger('click')
    await nextTick()
}

beforeEach(() => {
    toastError.mockClear()
    fetchMock = vi.fn(() => Promise.resolve(new Response('{"code":200}', {
        status: 200, headers: {'content-type': 'application/json'},
    })))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
})

describe('调试台 · 不点发送就不发请求（§4.3）', () => {
    it('挂载、切接口、填参数全程零请求', async () => {
        const wrapper = await mountConsole()
        await pick(wrapper, 'emailList')
        const input = wrapper.findAll('input').at(1)
        await input.setValue('20')
        await wrapper.get('input[type="password"]').setValue('um_live_secret')
        expect(fetchMock).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('读接口点发送才发，且带上粘进来的 Key', async () => {
        const wrapper = await mountConsole()
        await pick(wrapper, 'ping')
        await wrapper.get('input[type="password"]').setValue('um_live_secret')
        await wrapper.findAll('button').find((b) => b.text().includes('developer.send')).trigger('click')
        await nextTick()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain('/open/ping')
        expect(init.headers.Authorization).toBe('Bearer um_live_secret')
        expect(init.method).toBe('GET')
        wrapper.unmount()
    })

    it('明文 Key 不落 localStorage', async () => {
        const wrapper = await mountConsole()
        await wrapper.get('input[type="password"]').setValue('um_live_secret')
        expect(JSON.stringify(localStorage)).not.toContain('um_live_secret')
        wrapper.unmount()
    })
})

describe('调试台 · 写操作二次确认（§4.3）', () => {
    it('点发送只开确认框，确认之前不发请求', async () => {
        const wrapper = await mountConsole()
        await pick(wrapper, 'emailSend')
        await wrapper.findAll('button').find((b) => b.text().includes('developer.send')).trigger('click')
        await nextTick()
        expect(fetchMock).not.toHaveBeenCalled()
        expect(document.body.textContent).toContain('developer.writeConfirm')
        wrapper.unmount()
    })

    it('enum 里写操作只有发信这一条 —— 别的接口不该弹确认框', () => {
        expect(openApiEndpoints.filter((e) => e.write).map((e) => e.id)).toEqual(['emailSend'])
    })
})
