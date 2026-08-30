/**
 * DeveloperNav 单测（§0.8 的过渡件）。
 *
 * 钉两件事：**条目只在路由真的注入了才出现**（点了 404 比看不到入口更糟），
 * 以及**只剩一项时整条导航不渲染**（一个孤零零的「当前页」链接是纯噪音）。
 * 顺带钉 `aria-current="page"` —— 这是读屏用户判断「我在哪一页」的唯一线索。
 */
import {describe, expect, it} from 'vitest'
import {createMemoryHistory, createRouter} from 'vue-router'
import {mount} from '@vue/test-utils'
import {ref} from 'vue'
import {vi} from 'vitest'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

const DeveloperNav = (await import('./DeveloperNav.vue')).default

const Blank = {template: '<div />'}

const ALL = ['developer-keys', 'developer-logs', 'developer-console', 'developer-docs']

async function mountNav(names, at = names[0]) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: names.map((name) => ({path: `/settings/developer/${name}`, name, component: Blank})),
    })
    router.push({name: at})
    await router.isReady()
    return mount(DeveloperNav, {global: {plugins: [router]}})
}

describe('DeveloperNav · 条目的出现条件', () => {
    it('四页都注入时列四条，顺序是 Keys → 日志 → 调试台 → 文档', async () => {
        const wrapper = await mountNav(ALL)
        expect(wrapper.findAll('a').map((a) => a.text())).toEqual([
            'developer.keys', 'developer.logs', 'developer.console', 'developer.docs',
        ])
    })

    it('只有 api-key:query 时不出日志页（那条路由没注入）', async () => {
        const wrapper = await mountNav(['developer-keys', 'developer-console', 'developer-docs'])
        expect(wrapper.text()).not.toContain('developer.logs')
        expect(wrapper.findAll('a')).toHaveLength(3)
    })

    it('只剩一项就整条不渲染 —— 一个指向当前页的链接没有意义', async () => {
        const wrapper = await mountNav(['developer-logs'])
        expect(wrapper.find('nav').exists()).toBe(false)
    })
})

describe('DeveloperNav · 无障碍', () => {
    it('当前页带 aria-current="page"，其余不带', async () => {
        const wrapper = await mountNav(ALL, 'developer-console')
        const current = wrapper.findAll('a').filter((a) => a.attributes('aria-current') === 'page')
        expect(current).toHaveLength(1)
        expect(current[0].text()).toBe('developer.console')
    })

    it('nav 有可读的名字（读屏会念成「开发者 导航」）', async () => {
        const wrapper = await mountNav(ALL)
        expect(wrapper.get('nav').attributes('aria-label')).toBe('developer.title')
    })

    it('是链接而不是按钮：能中键新开、能复制地址', async () => {
        const wrapper = await mountNav(ALL)
        expect(wrapper.findAll('button')).toHaveLength(0)
        expect(wrapper.get('a').attributes('href')).toBe('/settings/developer/developer-keys')
    })
})
