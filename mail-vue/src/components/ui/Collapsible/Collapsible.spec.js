import {describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Collapsible from './Collapsible.vue'

/**
 * 值得测的三处：`unmount` 默认关掉（与 reka 相反，见组件头注），折叠态的内容对读屏也要
 * 隐身（不能只是视觉高度 0），以及高度动画必须挂在 CollapsibleContent 自己身上
 * ——它依赖 reka 注入的 --reka-collapsible-content-height。
 */

const render = (props = {}, options = {}) => mount(Collapsible, {
    props,
    slots: {default: '<a href="/x">收件箱</a>'},
    ...options,
})

const trigger = (wrapper) => wrapper.get('button')
// CollapsibleContent 是 button 后面那个 div.overflow-hidden（reka 自己生成 id）
const content = (wrapper) => wrapper.find('button + div.overflow-hidden')

describe('Collapsible · 开合', () => {
    it('默认收起，触发器如实上报 aria-expanded', () => {
        const wrapper = render()
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('defaultOpen 让它一上来就是展开的', () => {
        const wrapper = render({defaultOpen: true})
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
    })

    it('点一下就展开，再点收起', async () => {
        const wrapper = render()
        await trigger(wrapper).trigger('click')
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
        await trigger(wrapper).trigger('click')
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
    })

    it('受控时自己不动，只发 update:open', async () => {
        const wrapper = render({open: false})
        await trigger(wrapper).trigger('click')
        expect(wrapper.emitted('update:open')).toEqual([[true]])
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
        await wrapper.setProps({open: true})
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
    })

    it('disabled 时点不动，也告诉读屏点不动', async () => {
        const wrapper = render({disabled: true})
        expect(trigger(wrapper).attributes('disabled')).toBeDefined()
        await trigger(wrapper).trigger('click')
        expect(wrapper.emitted('update:open')).toBeUndefined()
    })
})

describe('Collapsible · 内容', () => {
    it('触发器用 aria-controls 指向内容区的内层容器', () => {
        const wrapper = render({defaultOpen: true})
        const id = trigger(wrapper).attributes('aria-controls')
        expect(id).toBeTruthy()
        // id 在内层 div 上，不是 CollapsibleContent 自己
        expect(wrapper.get(`#${id}`).exists()).toBe(true)
    })

    it('默认不卸载内容 —— 侧栏分组要留住状态和计数', () => {
        const wrapper = render()
        // 收起时 CollapsibleContent 还在（data-state=closed + hidden），内容也在
        expect(content(wrapper).exists()).toBe(true)
        expect(content(wrapper).attributes('data-state')).toBe('closed')
        expect(wrapper.html()).toContain('收件箱')
    })

    it('收起时内容对读屏一并隐身，不只是高度归零', () => {
        const wrapper = render()
        // reka 的 CollapsibleContent 在关闭时打 `hidden` 属性
        expect(content(wrapper).attributes('hidden')).toBe('')
    })

    it('unmount 时收起就真的从 DOM 里拿掉', () => {
        const wrapper = render({unmount: true})
        // unmountOnHide=true 时 reka 仍然渲染 CollapsibleContent 容器（为了动画），
        // 但内层插槽内容被 v-if 卸载了
        expect(content(wrapper).exists()).toBe(true)
        expect(wrapper.html()).not.toContain('收件箱')
    })

    it('unmount + 展开后内容回来', async () => {
        const wrapper = render({unmount: true})
        await trigger(wrapper).trigger('click')
        await nextTick()
        expect(content(wrapper).exists()).toBe(true)
        expect(wrapper.html()).toContain('收件箱')
    })

    it('高度动画挂在 CollapsibleContent 上（它才拿得到 reka 注入的高度变量）', () => {
        const wrapper = render({defaultOpen: true})
        const outer = content(wrapper)
        expect(outer.classes()).toContain('overflow-hidden')
        expect(outer.classes()).toContain('data-[state=open]:animate-collapsible-down')
        expect(outer.classes()).toContain('data-[state=closed]:animate-collapsible-up')
    })

    it('内边距写在内层 div，避免动画期间被 overflow-hidden 裁成跳变', () => {
        const wrapper = render({defaultOpen: true, contentClass: 'pl-4'})
        const outer = content(wrapper)
        const inner = outer.get('div')
        expect(inner.classes()).toEqual(expect.arrayContaining(['pt-1', 'pl-4']))
        expect(outer.classes()).not.toContain('pl-4')
    })
})

describe('Collapsible · 触发行', () => {
    it('title 直接渲染成文案', () => {
        expect(render({title: '收藏夹'}).text()).toContain('收藏夹')
    })

    it('#trigger 插槽接管头部时 title 让位', () => {
        const wrapper = render({title: '收藏夹'}, {slots: {trigger: '<span>自定义头</span>'}})
        expect(wrapper.text()).toContain('自定义头')
        expect(wrapper.text()).not.toContain('收藏夹')
    })

    it('默认给一个对读屏隐身的箭头 —— 状态已经由 aria-expanded 播报', () => {
        const icon = render().get('svg')
        expect(icon.attributes('aria-hidden')).toBe('true')
        expect(icon.classes()).toContain('group-data-[state=open]:rotate-90')
    })

    it('hideIndicator 后不留箭头，留给调用方自己画', () => {
        expect(render({hideIndicator: true}).find('svg').exists()).toBe(false)
    })

    it('triggerClass 追加而不是替换', () => {
        const wrapper = render({triggerClass: 'py-2'})
        expect(trigger(wrapper).classes()).toEqual(expect.arrayContaining(['py-2', 'w-full']))
    })

    it('class 落在根上', () => {
        expect(render({class: 'mb-2'}).classes()).toContain('mb-2')
    })
})
