import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Pagination from './Pagination.vue'

/**
 * 页码序列（省略号位置、siblingCount 展开）是 reka 的算法，不重复测它；
 * 这里守住三件我们自己承诺的事：
 * ① reka hardcode 的英文 aria-label（"First Page"/"Page 3"）确实被中文覆盖掉了；
 * ② 省略号整体 aria-hidden，读屏不会多念一句；
 * ③ compact 下只剩三段，且页码文字是「第 n 页 / 共 m 页」。
 */

const render = (props = {}) => mount(Pagination, {props: {itemsPerPage: 10, total: 95, ...props}})
const nav = (wrapper) => wrapper.get('nav')
const btnByLabel = (wrapper, label) => wrapper.findAll('button').find((b) => b.attributes('aria-label') === label)
const pageButtons = (wrapper) => wrapper.findAll('button').filter((b) => /^第 \d+ 页$/.test(b.attributes('aria-label') ?? ''))
const lastEmit = (wrapper) => {
    const all = wrapper.emitted('update:page')
    return all?.[all.length - 1]?.[0]
}

describe('Pagination · 结构与 a11y', () => {
    it('整体是带名字的 <nav>', () => {
        expect(nav(render()).attributes('aria-label')).toBe('分页')
        expect(nav(render({ariaLabel: '日志分页'})).attributes('aria-label')).toBe('日志分页')
    })

    it('方向按钮的英文名被中文覆盖', () => {
        const wrapper = render({showEdges: true, page: 5})
        expect(btnByLabel(wrapper, '首页')).toBeTruthy()
        expect(btnByLabel(wrapper, '上一页')).toBeTruthy()
        expect(btnByLabel(wrapper, '下一页')).toBeTruthy()
        expect(btnByLabel(wrapper, '末页')).toBeTruthy()
        // reka 自带的英文一个都不该留下
        const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'))
        expect(labels.some((l) => /Page|First|Last|Prev|Next/i.test(l ?? ''))).toBe(false)
    })

    it('页码按钮叫「第 n 页」，当前页带 aria-current', () => {
        const wrapper = render({page: 3})
        const current = btnByLabel(wrapper, '第 3 页')
        expect(current).toBeTruthy()
        expect(current.attributes('aria-current')).toBe('page')
        expect(btnByLabel(wrapper, '第 2 页').attributes('aria-current')).toBeUndefined()
    })

    it('省略号整体 aria-hidden 且不可点', () => {
        // 注意：reka 只在 showEdges 分支里产生省略号；不开 showEdges 时它只是滑动一个
        // siblingCount*2+1 的窗口，永远不会有省略号。
        const wrapper = render({page: 1, showEdges: true})
        const ellipsis = wrapper.findAll('[aria-hidden="true"]').filter((n) => n.element.tagName !== 'svg')
        expect(ellipsis.length).toBeGreaterThan(0)
        expect(wrapper.findAll('button').every((b) => b.attributes('aria-hidden') === undefined)).toBe(true)
    })

    it('不开 showEdges 时只滑动窗口，不出省略号', () => {
        const wrapper = render({page: 1, siblingCount: 1})
        expect(pageButtons(wrapper)).toHaveLength(3)
        expect(wrapper.findAll('[aria-hidden="true"]').filter((n) => n.element.tagName !== 'svg')).toHaveLength(0)
    })

    it('所有图标对读屏隐藏', () => {
        const wrapper = render({showEdges: true, page: 5})
        expect(wrapper.findAll('svg').every((s) => s.attributes('aria-hidden') === 'true')).toBe(true)
    })

    it('showEdges 关闭时没有首页/末页按钮', () => {
        const wrapper = render({page: 5})
        expect(btnByLabel(wrapper, '首页')).toBeUndefined()
        expect(btnByLabel(wrapper, '末页')).toBeUndefined()
    })
})

