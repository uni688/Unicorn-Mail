/**
 * useMailList 单测。这一层是从 `email-scroll`（1367 行）里抽出来的纯逻辑，所以测试的第一
 * 职责是「搬家没搬错」，第二职责是钉住四处刻意的改动（见 useMailList.js 头部）：
 * seq 竞态、`total` 递减、`error` 可渲染、`addItem` 不再算错相对时间。
 *
 * `fetch` 是注入的，所以这里不用 mock 请求层；`minLatency: 0` 关掉首屏骨架的最小停留，
 * 否则每个用例都要等 300ms。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createApp, ref} from 'vue'

// `utils/day.js` 在模块顶层就 `useSettingStore()`（day.js:6），import 阶段就需要 pinia。
setActivePinia(createPinia())

// `useI18n` 在组件外调用会抛（没有 app 实例），和 useQuota.spec 一样只替这一个导出。
vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

const {useMailList, ROW} = await import('@/composables/useMailList.js')
const {useEmailStore} = await import('@/store/email.js')

/** emailId 递减 = 后端默认的「新的在上」顺序 */
const mail = (emailId, extra = {}) => ({
    emailId,
    subject: `主题 ${emailId}`,
    text: `正文 ${emailId}`,
    createTime: '2026-08-20 03:00:00',
    unread: 0,
    isStar: 0,
    status: 0,
    ...extra,
})

const pageOf = (from, count, extra = {}) => ({
    list: Array.from({length: count}, (_, i) => mail(from - i)),
    total: 999,
    ...extra,
})

beforeEach(() => {
    setActivePinia(createPinia())
})

/**
 * 在一个真正的组件里创建列表。`useMailList` 用了 onMounted / onUnmounted（60s 相对时间
 * 计时器），组件外调用只会得到一堆 Vue warn，而且测不到卸载清理。
 */
const apps = []

function makeList(options) {
    let list
    const app = createApp({
        setup() {
            list = useMailList(options)
            return () => null
        },
    })
    app.mount(document.createElement('div'))
    apps.push(app)
    return list
}

afterEach(() => {
    while (apps.length) apps.pop().unmount()
    vi.restoreAllMocks()
})

describe('useMailList · 取数与游标', () => {

    it('首屏 cursor=0；翻页用已加载的最后一条 emailId', async () => {
        const calls = []
        const list = makeList({
            size: 3, minLatency: 0,
            fetch: (cursor, size) => {
                calls.push({cursor, size})
                return Promise.resolve(pageOf(100 - calls.length * 3 + 3, 3))
            },
        })

        await list.load()
        expect(calls[0]).toEqual({cursor: 0, size: 3})
        expect(list.mails).toHaveLength(3)

        await list.loadMore()
        expect(calls[1]).toEqual({cursor: 98, size: 3})
        expect(list.mails).toHaveLength(6)
    })

    it('返回不足一页 → noLoading，尾部出现「没有更多」哨兵行', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 2))})
        await list.load()
        expect(list.noLoading.value).toBe(true)
        expect(list.followLoading.value).toBe(false)
        expect(list.rows.value.at(-1).kind).toBe(ROW.END)
    })

    it('满页 → followLoading，尾部是骨架哨兵行', async () => {
        const list = makeList({size: 2, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 2))})
        await list.load()
        expect(list.rows.value.at(-1).kind).toBe(ROW.LOADING)
    })

    it('noLoading 之后 loadMore 不再发请求；refresh 能穿透并清空旧数据', async () => {
        const fetch = vi.fn(() => Promise.resolve(pageOf(10, 2)))
        const list = makeList({size: 5, minLatency: 0, fetch})
        await list.load()
        await list.loadMore()
        expect(fetch).toHaveBeenCalledTimes(1)

        await list.refresh()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(list.mails).toHaveLength(2)
    })
})

