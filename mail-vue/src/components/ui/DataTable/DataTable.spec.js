import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {ref} from 'vue'
import DataTable from './DataTable.vue'
import {useSelection} from '@/composables/useSelection.js'

/**
 * DataTable 的四条承诺（§6.2 / §7.4 / §7.8 / §7.9），逐条钉住：
 * ① 语义是真 `<table>` + `<th scope=col>`——`el-table` 那套 div 拼装没有这个；
 * ② 四态互斥且各有出口：loading 出骨架行而不是遮罩，empty / error 不留白；
 * ③ 选择走 `useSelection`，「全选」只作用于当前页，文案必须把范围说出来（§7.4）；
 * ④ 排序只在 `sortable` 的列上出现控件，服务端不支持的列不给假箭头。
 *
 * 窄屏卡片列表在 jsdom 里靠 `layout` 显式指定：matchMedia 在测试里恒为 false
 * （见 test/setup.js），CSS 断点类名不会真的生效，所以断言渲染结构而不是可见性。
 */

const COLUMNS = [
    {key: 'id', label: 'ID', sortable: true},
    {key: 'email', label: '邮箱'},
    {key: 'nested.name', label: '昵称'},
    {key: 'count', label: '条数', align: 'end', formatter: (v) => `${v} 封`},
]

const ROWS = [
    {id: 1, email: 'a@x.dev', nested: {name: '甲'}, count: 3},
    {id: 2, email: 'b@x.dev', nested: {name: '乙'}, count: 0},
    {id: 3, email: 'c@x.dev', nested: {name: null}, count: 7},
]

const render = (props = {}, options = {}) => mount(DataTable, {
    props: {columns: COLUMNS, rows: ROWS, rowKey: 'id', ariaLabel: '示例表', ...props},
    ...options,
})

/** 只看语义表格那一份（layout=auto 时卡片列表也在 DOM 里） */
const table = (wrapper) => wrapper.get('table')
const bodyRows = (wrapper) => table(wrapper).findAll('tbody tr')
const headers = (wrapper) => table(wrapper).findAll('thead th')

describe('DataTable · 表格语义与 a11y（§7.9）', () => {
    it('是真 <table>，有可访问名称', () => {
        expect(table(render()).attributes('aria-label')).toBe('示例表')
    })

    it('列头是 <th scope="col">，文字来自 columns.label', () => {
        const th = headers(render())
        expect(th.map((h) => h.attributes('scope'))).toEqual(['col', 'col', 'col', 'col'])
        expect(th.map((h) => h.text())).toEqual(['ID', '邮箱', '昵称', '条数'])
    })

    it('选择列的表头也是 th，且复选框有可访问名（不然读屏只念「复选框」）', () => {
        const selection = useSelection(ref(ROWS), {idKey: 'id'})
        const wrapper = render({selectable: true, selection})
        expect(headers(wrapper)).toHaveLength(5)
        expect(wrapper.get('thead input, thead button').attributes('aria-label')).toBe('全选本页')
    })

    it('行可键盘到达：整表只有一个 tabindex=0 的行（roving tabindex）', () => {
        const tabindexes = bodyRows(render()).map((r) => r.attributes('tabindex'))
        expect(tabindexes).toEqual(['0', '-1', '-1'])
    })

    it('loading 时容器挂 aria-busy', () => {
        expect(render({state: 'loading'}).get('[aria-busy="true"]')).toBeTruthy()
        expect(render().find('[aria-busy="true"]').exists()).toBe(false)
    })
})

describe('DataTable · 取值与列配置', () => {
    it('key 支持点路径，formatter 生效', () => {
        const cells = bodyRows(render())[0].findAll('td').map((td) => td.text())
        expect(cells).toEqual(['1', 'a@x.dev', '甲', '3 封'])
    })

    it('空值统一显示为「—」而不是留白（0 不算空）', () => {
        expect(bodyRows(render())[1].findAll('td')[3].text()).toBe('0 封')
        expect(bodyRows(render())[2].findAll('td')[2].text()).toBe('—')
    })

    it('hidden 的列不渲染', () => {
        const cols = [...COLUMNS.slice(0, 2), {key: 'count', label: '条数', hidden: true}]
        expect(headers(render({columns: cols}))).toHaveLength(2)
    })

    it('#cell-<key> 插槽覆盖默认渲染', () => {
        const wrapper = render({}, {slots: {'cell-email': '<b class="slotted">{{ params.value }}</b>'}})
        expect(wrapper.get('tbody .slotted').text()).toBe('a@x.dev')
    })
})

