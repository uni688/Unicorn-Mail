import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import Tabs from './Tabs.vue'
import TabPanel from './TabPanel.vue'

/**
 * Tabs 是 reka 的包装，值得测的是 items 自动渲染、count 徽标、keepMounted 默认
 * false（与 reka 相反）、以及 variant/orientation 的样式钩子。
 * TabPanel 只是 TabsContent 的薄封装（加了 min-w-0），一起测。
 */

const ITEMS = [
    {value: 'inbox', label: '收件箱', count: 12},
    {value: 'sent', label: '已发送'},
    {value: 'draft', label: '草稿箱', disabled: true},
]

const render = (props = {}, options = {}) => mount(Tabs, {
    props: {items: ITEMS, ...props},
    ...options,
})

const list = (wrapper) => wrapper.get('[role="tablist"]')
const tabs = (wrapper) => wrapper.findAll('[role="tab"]')

/**
 * reka 的 TabsTrigger 是在 **mousedown** 上切换的（不是 click，也不是 pointerdown）——
 * 为的是让「按下即响应」，同时 click 还能被 preventDefault 的场景救回来。
 * 面板内容的换手要多等一拍：Presence 内部先 watch 到 state 变化，再在 nextTick 里挂新内容。
 */
async function clickTab(wrapper, index) {
    await tabs(wrapper)[index].trigger('mousedown')
    await nextTick()
    await nextTick()
}

describe('Tabs · 标签条', () => {
    it('items 自动渲染成一排 TabsTrigger', () => {
        const wrapper = render()
        expect(tabs(wrapper)).toHaveLength(3)
        expect(tabs(wrapper)[0].text()).toContain('收件箱')
        expect(tabs(wrapper)[1].text()).toContain('已发送')
        expect(tabs(wrapper)[2].text()).toContain('草稿箱')
    })

    it('count 渲染成次要文本，不用 Badge', () => {
        const wrapper = render()
        const first = tabs(wrapper)[0]
        expect(first.text()).toContain('12')
        // 计数是 <span class="text-caption">，不是 Badge
        expect(first.find('.text-caption').text()).toBe('12')
        expect(first.find('[data-tone]').exists()).toBe(false)
    })

    it('disabled 项不可选，标记 disabled', () => {
        const tab = tabs(render())[2]
        expect(tab.attributes('disabled')).toBe('')
        expect(tab.attributes('data-disabled')).toBe('')
    })

    it('#list 插槽可以完全自定义标签条', () => {
        const wrapper = render({}, {
            slots: {
                list: '<button role="tab" data-custom>自定义</button>',
                default: '<div role="tabpanel">面板</div>',
            },
        })
        expect(wrapper.find('[data-custom]').exists()).toBe(true)
        expect(wrapper.text()).toContain('自定义')
        expect(wrapper.text()).not.toContain('收件箱')
    })

    it('#item 插槽可以自定义单个标签的内容', () => {
        const wrapper = render({}, {
            slots: {
                item: '<strong>{{ label }}</strong>',
            },
        })
        expect(tabs(wrapper)[0].find('strong').text()).toBe('收件箱')
    })

    it('ariaLabel 透传给 TabsList', () => {
        const wrapper = render({ariaLabel: '邮件类型'})
        expect(list(wrapper).attributes('aria-label')).toBe('邮件类型')
    })

    it('variant 决定样式：line 带底部边框，segmented 是圆角内凹底', () => {
        const line = list(render({variant: 'line'}))
        expect(line.classes()).toContain('border-b')
        const seg = list(render({variant: 'segmented'}))
        expect(seg.classes()).toContain('bg-inset')
        expect(seg.classes()).toContain('rounded-md')
        expect(seg.classes()).not.toContain('border-b')
    })

    it('orientation 切横竖排，horizontal 时 items-center', () => {
        const h = render({orientation: 'horizontal'})
        expect(list(h).classes()).toContain('items-center')
        const v = render({orientation: 'vertical'})
        expect(list(v).classes()).toContain('flex-col')
        expect(list(v).classes()).toContain('items-stretch')
    })

    it('listClass 追加到 TabsList 上', () => {
        const wrapper = render({listClass: 'border-t'})
        expect(list(wrapper).classes()).toContain('border-t')
        expect(list(wrapper).classes()).toContain('flex')
    })
})