describe('useMailList · 竞态与错误（相对旧实现的改动）', () => {

    it('切换后旧请求的响应不再回填（旧实现只有 reqLock）', async () => {
        let resolveFirst
        const fetch = vi.fn()
            .mockImplementationOnce(() => new Promise(res => {
                resolveFirst = res
            }))
            .mockImplementationOnce(() => Promise.resolve(pageOf(50, 2)))

        const list = makeList({size: 5, minLatency: 0, fetch})

        const stale = list.load()
        // reqLock 只挡同一时刻的并发，refresh 是新一代请求
        await list.refresh()
        expect(list.mails.map(m => m.emailId)).toEqual([50, 49])

        resolveFirst(pageOf(999, 2))
        await stale
        expect(list.mails.map(m => m.emailId)).toEqual([50, 49])
    })

    it('请求失败落到 error，列表不动、骨架收掉', async () => {
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => Promise.reject(new Error('boom')),
        })
        await list.load()
        expect(list.error.value).toBeInstanceOf(Error)
        expect(list.mails).toEqual([])
        expect(list.loading.value).toBe(false)
        expect(list.followLoading.value).toBe(false)
    })

    it('下一次成功会清掉 error', async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('boom')))
            .mockImplementationOnce(() => Promise.resolve(pageOf(10, 2)))
        const list = makeList({size: 5, minLatency: 0, fetch})
        await list.load()
        await list.refresh()
        expect(list.error.value).toBe(null)
        expect(list.mails).toHaveLength(2)
    })

    it('total 缺失时退回已加载条数（后端偶尔不带 total）', async () => {
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => Promise.resolve({list: [mail(3), mail(2)]}),
        })
        await list.load()
        expect(list.total.value).toBe(2)
    })
})

describe('useMailList · 行展平与分组', () => {

    it('同一天的邮件共用一个分组头，跨天再插一个', async () => {
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => Promise.resolve({
                list: [
                    mail(3, {createTime: '2026-08-20 03:00:00'}),
                    mail(2, {createTime: '2026-08-20 04:00:00'}),
                    mail(1, {createTime: '2026-08-11 04:00:00'}),
                ],
                total: 3,
            }),
        })
        await list.load()

        const kinds = list.rows.value.map(r => r.kind)
        expect(kinds).toEqual([ROW.GROUP, ROW.MAIL, ROW.MAIL, ROW.GROUP, ROW.MAIL, ROW.END])
        expect(list.rows.value[0].key).not.toBe(list.rows.value[3].key)
    })

    it('grouped:false 时没有分组头', async () => {
        const list = makeList({
            size: 5, minLatency: 0, grouped: false,
            fetch: () => Promise.resolve(pageOf(9, 2)),
        })
        await list.load()
        expect(list.rows.value.filter(r => r.kind === ROW.GROUP)).toHaveLength(0)
    })

    it('decorate 把摘要 / 相对时间 / 状态图标补齐（旧实现 handleList）', async () => {
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => Promise.resolve({
                list: [mail(1, {content: '<p>正文 <b>粗</b></p>', status: 3, isDel: 1})],
                total: 1,
            }),
        })
        await list.load()
        const row = list.mails[0]
        expect(row.formatText).toBe('正文 粗')
        expect(row.formatCreateTime).toBeTruthy()
        expect(row.statusIcon.color).toBe('#F56C6C')
        expect(row.isDelContent).toBe('selectDeleted')
    })
})

describe('useMailList · addItem（长轮询来的新邮件）', () => {

    it('按 emailId 插到正确位置，total +1', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 3))})
        await list.load()
        expect(list.addItem(mail(11))).toBe(true)
        expect(list.mails.map(m => m.emailId)).toEqual([11, 10, 9, 8])
        expect(list.total.value).toBe(1000)

        list.addItem(mail(9.5))
        expect(list.mails.map(m => m.emailId)).toEqual([11, 10, 9.5, 9, 8])
    })

    it('重复的 emailId 直接返回 false，不动列表也不动 total', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 3))})
        await list.load()
        expect(list.addItem(mail(10))).toBe(false)
        expect(list.mails).toHaveLength(3)
        expect(list.total.value).toBe(999)
    })

    it('新邮件的相对时间是按 createTime 算的（旧实现这里传了不存在的字段）', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 1))})
        await list.load()
        list.addItem(mail(11, {createTime: '2020-01-01 00:00:00'}))
        const added = list.mails.find(m => m.emailId === 11)
        expect(added.formatCreateTime).toBeTruthy()
        expect(added.formatCreateTime).not.toBe(list.mails[1].formatCreateTime)
        expect(added.groupKey).toBe('2020-01-01')
    })

    it('sort=1（旧的在上）时只追加，且只在这一页已加载完时追加', async () => {
        const sort = ref(1)
        const list = makeList({
            size: 2, sort, minLatency: 0,
            fetch: () => Promise.resolve(pageOf(10, 2)),
        })
        await list.load()
        // 满页 → 还有后续 → 新邮件交给翻页带出来，不本地追加
        expect(list.addItem(mail(20))).toBe(true)
        expect(list.mails.map(m => m.emailId)).toEqual([10, 9])
        expect(list.latestEmail.value.emailId).toBe(20)
    })
})