describe('Pagination · 翻页', () => {
    it('点页码发新页号', async () => {
        const wrapper = render({page: 1})
        await btnByLabel(wrapper, '第 2 页').trigger('click')
        expect(lastEmit(wrapper)).toBe(2)
    })

    it('上一页 / 下一页各走一页', async () => {
        const wrapper = render({page: 5})
        await btnByLabel(wrapper, '下一页').trigger('click')
        expect(lastEmit(wrapper)).toBe(6)

        await btnByLabel(wrapper, '上一页').trigger('click')
        expect(lastEmit(wrapper)).toBe(4)
    })

    it('首页 / 末页跳到两端', async () => {
        const wrapper = render({page: 5, showEdges: true})
        await btnByLabel(wrapper, '末页').trigger('click')
        expect(lastEmit(wrapper)).toBe(10)

        await btnByLabel(wrapper, '首页').trigger('click')
        expect(lastEmit(wrapper)).toBe(1)
    })

    it('第一页时上一页禁用，最后一页时下一页禁用', () => {
        const first = render({page: 1})
        expect(btnByLabel(first, '上一页').attributes('disabled')).toBeDefined()
        expect(btnByLabel(first, '下一页').attributes('disabled')).toBeUndefined()

        const last = render({page: 10})
        expect(btnByLabel(last, '末页')).toBeUndefined()
        expect(btnByLabel(last, '下一页').attributes('disabled')).toBeDefined()
    })

    it('disabled 时所有按钮一起禁用', () => {
        const wrapper = render({page: 5, showEdges: true, disabled: true})
        expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    })

    it('受控：外部不接受变更时页码不自己动', async () => {
        const wrapper = render({page: 1})
        await btnByLabel(wrapper, '第 2 页').trigger('click')
        expect(btnByLabel(wrapper, '第 1 页').attributes('aria-current')).toBe('page')
    })
})

describe('Pagination · 总页数', () => {
    it('total 不足一页时只有一页，两侧按钮都禁用', () => {
        const wrapper = render({total: 5, itemsPerPage: 10})
        expect(pageButtons(wrapper)).toHaveLength(1)
        expect(btnByLabel(wrapper, '上一页').attributes('disabled')).toBeDefined()
        expect(btnByLabel(wrapper, '下一页').attributes('disabled')).toBeDefined()
    })

    it('total 为 0 也稳，仍渲染一页而不是 0 页', () => {
        expect(pageButtons(render({total: 0}))).toHaveLength(1)
    })

    it('siblingCount 决定当前页两侧展开几个', () => {
        const narrow = pageButtons(render({page: 5, siblingCount: 1})).length
        const wide = pageButtons(render({page: 5, siblingCount: 2})).length
        expect(wide).toBeGreaterThan(narrow)
    })
})

describe('Pagination · compact', () => {
    it('只剩上一页 / 页码文字 / 下一页', () => {
        const wrapper = render({page: 3, compact: true, showEdges: true})
        expect(wrapper.findAll('button')).toHaveLength(2)
        expect(pageButtons(wrapper)).toHaveLength(0)
        expect(btnByLabel(wrapper, '首页')).toBeUndefined()
    })

    it('页码文字是「第 n 页 / 共几页」', () => {
        expect(render({page: 3, compact: true}).get('span').text()).toBe('第 3 页 / 10')
    })

    it('没给 page 时退回 defaultPage', () => {
        expect(render({compact: true, defaultPage: 2}).get('span').text()).toBe('第 2 页 / 10')
    })

    it('compact 下翻页照常工作', async () => {
        const wrapper = render({page: 3, compact: true})
        await btnByLabel(wrapper, '下一页').trigger('click')
        expect(lastEmit(wrapper)).toBe(4)
    })
})

describe('Pagination · 外观', () => {
    it('两档尺寸各自生效，默认 md', () => {
        expect(pageButtons(render({page: 1}))[0].classes()).toContain('size-8')
        expect(pageButtons(render({page: 1, size: 'sm'}))[0].classes()).toContain('size-7')
    })

    it('class 透传且不吃掉内置类', () => {
        const el = nav(render({class: 'mt-4'}))
        expect(el.classes()).toContain('mt-4')
        expect(el.classes()).toContain('items-center')
    })
})
