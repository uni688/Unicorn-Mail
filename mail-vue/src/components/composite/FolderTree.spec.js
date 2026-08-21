/**
 * FolderTree 单测。
 *
 * 要钉住的是「行只在路由存在时出现」和「角标接的是 /email/counts 而不是本地推算」：
 * 前者防的是点进去 404，后者防的是侧栏说 3 封未读、点进去 0 封。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createRouter, createMemoryHistory} from 'vue-router'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${params.n}` : key), locale: ref('zh')}),
}))

const emailCounts = vi.fn(() => Promise.resolve({inbox: 9, unread: 3, star: 1, code: 0, trash: 4, sent: 7}))
vi.mock('@/request/email.js', () => ({emailCounts: (...a) => emailCounts(...a)}))

const FolderTree = (await import('./FolderTree.vue')).default
const {useCounts} = await import('@/composables/useCounts.js')
const {useAccountStore} = await import('@/store/account.js')

const Blank = {template: '<div />'}

/** 只注册用到的路由名；回收站要单独打开，用来验证「没路由就不出这一行」 */
function makeRouter(names = ['email', 'star', 'send', 'draft']) {
    return createRouter({
        history: createMemoryHistory(),
        routes: names.map((name) => ({path: `/${name}`, name, component: Blank})),
    })
}

let wrapper

async function mountTree(names) {
    const router = makeRouter(names)
    router.push('/email')
    await router.isReady()
    wrapper = mount(FolderTree, {global: {plugins: [router]}})
    await nextTick()
    await Promise.resolve()
    await nextTick()
    return wrapper
}

beforeEach(() => {
    setActivePinia(createPinia())
    emailCounts.mockClear()
    useCounts().resetCounts()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

describe('FolderTree · 行的出现条件', () => {

    it('只渲染已注册路由的分类', async () => {
        await mountTree(['email', 'star'])
        const links = wrapper.findAll('a')
        expect(links).toHaveLength(2)
        expect(wrapper.text()).toContain('inbox')
        expect(wrapper.text()).toContain('starred')
        expect(wrapper.text()).not.toContain('sent')
    })

    it('回收站要等它自己的路由存在才出现（点进去 404 比没有更糟）', async () => {
        await mountTree(['email'])
        expect(wrapper.text()).not.toContain('mail.trash')

        wrapper.unmount()
        await mountTree(['email', 'trash'])
        expect(wrapper.text()).toContain('mail.trash')
    })

    it('草稿带「本机」标记且没有服务端计数', async () => {
        await mountTree(['email', 'draft'])
        expect(wrapper.text()).toContain('shell.localOnly')
    })
})

describe('FolderTree · 角标', () => {

    it('挂载就取一次计数，收件箱显示的是未读数', async () => {
        await mountTree(['email', 'star', 'send', 'trash'])
        expect(emailCounts).toHaveBeenCalledTimes(1)
        const rows = wrapper.findAll('li')
        expect(rows[0].text()).toContain('3')      // unread
        expect(rows[0].text()).not.toContain('9')  // 不是 inbox 总数
        expect(rows[1].text()).toContain('1')      // star
        expect(rows[2].text()).toContain('7')      // sent
        expect(rows[3].text()).toContain('4')      // trash
    })

    it('计数为 0 的分类不画数字', async () => {
        emailCounts.mockImplementation(() => Promise.resolve({unread: 0, star: 0, sent: 0, trash: 0}))
        await mountTree(['email', 'star'])
        expect(wrapper.findAll('li')[0].text()).toBe('inbox')
    })

    it('切邮箱重新取数', async () => {
        await mountTree(['email'])
        expect(emailCounts).toHaveBeenCalledTimes(1)
        useAccountStore().currentAccountId = 5
        await nextTick()
        await Promise.resolve()
        expect(emailCounts).toHaveBeenCalledTimes(2)
        expect(emailCounts.mock.calls.at(-1)[0]).toEqual({accountId: 5})
    })

    it('取数失败时不画角标，也不炸列表', async () => {
        emailCounts.mockImplementation(() => Promise.reject(new Error('boom')))
        await mountTree(['email', 'star'])
        expect(wrapper.findAll('li')).toHaveLength(2)
        expect(wrapper.findAll('li')[0].text()).toBe('inbox')
    })
})
