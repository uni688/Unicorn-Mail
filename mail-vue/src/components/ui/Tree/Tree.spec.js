import {describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Tree from './Tree.vue'

/**
 * Tree 的选中/级联/半选是本仓库自己算的（见组件头部注释），reka 只负责焦点与 aria。
 * 所以这里盯死两件事：① 级联与半选和 el-tree 语义一致（含 disabled 的处理）；
 * ② 「点行到底展不展开」这条交互取舍没被 reka 的「点击同时派发 select + toggle」带跑。
 */

const ITEMS = [
    {
        id: 'mail',
        label: '邮件',
        children: [
            {id: 'mail:view', label: '查看'},
            {id: 'mail:send', label: '发送'},
            {id: 'mail:del', label: '删除', disabled: true},
        ],
    },
    // children: [] 是后端常见写法，必须当叶子处理
    {id: 'user', label: '用户', children: [{id: 'user:add', label: '新增', children: []}]},
    {id: 'about', label: '关于'},
]

function render(props = {}) {
    return mount(Tree, {props: {items: ITEMS, itemKey: 'id', ariaLabel: '权限', ...props}})
}

const rows = (wrapper) => wrapper.findAll('[role="treeitem"]')
const rowByLabel = (wrapper, label) => rows(wrapper).find((row) => row.text().includes(label))
const lastEmit = (wrapper, event) => {
    const all = wrapper.emitted(event)
    return all?.[all.length - 1]?.[0]
}

describe('Tree · 结构与 a11y', () => {
    it('渲染 role=tree + 可访问名称，每行带 aria-level/setsize/posinset', () => {
        const wrapper = render()
        const root = wrapper.find('[role="tree"]')
        expect(root.exists()).toBe(true)
        expect(root.attributes('aria-label')).toBe('权限')

        const all = rows(wrapper)
        expect(all).toHaveLength(3)
        expect(all[0].attributes('aria-level')).toBe('1')
        expect(all[0].attributes('aria-setsize')).toBe('3')
        expect(all[0].attributes('aria-posinset')).toBe('1')
    })

    it('分支有 aria-expanded，叶子没有；children: [] 也算叶子', async () => {
        const wrapper = render({defaultExpandAll: true})
        await nextTick()

        expect(rowByLabel(wrapper, '邮件').attributes('aria-expanded')).toBe('true')
        expect(rowByLabel(wrapper, '关于').attributes('aria-expanded')).toBeUndefined()
        expect(rowByLabel(wrapper, '新增').attributes('aria-expanded')).toBeUndefined()
    })

    it('multiple 才有 aria-multiselectable', () => {
        expect(render().find('[role="tree"]').attributes('aria-multiselectable')).toBeUndefined()
        expect(render({multiple: true}).find('[role="tree"]').attributes('aria-multiselectable')).toBe('true')
    })

    it('禁用项标 aria-disabled 且点不动', async () => {
        const wrapper = render({multiple: true, cascade: true, defaultExpandAll: true})
        await nextTick()
        const row = rowByLabel(wrapper, '删除')
        expect(row.attributes('aria-disabled')).toBe('true')
        await row.trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})

describe('Tree · 选中与级联', () => {
    it('单选发标量 key，且点已选中项不会取消', async () => {
        const wrapper = render()
        await rowByLabel(wrapper, '关于').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toBe('about')
        expect(wrapper.emitted('select')[0]).toEqual(['about', ITEMS[2]])

        await rowByLabel(wrapper, '关于').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toBe('about')
    })

    it('multiple 不开 cascade 时只切自己', async () => {
        const wrapper = render({multiple: true, defaultExpandAll: true, expandOnClick: false})
        await nextTick()
        await rowByLabel(wrapper, '邮件').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['mail'])

        await rowByLabel(wrapper, '查看').trigger('click')
        // 前序顺序：mail 在 mail:view 之前
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['mail', 'mail:view'])

        await rowByLabel(wrapper, '邮件').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['mail:view'])
    })

    it('cascade 勾父项会带上子孙，但跳过 disabled，父项因此停在半选', async () => {
        const wrapper = render({multiple: true, cascade: true, checkbox: true, defaultExpandAll: true})
        await nextTick()

        await rowByLabel(wrapper, '邮件').trigger('click')
        // mail:del 是 disabled，不跟着勾；因此 mail 自己也算不上「全勾」
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['mail:view', 'mail:send'])
        expect(lastEmit(wrapper, 'update:indeterminateKeys')).toEqual(['mail'])
    })

    it('cascade 子项全勾后父项自动勾上，半选集合随之清空', async () => {
        const wrapper = render({multiple: true, cascade: true, checkbox: true, defaultExpandAll: true})
        await nextTick()

        await rowByLabel(wrapper, '新增').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['user', 'user:add'])
        expect(lastEmit(wrapper, 'update:indeterminateKeys')).toEqual([])
    })

    it('cascade 取消父项会连带取消子孙', async () => {
        const wrapper = render({
            multiple: true, cascade: true, checkbox: true, defaultExpandAll: true,
            defaultValue: ['user', 'user:add'],
        })
        await nextTick()

        await rowByLabel(wrapper, '用户').trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual([])
    })

    it('半选/选中在勾选框上画出来（minus / check）', async () => {
        const wrapper = render({
            multiple: true, cascade: true, checkbox: true, defaultExpandAll: true,
            defaultValue: ['mail:view'],
        })
        await nextTick()

        expect(rowByLabel(wrapper, '邮件').attributes('aria-selected')).toBe('false')
        expect(rowByLabel(wrapper, '查看').attributes('aria-selected')).toBe('true')
        // 半选的父项与选中的子项各画一个图标，叶子未选中的不画
        expect(rowByLabel(wrapper, '邮件').findAll('svg')).toHaveLength(2) // 箭头 + minus
        expect(rowByLabel(wrapper, '查看').findAll('svg')).toHaveLength(1) // check
        expect(rowByLabel(wrapper, '发送').findAll('svg')).toHaveLength(0)
    })
})