describe('DataTable · 四态（§7.8）', () => {
    it('loading 出骨架行，表头留在原地', () => {
        const wrapper = render({state: 'loading', rows: [], skeletonRows: 5})
        expect(headers(wrapper)).toHaveLength(4)
        expect(bodyRows(wrapper)).toHaveLength(5)
        expect(wrapper.find('tbody td:not([colspan])').exists()).toBe(true)
    })

    it('rows 为空且没在加载 → empty，兜底也有文案', () => {
        const wrapper = render({rows: []})
        expect(bodyRows(wrapper)).toHaveLength(1)
        expect(wrapper.get('tbody td').attributes('colspan')).toBe('4')
        expect(wrapper.text()).toContain('暂无数据')
    })

    it('error 优先于 empty，带 role=alert 与重试出口', () => {
        const wrapper = render({rows: [], error: 'boom 500'})
        expect(wrapper.get('tbody [role="alert"]').text()).toContain('加载失败')
        expect(wrapper.text()).toContain('boom 500')
        wrapper.findAll('tbody button').at(-1).trigger('click')
        expect(wrapper.emitted('retry')).toHaveLength(1)
    })

    it('loading 优先于 error（重试中不该继续喊失败）', () => {
        expect(render({rows: [], loading: true, error: 'x'}).find('[role="alert"]').exists()).toBe(false)
    })

    it('#empty / #error 插槽拿得到 action / retry', () => {
        const wrapper = render({rows: []}, {slots: {empty: '<button class="mine" @click="params.action()">建一个</button>'}})
        wrapper.get('.mine').trigger('click')
        expect(wrapper.emitted('empty-action')).toHaveLength(1)
    })
})

describe('DataTable · 选择模型（§7.4）', () => {
    const setup = (props = {}) => {
        const selection = useSelection(ref(ROWS), {idKey: 'id'})
        return {selection, wrapper: render({selectable: true, selection, ...props})}
    }

    const rowBoxes = (wrapper) => table(wrapper).findAll('tbody [role="checkbox"], tbody button[aria-label="选择此行"]')

    it('勾选行 → 选中集合里出现该行的 rowKey', async () => {
        const {selection, wrapper} = setup()
        await rowBoxes(wrapper)[1].trigger('click')
        expect(selection.ids.value).toEqual([2])
    })

    it('Shift 点击连选（锚点到当前行）', async () => {
        const {selection, wrapper} = setup()
        await rowBoxes(wrapper)[0].trigger('click')
        await rowBoxes(wrapper)[2].trigger('click', {shiftKey: true})
        expect([...selection.ids.value].sort()).toEqual([1, 2, 3])
    })

    it('表头三态：none → all → none', async () => {
        const {selection, wrapper} = setup()
        const head = () => wrapper.get('thead [role="checkbox"], thead button[aria-label="全选本页"]')
        expect(head().attributes('data-state')).toBe('unchecked')
        await rowBoxes(wrapper)[0].trigger('click')
        expect(head().attributes('data-state')).toBe('indeterminate')
        await head().trigger('click')
        expect(selection.count.value).toBe(0)
        selection.selectAllLoaded()
        await wrapper.vm.$nextTick()
        expect(head().attributes('data-state')).toBe('checked')
    })

    it('动作条上的「已选 N 项」必须写清范围是本页（§7.4 不许骗人）', async () => {
        const {wrapper} = setup({total: 999, pageSize: 3})
        expect(wrapper.find('[role="region"]').exists()).toBe(false)
        await rowBoxes(wrapper)[0].trigger('click')
        const bar = wrapper.get('[role="region"]')
        expect(bar.text()).toContain('已选 1 项（本页共 3 项）')
    })

    it('#actions 插槽渲染在动作条里，拿得到数量与 id', async () => {
        const selection = useSelection(ref(ROWS), {idKey: 'id'})
        const wrapper = render(
            {selectable: true, selection},
            {slots: {actions: '<span class="act">{{ params.count }}/{{ params.ids.join(",") }}</span>'}},
        )
        selection.select(3)
        await wrapper.vm.$nextTick()
        expect(wrapper.get('.act').text()).toBe('1/3')
    })

    it('键盘：Space 切换选中，↑↓ 不触发选择', async () => {
        const {selection, wrapper} = setup()
        const rows = bodyRows(wrapper)
        await rows[0].trigger('keydown', {key: ' '})
        expect(selection.ids.value).toEqual([1])
        await rows[0].trigger('keydown', {key: 'ArrowDown'})
        expect(selection.ids.value).toEqual([1])
    })
})

