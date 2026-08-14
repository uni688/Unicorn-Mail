import {beforeAll, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Command from './Command.vue'

/**
 * Command 是命令面板的**列表本体**（外层 Dialog 是 L2 的事），所以这里盯四件事：
 * ① 扁平/分组两种 items 都能渲染，相邻扁平项并成一组而不是每项一个 group；
 * ② 过滤能命中 label / hint / keywords，整组空了要整组消失，全空要出 role="status" 文案；
 * ③ 选中只发 `select` 事件、绝不留选中态，且 disabled 项不能漏出去
 *    （reka 的 `ListboxItem` 对 disabled 项**也会**发 select，只是不写值）；
 * ④ 补给 `ListboxFilter` 的 combobox ARIA 真的挂上了。
 */

const ITEMS = [
    {value: 'compose', label: '写邮件', keywords: ['compose', 'new'], shortcut: 'c'},
    {value: 'refresh', label: '刷新', hint: '重新拉取收件箱'},
    {
        label: '设置',
        options: [
            {value: 'theme', label: '切换主题'},
            {value: 'logout', label: '退出登录', tone: 'danger', disabled: true},
        ],
    },
]

const options = (wrapper) => wrapper.findAll('[role="option"]')
const labels = (wrapper) => options(wrapper).map((el) => el.text())
const optionFor = (wrapper, label) => options(wrapper).find((el) => el.text().includes(label))

async function type(wrapper, value) {
    await wrapper.find('input').setValue(value)
    await nextTick()
}

beforeAll(() => {
    // reka 每次输入都会把高亮项滚进视口，jsdom 没实现 scrollIntoView
    Element.prototype.scrollIntoView ??= function noop() {}
})

describe('Command · 渲染', () => {
    it('扁平项与分组混写：相邻扁平项并进同一个匿名组', () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        expect(labels(wrapper)).toHaveLength(4)
        // 2 个扁平项并成 1 组 + 「设置」1 组 = 2
        expect(wrapper.findAll('[role="group"]')).toHaveLength(2)
        expect(wrapper.text()).toContain('设置')
    })

    it('hint、shortcut、icon 都渲染出来', () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        expect(optionFor(wrapper, '刷新').text()).toContain('重新拉取收件箱')
        expect(optionFor(wrapper, '写邮件').find('kbd').exists()).toBe(true)
    })

    it('给 ListboxFilter 补上 combobox 的 ARIA（reka 只挂了 aria-activedescendant）', () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        const input = wrapper.find('input')
        const list = wrapper.find('[role="listbox"]')
        expect(input.attributes('role')).toBe('combobox')
        expect(input.attributes('aria-expanded')).toBe('true')
        expect(input.attributes('aria-autocomplete')).toBe('list')
        expect(input.attributes('aria-controls')).toBe(list.attributes('id'))
        expect(input.attributes('aria-controls')).toBeTruthy()
        // 没给 ariaLabel 时用 i18n 兜底文案，不能是空的
        expect(input.attributes('aria-label')).toBe('搜索')
        expect(input.attributes('placeholder')).toBe('搜索')
    })

    it('footer 插槽渲染在列表外面', () => {
        const wrapper = mount(Command, {props: {items: ITEMS}, slots: {footer: '<span>↵ 执行</span>'}})
        expect(wrapper.text()).toContain('↵ 执行')
        expect(wrapper.find('[role="listbox"]').text()).not.toContain('↵ 执行')
    })
})