describe('Tabs · 选中状态', () => {
    it('defaultValue 决定初始选中项', () => {
        const wrapper = render({defaultValue: 'sent'})
        const tab = tabs(wrapper)[1]
        expect(tab.attributes('aria-selected')).toBe('true')
        expect(tab.attributes('data-state')).toBe('active')
    })

    it('点标签就切过去', async () => {
        const wrapper = render({defaultValue: 'inbox'})
        await clickTab(wrapper, 1)
        expect(tabs(wrapper)[1].attributes('aria-selected')).toBe('true')
        expect(tabs(wrapper)[0].attributes('aria-selected')).toBe('false')
    })

    it('受控：自己不动，只把新值发出去', async () => {
        const wrapper = render({modelValue: 'inbox'})
        await clickTab(wrapper, 1)
        expect(wrapper.emitted('update:modelValue')).toEqual([['sent']])
        // 宿主没回写，选中态就得停在原处
        expect(tabs(wrapper)[0].attributes('aria-selected')).toBe('true')

        await wrapper.setProps({modelValue: 'sent'})
        expect(tabs(wrapper)[1].attributes('aria-selected')).toBe('true')
        expect(tabs(wrapper)[0].attributes('aria-selected')).toBe('false')
    })

    it('disabled 的标签点不动', async () => {
        const wrapper = render({defaultValue: 'inbox'})
        await clickTab(wrapper, 2)
        expect(tabs(wrapper)[0].attributes('aria-selected')).toBe('true')
        expect(tabs(wrapper)[2].attributes('aria-selected')).toBe('false')
    })
})

describe('Tabs · 面板', () => {
    it('只渲染当前选中项对应的面板，切换后跟着换', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox'},
            slots: {
                default: `
                    <TabPanel value="inbox">收件箱内容</TabPanel>
                    <TabPanel value="sent">已发送内容</TabPanel>
                `,
            },
            global: {components: {TabPanel}},
        })
        await nextTick()
        expect(wrapper.text()).toContain('收件箱内容')
        expect(wrapper.text()).not.toContain('已发送内容')

        await clickTab(wrapper, 1)
        expect(wrapper.text()).toContain('已发送内容')
        expect(wrapper.text()).not.toContain('收件箱内容')
    })

    it('激活面板带 tabindex="0" 以接收键盘焦点', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox'},
            slots: {default: '<TabPanel value="inbox">内容</TabPanel>'},
            global: {components: {TabPanel}},
        })
        await nextTick()
        const activePanel = wrapper.get('[role="tabpanel"][data-state="active"]')
        expect(activePanel.attributes('tabindex')).toBe('0')
    })

    it('默认不保留未激活面板（省渲染）', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox'},
            slots: {
                default: `
                    <TabPanel value="inbox">收件箱面板</TabPanel>
                    <TabPanel value="sent">已发送面板</TabPanel>
                `,
            },
            global: {components: {TabPanel}},
        })
        await nextTick()
        // "已发送" 会出现在标签按钮文字里，所以用更具体的字符串
        expect(wrapper.html()).toContain('收件箱面板')
        expect(wrapper.html()).not.toContain('已发送面板')
    })

    it('keepMounted 时所有面板都在 DOM 里（表单状态保留）', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox', keepMounted: true},
            slots: {
                default: `
                    <TabPanel value="inbox">收件箱</TabPanel>
                    <TabPanel value="sent">已发送</TabPanel>
                `,
            },
            global: {components: {TabPanel}},
        })
        await nextTick()
        expect(wrapper.html()).toContain('收件箱')
        expect(wrapper.html()).toContain('已发送')
    })

    it('TabPanel 带 min-w-0（flex 子项里的 truncate 需要它）', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox'},
            slots: {default: '<TabPanel value="inbox">x</TabPanel>'},
            global: {components: {TabPanel}},
        })
        await nextTick()
        const panel = wrapper.get('[role="tabpanel"]')
        expect(panel.classes()).toContain('min-w-0')
    })

    it('TabPanel class 追加', async () => {
        const wrapper = mount(Tabs, {
            props: {items: ITEMS, defaultValue: 'inbox'},
            slots: {default: '<TabPanel value="inbox" class="p-4">x</TabPanel>'},
            global: {components: {TabPanel}},
        })
        await nextTick()
        const panel = wrapper.get('[role="tabpanel"]')
        expect(panel.classes()).toContain('p-4')
        expect(panel.classes()).toContain('min-w-0')
    })
})

describe('Tabs · 根容器', () => {
    it('class 落到 TabsRoot 上', () => {
        const wrapper = render({class: 'border'})
        expect(wrapper.classes()).toContain('border')
        expect(wrapper.classes()).toContain('flex')
    })

    it('orientation=vertical 时 Root 是 flex + gap-4', () => {
        const wrapper = render({orientation: 'vertical'})
        expect(wrapper.classes()).toContain('flex')
        expect(wrapper.classes()).toContain('gap-4')
    })
})