describe('useMailList · removeIds / 星标 / 已读', () => {

    it('删除按 id 摘掉，total 递减（旧实现不减，头部计数会一直偏大）', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 3))})
        await list.load()
        expect(list.removeIds([10, 8])).toBe(2)
        expect(list.mails.map(m => m.emailId)).toEqual([9])
        expect(list.total.value).toBe(997)
    })

    it('单个 id、字符串 id、不存在的 id 都能处理', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 3))})
        await list.load()
        expect(list.removeIds(10)).toBe(1)
        expect(list.removeIds('9')).toBe(1)
        expect(list.removeIds([999])).toBe(0)
        expect(list.total.value).toBe(997)
    })

    it('删到不足一页且还有后续时自动补一页', async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => Promise.resolve({list: [mail(10), mail(9)], total: 99}))
            .mockImplementationOnce(() => Promise.resolve({list: [mail(8)], total: 98}))
        const list = makeList({size: 2, minLatency: 0, fetch})
        await list.load()
        list.removeIds([10])
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
        expect(list.mails.map(m => m.emailId)).toEqual([9, 8])
    })

    it('toggleStar 乐观切换，失败翻回来并回调正确的一侧', async () => {
        // toggleStar 失败时会 console.error（旧实现也这么做），这里只是不让它污染测试输出
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const onStarAdd = vi.fn()
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => Promise.resolve(pageOf(10, 1)),
            starAdd: () => Promise.resolve(),
            starCancel: () => Promise.reject(new Error('boom')),
            onStarAdd,
        })
        await list.load()
        const email = list.mails[0]

        expect(await list.toggleStar(email)).toBe(true)
        expect(email.isStar).toBe(1)
        expect(onStarAdd).toHaveBeenCalledWith(email)

        expect(await list.toggleStar(email)).toBe(false)
        expect(email.isStar).toBe(1)
    })

    it('localUnread / localStar 只改本地字段', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 2))})
        await list.load()
        list.localUnread([10])
        expect(list.mails[0].unread).toBe(1)
        list.localUnread(10, 0)
        expect(list.mails[0].unread).toBe(0)
        list.localStar('9', 1)
        expect(list.mails[1].isStar).toBe(1)
    })
})

describe('useMailList · 跨视图同步与卸载', () => {

    it('emailStore.deleteIds 广播后本列表同步摘掉（旧实现 :461）', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 3))})
        await list.load()
        const emailStore = useEmailStore()
        emailStore.deleteIds = [10, 9]
        await vi.waitFor(() => expect(list.mails.map(m => m.emailId)).toEqual([8]))
    })

    it('星标广播两个方向都同步', async () => {
        const list = makeList({size: 5, minLatency: 0, fetch: () => Promise.resolve(pageOf(10, 2))})
        await list.load()
        const emailStore = useEmailStore()
        emailStore.addStarEmailId = 10
        await vi.waitFor(() => expect(list.mails[0].isStar).toBe(1))
        emailStore.cancelStarEmailId = 10
        await vi.waitFor(() => expect(list.mails[0].isStar).toBe(0))
    })

    it('syncStore:false 时不订阅广播（星标列表自己管自己）', async () => {
        const list = makeList({
            size: 5, minLatency: 0, syncStore: false,
            fetch: () => Promise.resolve(pageOf(10, 3)),
        })
        await list.load()
        useEmailStore().deleteIds = [10]
        await Promise.resolve()
        expect(list.mails).toHaveLength(3)
    })

    it('卸载后清掉 60s 计时器，且在飞的请求不再回填', async () => {
        vi.useFakeTimers()
        let resolveFetch
        const list = makeList({
            size: 5, minLatency: 0,
            fetch: () => new Promise(res => {
                resolveFetch = res
            }),
        })
        const pending = list.load()
        const before = vi.getTimerCount()

        apps.pop().unmount()
        expect(vi.getTimerCount()).toBeLessThan(before)

        vi.useRealTimers()
        resolveFetch(pageOf(10, 2))
        await pending
        expect(list.mails).toEqual([])
    })
})