describe('Command · 过滤', () => {
    it('label 命中', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await type(wrapper, '刷新')
        expect(labels(wrapper)).toHaveLength(1)
    })

    it('keywords 与 hint 也参与匹配', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await type(wrapper, 'compose')
        expect(labels(wrapper)[0]).toContain('写邮件')

        await type(wrapper, '收件箱')
        expect(labels(wrapper)[0]).toContain('刷新')
    })

    it('大小写不敏感（useFilter 用的是 Intl.Collator，不是 toLowerCase）', async () => {
        const wrapper = mount(Command, {props: {items: [{value: 'a', label: 'Archive'}]}})
        await type(wrapper, 'aRcH')
        expect(labels(wrapper)).toHaveLength(1)
    })

    it('整组被过滤空了就不再渲染这一组的标题', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await type(wrapper, '写')
        expect(wrapper.findAll('[role="group"]')).toHaveLength(1)
        expect(wrapper.text()).not.toContain('设置')
    })

    it('全无匹配：出现 role="status" 的空态文案，且列表里没有 option', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await type(wrapper, 'zzzz')
        expect(options(wrapper)).toHaveLength(0)
        const status = wrapper.find('[role="status"]')
        expect(status.exists()).toBe(true)
        expect(status.text()).toBe('无匹配结果')
        // 空态必须在 listbox 外面，否则违反 aria-required-children 且不会被播报
        expect(wrapper.find('[role="listbox"]').find('[role="status"]').exists()).toBe(false)
    })

    it('emptyText 可覆盖', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS, emptyText: '没有匹配的命令'}})
        await type(wrapper, 'zzzz')
        expect(wrapper.find('[role="status"]').text()).toBe('没有匹配的命令')
    })

    it('filter=false 时一个都不过滤（留给服务端搜索）', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS, filter: false}})
        await type(wrapper, 'zzzz')
        expect(options(wrapper)).toHaveLength(4)
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })
})

describe('Command · 搜索词', () => {
    it('非受控：自己存值并同时把变化发出去', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await type(wrapper, '刷')
        expect(wrapper.emitted('update:searchTerm')).toEqual([['刷']])
        expect(wrapper.find('input').element.value).toBe('刷')
    })

    it('受控：只发事件，值不动（外面不改 prop 就不该变）', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS, searchTerm: ''}})
        await type(wrapper, '刷')
        expect(wrapper.emitted('update:searchTerm')).toEqual([['刷']])
        expect(wrapper.find('input').element.value).toBe('')
        expect(options(wrapper)).toHaveLength(4)
    })
})

describe('Command · 选中', () => {
    it('点一项发 select(value, item)，且不留任何选中态', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        await optionFor(wrapper, '刷新').trigger('click')
        expect(wrapper.emitted('select')[0][0]).toBe('refresh')
        expect(wrapper.emitted('select')[0][1]).toMatchObject({value: 'refresh', label: '刷新'})
        await nextTick()
        // 动作列表没有「已选中」这回事：preventDefault 掉了 reka 的写入
        expect(options(wrapper).every((el) => el.attributes('aria-selected') === 'false')).toBe(true)
    })

    it('disabled 项点不动（reka 的 ListboxItem 对 disabled 项也会发 select，得自己拦）', async () => {
        const wrapper = mount(Command, {props: {items: ITEMS}})
        const item = optionFor(wrapper, '退出登录')
        expect(item.attributes('data-disabled')).toBe('')
        await item.trigger('click')
        expect(wrapper.emitted('select')).toBeUndefined()
    })
})

describe('Command · 插槽', () => {
    it('default 插槽接管列表时，内置的空态不再出现', async () => {
        const wrapper = mount(Command, {
            props: {items: ITEMS},
            slots: {default: '<div class="custom">自定义列表</div>'},
        })
        await type(wrapper, 'zzzz')
        expect(wrapper.find('.custom').exists()).toBe(true)
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        expect(options(wrapper)).toHaveLength(0)
    })

    it('item 插槽拿得到 item 与当前搜索词', async () => {
        const wrapper = mount(Command, {
            props: {items: [{value: 'a', label: 'Archive'}]},
            slots: {item: '<template #item="{item, searchTerm}">{{ item.label }}/{{ searchTerm }}</template>'},
        })
        await type(wrapper, 'Arc')
        expect(options(wrapper)[0].text()).toBe('Archive/Arc')
    })
})
