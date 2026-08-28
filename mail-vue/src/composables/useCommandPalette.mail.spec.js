/**
 * 命令面板的「邮件」组（§6.2 的分组顺序 + §7.5 的搜索）。
 *
 * 这一组和其它组不一样：它不是数据列表，而是**一条通往搜索结果的路** —— 面板不预取邮件
 * （一次输入打一次 `/email/list` 太贵），只放一条「搜索邮件：<词>」，点了带着 `?q=` 进
 * 邮件视图，真正的过滤由 `MailWorkspace` + 后端 `searchConditions()` 完成。
 * 所以要锁的是「什么时候出现」和「点了跳到哪」，而不是「里面有几封」。
 *
 * 和 `useCommandPalette.spec.js` 分成两个文件：那一份刻意只测纯函数（不 mount），
 * 这一份必须在组件 setup 里跑（`useCommandPalette()` 要 router）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {defineComponent, nextTick, ref} from 'vue'

setActivePinia(createPinia())

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: ref('zh')}),
}))

const {useCommandPalette, usePaletteState, closePalette} = await import('./useCommandPalette.js')

const PAGE = {template: '<div />'}

/** 邮件视图带 `meta.mail`，设置页不带 —— 「原地加条件」判的就是这个标记 */
const ROUTES = [
    {path: '/mail/inbox/:emailId?', name: 'email', component: PAGE, meta: {mail: true}},
    {path: '/mail/trash/:emailId?', name: 'trash', component: PAGE, meta: {mail: true}},
    {path: '/settings/account', name: 'setting', component: PAGE},
]

let wrapper = null
let router = null

/** 在一个真组件的 setup 里取面板数据 */
async function mountPalette({startAt = '/mail/inbox', routes = ROUTES} = {}) {
    router = createRouter({history: createMemoryHistory(), routes})
    router.push(startAt)
    await router.isReady()

    let api = null
    const Probe = defineComponent({
        setup() {
            api = useCommandPalette()
            return () => null
        },
    })

    wrapper = mount(Probe, {global: {plugins: [router]}})
    return api
}

const type = (text) => {
    usePaletteState().query.value = text
}

/** `router.push` 要跨过一个宏任务才落地（memory history 也一样） */
const flushRouter = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await nextTick()
}

const labels = (groups) => groups.map((group) => group.label)
const mailGroup = (groups) => groups.find((group) => group.label === 'shell.groupMail')

beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    closePalette()
    type('')
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    router = null
    type('')
})

describe('命令面板 · 「邮件」组什么时候出现', () => {

    it('空输入不出现：一条没有词的「搜索邮件」点了等于没搜', async () => {
        const {groups} = await mountPalette()
        expect(mailGroup(groups.value)).toBeUndefined()

        // 只打了空格也算空输入
        type('   ')
        expect(mailGroup(groups.value)).toBeUndefined()
    })

    it('有词就出现，永远只有一条，label 带着刚打的词', async () => {
        const {groups} = await mountPalette()
        type('发票')

        const group = mailGroup(groups.value)
        expect(group.options).toHaveLength(1)
        expect(group.options[0].value).toBe('mail:search')
        expect(group.options[0].label).toBe('shell.searchMail:{"term":"发票"}')
    })

    it('排在「转到」与「设置」之间（§6.2 的固定顺序）', async () => {
        const {groups} = await mountPalette()
        type('s')

        const order = labels(groups.value)
        expect(order).toContain('shell.groupMail')
        expect(order.indexOf('shell.groupGoto')).toBeLessThan(order.indexOf('shell.groupMail'))
        expect(order.indexOf('shell.groupMail')).toBeLessThan(order.indexOf('shell.groupSettings'))
    })

    it('前缀模式（> / # / @）下不出现：那三个模式各管一件事', async () => {
        const {groups} = await mountPalette()

        for (const raw of ['>发票', '#发票', '@发票']) {
            type(raw)
            expect(mailGroup(groups.value)).toBeUndefined()
        }
    })

    it('没有邮件路由（没有 email:query）时不出现 —— 点了会 404', async () => {
        const {groups} = await mountPalette({
            startAt: '/settings/account',
            routes: [{path: '/settings/account', name: 'setting', component: PAGE}],
        })
        type('发票')
        expect(mailGroup(groups.value)).toBeUndefined()
    })
})

describe('命令面板 · 点「搜索邮件」跳到哪', () => {

    it('已经在邮件视图里就原地加条件，并把 :emailId 清掉', async () => {
        const {groups} = await mountPalette({startAt: '/mail/trash/9'})
        type('发票')

        mailGroup(groups.value).options[0].run()
        await flushRouter()

        // 换了筛选条件，窗格里那封很可能已经不在结果里了，所以 id 必须清掉
        expect(router.currentRoute.value.name).toBe('trash')
        expect(router.currentRoute.value.path).toBe('/mail/trash')
        expect(router.currentRoute.value.query.q).toBe('发票')
    })

    it('在设置页里搜邮件 → 回收件箱带上 ?q=', async () => {
        const {groups} = await mountPalette({startAt: '/settings/account'})
        type('boss')

        mailGroup(groups.value).options[0].run()
        await flushRouter()

        expect(router.currentRoute.value.name).toBe('email')
        expect(router.currentRoute.value.query.q).toBe('boss')
    })

    it('原有的其它 query 参数留着：换筛选条件不该顺手清掉别的状态', async () => {
        const {groups} = await mountPalette({startAt: '/mail/inbox/9?pane=bottom'})
        type('has:att')

        mailGroup(groups.value).options[0].run()
        await flushRouter()

        expect(router.currentRoute.value.query).toEqual({pane: 'bottom', q: 'has:att'})
    })

    it('语法糖原样进 ?q=：解析归 MailWorkspace，面板不碰语法', async () => {
        const {groups} = await mountPalette()
        type('from:boss subject:"发票 8 月"')

        mailGroup(groups.value).options[0].run()
        await flushRouter()

        expect(router.currentRoute.value.query.q).toBe('from:boss subject:"发票 8 月"')
    })

    it('面板自己的 run() 会先关面板再执行（选中即离开）', async () => {
        const {groups, run, open} = await mountPalette()
        open.value = true
        type('发票')

        const item = mailGroup(groups.value).options[0]
        run(item.value, item)
        await flushRouter()

        expect(open.value).toBe(false)
        expect(router.currentRoute.value.query.q).toBe('发票')
    })
})