describe('Tree · 展开', () => {
    it('导航型树（无勾选框）点行会展开，勾选框树不会', async () => {
        const nav = render()
        await rowByLabel(nav, '邮件').trigger('click')
        expect(lastEmit(nav, 'update:expanded')).toEqual(['mail'])
        expect(rows(nav)).toHaveLength(6)

        const checkbox = render({multiple: true, checkbox: true})
        await rowByLabel(checkbox, '邮件').trigger('click')
        expect(checkbox.emitted('update:expanded')).toBeUndefined()
        expect(rows(checkbox)).toHaveLength(3)
    })

    it('小箭头永远能展开，且不会顺带改选中', async () => {
        const wrapper = render({multiple: true, checkbox: true})
        // 行内第一个 span 是箭头热区
        await rowByLabel(wrapper, '邮件').find('span').trigger('click')
        expect(lastEmit(wrapper, 'update:expanded')).toEqual(['mail'])
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('defaultExpandAll 在数据异步到位后才展开', async () => {
        const wrapper = mount(Tree, {props: {items: [], itemKey: 'id', defaultExpandAll: true}})
        expect(wrapper.emitted('update:expanded')).toBeUndefined()

        await wrapper.setProps({items: ITEMS})
        expect(lastEmit(wrapper, 'update:expanded')).toEqual(['mail', 'user'])
        expect(rows(wrapper)).toHaveLength(7)
    })

    it('expandAll / collapseAll 暴露给调用方', async () => {
        const wrapper = render()
        wrapper.vm.expandAll()
        await nextTick()
        expect(rows(wrapper)).toHaveLength(7)

        wrapper.vm.collapseAll()
        await nextTick()
        expect(rows(wrapper)).toHaveLength(3)
    })

    it('受控的 expanded 由外部说了算', async () => {
        const wrapper = render({expanded: []})
        await rowByLabel(wrapper, '邮件').trigger('click')
        expect(lastEmit(wrapper, 'update:expanded')).toEqual(['mail'])
        // 外部没接受这次变更，树就不该自己展开
        expect(rows(wrapper)).toHaveLength(3)
    })
})

describe('Tree · #item 插槽', () => {
    it('插槽里的输入框自己吃掉方向键（否则被树的 ←/→ 抢走）', async () => {
        const wrapper = mount(Tree, {
            props: {items: ITEMS, itemKey: 'id', defaultExpandAll: true},
            slots: {item: '<template #item="{label}"><span>{{ label }}</span><input></template>'},
        })
        await nextTick()

        const row = rowByLabel(wrapper, '邮件')
        const onKeydown = vi.fn()
        row.element.addEventListener('keydown', onKeydown)

        await row.find('input').trigger('keydown', {key: 'ArrowRight'})
        expect(onKeydown).not.toHaveBeenCalled()

        await row.find('span').trigger('keydown', {key: 'ArrowRight'})
        expect(onKeydown).toHaveBeenCalledTimes(1)
    })
})
