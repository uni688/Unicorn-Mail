/**
 * 文档页单测（§5.3.5）。
 *
 * 文档是从 [[open-api-enum]] 生成的，所以这里真正要钉的是「生成」这件事本身：
 * 六条接口一条不落、示例命令能直接粘进终端、旧接口标了 Deprecated 并指到新的。
 *
 * 最后一组用例跨到 i18n：文档页与调试台共用 `openApi.<id>Desc` 这一套键。
 * 少一条 key，页面上就是一行原始键名 —— 单测比人眼更早发现它。
 */
import {describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${params.base}` : key), locale: ref('zh')}),
}))

const pinia = createPinia()
setActivePinia(pinia)

const Docs = (await import('./docs.vue')).default
const {legacyEndpoints, openApiEndpoints} = await import('@/enums/open-api-enum.js')
const zh = (await import('@/i18n/zh.js')).default
const en = (await import('@/i18n/en.js')).default

const Blank = {template: '<div />'}

async function mountDocs({withConsole = true} = {}) {
    const routes = [{path: '/settings/developer/docs', name: 'developer-docs', component: Blank}]
    if (withConsole) {
        routes.push({path: '/settings/developer/console', name: 'developer-console', component: Blank})
    }
    const router = createRouter({history: createMemoryHistory(), routes})
    router.push({name: 'developer-docs'})
    await router.isReady()
    const wrapper = mount(Docs, {global: {plugins: [router, pinia]}})
    await nextTick()
    return wrapper
}

describe('文档页 · 接口索引从 enum 生成', () => {
    it('六条接口一条不落，方法与路径都出来', async () => {
        const wrapper = await mountDocs()
        const text = wrapper.text()
        for (const endpoint of openApiEndpoints) {
            expect(text).toContain(endpoint.path)
        }
        expect(wrapper.findAll('table')).toHaveLength(
            openApiEndpoints.filter((e) => e.params.length).length,
        )
        wrapper.unmount()
    })

    it('参数表是真表格：四个表头 + 给读屏的 caption', async () => {
        const wrapper = await mountDocs()
        const table = wrapper.get('table')
        expect(table.findAll('th').map((th) => th.text())).toEqual([
            'openApi.paramName', 'openApi.paramIn', 'openApi.paramType', 'openApi.paramRequired',
        ])
        expect(table.get('caption').classes()).toContain('sr-only')
        wrapper.unmount()
    })

    it('写操作的示例带 -d 与 Content-Type，读操作把必填参数拼进 query', async () => {
        const wrapper = await mountDocs()
        const text = wrapper.text()
        expect(text).toContain("-d '{\"accountId\":0,\"sendEmail\":\"<sendEmail>\"")
        expect(text).toContain('/open/email/detail?emailId=<emailId>')
        wrapper.unmount()
    })

    it('鉴权示例用探活接口 —— 不需要任何 scope，是「Key 通不通」的最短验证', async () => {
        const wrapper = await mountDocs()
        expect(wrapper.text()).toContain('Authorization: Bearer um_live_xxxxxxxx')
        expect(wrapper.text()).toContain('/open/ping')
        wrapper.unmount()
    })
})

describe('文档页 · 旧接口的迁移指引', () => {
    it('每条旧接口都标 Deprecated 并写出替代接口', async () => {
        const wrapper = await mountDocs()
        const text = wrapper.text()
        for (const item of legacyEndpoints) {
            expect(text).toContain(item.path)
            expect(text).toContain(item.replacement)
        }
        expect(text.match(/openApi\.deprecated/g)).toHaveLength(legacyEndpoints.length)
        wrapper.unmount()
    })

    it('箭头对读屏是隐藏的，改成一句「替代接口」', async () => {
        const wrapper = await mountDocs()
        expect(wrapper.get('[aria-hidden="true"].text-caption').text()).toBe('→')
        expect(wrapper.html()).toContain('openApi.replacedBy')
        wrapper.unmount()
    })
})

describe('文档页 · 去调试台', () => {
    it('调试台路由存在时给一个链接（不是 button，能中键新开）', async () => {
        const wrapper = await mountDocs()
        const link = wrapper.findAll('a').find((a) => a.text().includes('openApi.tryItOut'))
        expect(link.attributes('href')).toBe('/settings/developer/console')
        wrapper.unmount()
    })

    it('没有调试台权限时不画那个链接（RouterLink 指向不存在的路由会抛错）', async () => {
        const wrapper = await mountDocs({withConsole: false})
        expect(wrapper.text()).not.toContain('openApi.tryItOut')
        wrapper.unmount()
    })
})

describe('openApi 文案 · 与 enum 同步（少一条 key 页面上就是一行原始键名）', () => {
    it.each([['zh', zh], ['en', en]])('%s 里每条接口都有名字和说明', (_lang, messages) => {
        for (const endpoint of openApiEndpoints) {
            expect(messages.openApi[endpoint.id], `${endpoint.id}`).toBeTruthy()
            expect(messages.openApi[`${endpoint.id}Desc`], `${endpoint.id}Desc`).toBeTruthy()
        }
    })

    it('两种语言的 openApi 键集合完全一致', () => {
        expect(Object.keys(zh.openApi).sort()).toEqual(Object.keys(en.openApi).sort())
    })

    it('两种语言的 developer 键集合完全一致', () => {
        expect(Object.keys(zh.developer).sort()).toEqual(Object.keys(en.developer).sort())
    })
})