/**
 * `rowSelectable`：`el-table` 的 `:selectable` 等价物。用户管理页靠它把超级管理员排除在
 * 批量删除之外 —— 后端 `/user/delete` 不拦 type=0，前端这一道就是全部的保护。
 * 这里用 id=2 当「不能勾」的那一行，从点击、Shift 连选、Space、表头全选四条路去试。
 */
describe('DataTable · 不可勾选的行（rowSelectable）', () => {
    const notTwo = (row) => row.id !== 2
    const setup = (source = ROWS) => {
        const selection = useSelection(ref(source), {idKey: 'id'})
        return {selection, wrapper: render({selectable: true, selection, rowSelectable: notTwo})}
    }
    const rowBoxes = (wrapper) => table(wrapper).findAll('tbody [role="checkbox"], tbody button[aria-label="选择此行"]')
    const head = (wrapper) => wrapper.get('thead [role="checkbox"], thead button[aria-label="全选本页"]')

    it('那一行的复选框是禁用的，点了也不进选中集合', async () => {
        const {selection, wrapper} = setup()
        expect(rowBoxes(wrapper).map((b) => b.attributes('disabled') !== undefined)).toEqual([false, true, false])
        await rowBoxes(wrapper)[1].trigger('click')
        expect(selection.ids.value).toEqual([])
    })

    it('Space 也选不中它', async () => {
        const {selection, wrapper} = setup()
        await bodyRows(wrapper)[1].trigger('keydown', {key: ' '})
        expect(selection.ids.value).toEqual([])
    })

    it('Shift 连选跨过它时，它不会被夹带进来', async () => {
        const {selection, wrapper} = setup()
        await rowBoxes(wrapper)[0].trigger('click')
        await rowBoxes(wrapper)[2].trigger('click', {shiftKey: true})
        expect([...selection.ids.value].sort()).toEqual([1, 3])
    })

    it('表头全选只选可勾的行；数据源同样过滤时表头是「全选」而不是「半选」', async () => {
        const {selection, wrapper} = setup(ROWS.filter(notTwo))
        await head(wrapper).trigger('click')
        expect([...selection.ids.value].sort()).toEqual([1, 3])
        expect(head(wrapper).attributes('data-state')).toBe('checked')
    })

    it('数据源没过滤时，表头全选同样不会带上它（DataTable 自己兜底）', async () => {
        const {selection, wrapper} = setup(ROWS)
        await head(wrapper).trigger('click')
        expect([...selection.ids.value].sort()).toEqual([1, 3])
    })
})

