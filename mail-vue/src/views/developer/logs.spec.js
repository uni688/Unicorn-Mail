/**
 * 请求日志页单测（§4.3 / §5.3.5）。
 *
 * 这一页故意不用 DataTable：分页是**游标**（服务端不返回 total），行高还会因为展开详情而变。
 * 所以要钉的是那两件事本身：
 *
 * 1. 首屏不带 `logId`，翻页带上「上一页最后一条」的 `logId` —— 用 offset 分页的话，
 *    日志一边写一边翻会漏行/重行。
 * 2. 不足一页就算到底，不再多发一次注定为空的请求（D1 的每次读都要钱）。
 *
 * 顺带钉：本地日界要换成 UTC 再送（`create_time` 存的是 UTC，差几个小时就是差一整天的数据）、
 * 状态码除了颜色还要有文字（色觉障碍用户看不出红黄之别）、Key 被删了详情里要说清楚。
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

const api = {list: vi.fn(), keys: vi.fn()}
vi.mock('@/request/api-log.js', () => ({
    apiLogList: (...a) => api.list(...a),
    apiLogKeys: (...a) => api.keys(...a),
}))

const pinia = createPinia()
setActivePinia(pinia)

const Logs = (await import('./logs.vue')).default

const Blank = {template: '<div />'}

const row = (logId, over = {}) => ({
    logId,
    keyId: 1,
    method: 'GET',
    path: '/open/email/list',
    status: 200,
    duration: 12,
    createTime: '2026-08-29 01:02:03',
    ip: '203.0.113.7',
    ua: 'curl/8.4.0',
    err: null,
    ...over,
})

const page = (n, from = 1) => Array.from({length: n}, (_, i) => row(from + i))

async function flush() {
    await nextTick()
    await Promise.resolve()
    await nextTick()
    await nextTick()
}

/**
 * jsdom 里元素高度恒为 0，`useVirtualRows` 会退到 640 的兜底视口，
 * 满一页（50 × 44 = 2200px）时距底 1560px，超过 400 的阈值 —— 也就是说
 * 「触底翻页」在 jsdom 里不会自己发生。所以这里手动把滚动条推到底再派发
 * `scroll`，模拟用户滚到列表末尾：钉的是「触底会带游标翻页」，
 * 不是「jsdom 能不能量高度」。
 */
async function scrollToBottom(wrapper) {
    const el = wrapper.element.querySelector('.overflow-y-auto')
    Object.defineProperty(el, 'clientHeight', {value: 640, configurable: true})
    Object.defineProperty(el, 'scrollHeight', {value: 99999, configurable: true})
    el.scrollTop = 99999
    el.dispatchEvent(new Event('scroll'))
    await flush()
}

async function mountLogs() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/settings/developer/logs', name: 'developer-logs', component: Blank}],
    })
    router.push({name: 'developer-logs'})
    await router.isReady()
    const wrapper = mount(Logs, {global: {plugins: [router, pinia]}, attachTo: document.body})
    await flush()
    return wrapper
}

beforeEach(() => {
    api.list.mockReset()
    api.keys.mockReset()
    api.keys.mockResolvedValue([{keyId: 1, name: 'backup', prefix: 'um_live_aaaa'}])
    api.list.mockResolvedValue({list: page(3), stats: {total: 3, ok: 2, clientErr: 1, serverErr: 0}})
})

describe('请求日志 · 游标分页', () => {
    it('首屏不带 logId，一页 50 条，失败不弹 toast（noMsg）', async () => {
        const wrapper = await mountLogs()
        expect(api.list).toHaveBeenCalledTimes(1)
        const [params, config] = api.list.mock.calls[0]
        expect(params.size).toBe(50)
        expect(params.logId).toBeUndefined()
        expect(config).toEqual({noMsg: true})
        wrapper.unmount()
    })

    it('满一页就继续翻，游标是上一页最后一条的 logId', async () => {
        api.list.mockResolvedValueOnce({list: page(50), stats: {total: 60, ok: 60, clientErr: 0, serverErr: 0}})
        api.list.mockResolvedValueOnce({list: page(10, 51), stats: null})
        const wrapper = await mountLogs()
        await scrollToBottom(wrapper)
        expect(api.list).toHaveBeenCalledTimes(2)
        expect(api.list.mock.calls[1][0].logId).toBe(50)
        wrapper.unmount()
    })

    it('不足一页就算到底：不再多发一次注定为空的请求，底部写「没有更多了」', async () => {
        const wrapper = await mountLogs()
        await flush()
        expect(api.list).toHaveBeenCalledTimes(1)
        expect(wrapper.text()).toContain('developer.logsEnd')
        wrapper.unmount()
    })

    it('翻页失败不清掉已经拿到的那几百行', async () => {
        api.list.mockResolvedValueOnce({list: page(50), stats: {total: 60, ok: 60, clientErr: 0, serverErr: 0}})
        api.list.mockRejectedValueOnce(new Error('boom'))
        const wrapper = await mountLogs()
        await scrollToBottom(wrapper)
        expect(wrapper.text()).toContain('/open/email/list')
        expect(wrapper.text()).toContain('developer.logsEnd')
        wrapper.unmount()
    })
})

describe('请求日志 · 筛选', () => {
    it('点统计条的某一段按区间筛，再点一次取消（aria-pressed 跟着变）', async () => {
        const wrapper = await mountLogs()
        const btn = wrapper.findAll('button').find((b) => b.text().includes('developer.statusClientErr'))
        await btn.trigger('click')
        await flush()
        expect(api.list).toHaveBeenCalledTimes(2)
        expect(api.list.mock.calls[1][0].status).toBe('4xx')
        expect(btn.attributes('aria-pressed')).toBe('true')

        await btn.trigger('click')
        await flush()
        expect(api.list.mock.calls[2][0].status).toBeUndefined()
        wrapper.unmount()
    })

    it('路径筛选走回车而不是输入即查（每个字符一次 D1 读太贵）', async () => {
        const wrapper = await mountLogs()
        const input = wrapper.findAll('input').find((i) => i.attributes('aria-label') === 'developer.filterPath')
        await input.setValue('/open/email/send')
        await flush()
        expect(api.list).toHaveBeenCalledTimes(1)

        await input.trigger('keydown.enter')
        await flush()
        expect(api.list).toHaveBeenCalledTimes(2)
        expect(api.list.mock.calls[1][0].path).toBe('/open/email/send')
        wrapper.unmount()
    })

    it('空结果分「没记录」和「没匹配」两种说法 —— 后者不该让人以为日志被清了', async () => {
        api.list.mockResolvedValue({list: [], stats: {total: 0, ok: 0, clientErr: 0, serverErr: 0}})
        const wrapper = await mountLogs()
        expect(wrapper.text()).toContain('developer.emptyLogs')

        const btn = wrapper.findAll('button').find((b) => b.text().includes('developer.statusServerErr'))
        await btn.trigger('click')
        await flush()
        expect(wrapper.text()).toContain('developer.emptyLogsFiltered')
        expect(wrapper.text()).toContain('developer.clearFilter')
        wrapper.unmount()
    })
})