describe('DataTable · 排序（服务端优先）', () => {
    it('只有 sortable 的列有排序按钮，其余列没有假箭头', () => {
        const th = headers(render())
        expect(th[0].find('button').exists()).toBe(true)
        expect(th[1].find('button').exists()).toBe(false)
    })

    it('aria-sort 只出现在可排序列上，并跟着 sort 变', () => {
        expect(headers(render())[0].attributes('aria-sort')).toBe('none')
        expect(headers(render())[1].attributes('aria-sort')).toBeUndefined()
        const asc = render({sort: {key: 'id', order: 'asc'}})
        expect(headers(asc)[0].attributes('aria-sort')).toBe('ascending')
    })

    it('点表头：无序 → desc → asc（管理端默认先看最新）', async () => {
        const wrapper = render()
        await headers(wrapper)[0].get('button').trigger('click')
        expect(wrapper.emitted('update:sort')[0][0]).toEqual({key: 'id', order: 'desc'})

        const desc = render({sort: {key: 'id', order: 'desc'}})
        await headers(desc)[0].get('button').trigger('click')
        expect(desc.emitted('update:sort')[0][0]).toEqual({key: 'id', order: 'asc'})
    })

    it('sortKey 可以和列 key 不同（服务端参数名对不上时用它）', async () => {
        const cols = [{key: 'email', label: '邮箱', sortable: true, sortKey: 'timeSort'}]
        const wrapper = render({columns: cols})
        await headers(wrapper)[0].get('button').trigger('click')
        expect(wrapper.emitted('update:sort')[0][0].key).toBe('timeSort')
    })
})

describe('DataTable · 分页与窄屏降级', () => {
    it('只有一页时不画分页器（多余的控件是噪音）', () => {
        expect(render({total: 3, pageSize: 10}).find('nav').exists()).toBe(false)
        expect(render({total: 30, pageSize: 10}).find('nav').exists()).toBe(true)
    })

    it('翻页转发 update:page', async () => {
        const wrapper = render({total: 30, pageSize: 10, page: 1})
        await wrapper.get('nav button[aria-label="下一页"]').trigger('click')
        expect(wrapper.emitted('update:page')[0][0]).toBe(2)
    })

    it('页脚默认报总数', () => {
        expect(render({total: 30, pageSize: 10}).text()).toContain('共 30 条')
    })

    it('layout=cards 不渲染 <table>，改成「列名: 值」的 dl', () => {
        const wrapper = render({layout: 'cards'})
        expect(wrapper.find('table').exists()).toBe(false)
        const first = wrapper.get('dl')
        expect(first.findAll('dt').map((d) => d.text())).toEqual(['ID', '邮箱', '昵称', '条数'])
        expect(first.findAll('dd')[1].text()).toBe('a@x.dev')
    })

    it('layout=auto 两份都在 DOM 里，靠断点类名切换（jsdom 下没有 matchMedia）', () => {
        const wrapper = render()
        expect(wrapper.get('table').classes()).toContain('md:table')
        expect(wrapper.findAll('dl').length).toBe(ROWS.length)
    })

    it('layout=table 不渲染卡片列表', () => {
        expect(render({layout: 'table'}).find('dl').exists()).toBe(false)
    })

    it('cardHidden 的列不进卡片（窄屏放不下的次要信息）', () => {
        const cols = [...COLUMNS.slice(0, 2), {key: 'count', label: '条数', cardHidden: true}]
        const wrapper = render({columns: cols, layout: 'cards'})
        expect(wrapper.get('dl').findAll('dt').map((d) => d.text())).toEqual(['ID', '邮箱'])
    })
})

describe('DataTable · 行点击', () => {
    it('rowClickable 才转发 row-click，Enter 同样可激活', async () => {
        const plain = render()
        await bodyRows(plain)[0].trigger('click')
        expect(plain.emitted('row-click')).toBeUndefined()

        const wrapper = render({rowClickable: true})
        await bodyRows(wrapper)[0].trigger('click')
        await bodyRows(wrapper)[1].trigger('keydown', {key: 'Enter'})
        expect(wrapper.emitted('row-click').map(([row]) => row.id)).toEqual([1, 2])
    })

    it('点选择列不算点行（否则勾选顺手打开了详情）', async () => {
        const selection = useSelection(ref(ROWS), {idKey: 'id'})
        const wrapper = render({rowClickable: true, selectable: true, selection})
        await wrapper.get('tbody td').trigger('click')
        expect(wrapper.emitted('row-click')).toBeUndefined()
    })
})
