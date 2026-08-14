import {describe, expect, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import Button from './Button.vue'
import {buttonVariants} from './button.variants.js'

/**
 * Button 自己的逻辑只有三块：loading 吞点击、icon-only 强制 label、原生 button 与
 * `as`/`asChild` 的差别。剩下的都是 cva 的活，所以变体那部分只挑「会出事的」断言：
 * danger 用 -strong 底色（-solid 过不了 AA）、link 退掉方块高度。
 */

const render = (props = {}, options = {}) => mount(Button, {props, ...options})

describe('Button · 点击与状态', () => {
    it('正常点击抛 click，带原生事件', async () => {
        const wrapper = render({}, {slots: {default: '发送'}})
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
        expect(wrapper.emitted('click')[0][0]).toBeInstanceOf(Event)
    })

    it('disabled 吞掉点击，并同时给原生 disabled 和 aria-disabled', async () => {
        const wrapper = render({disabled: true})
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toBeUndefined()
        expect(wrapper.attributes('disabled')).toBeDefined()
        expect(wrapper.attributes('aria-disabled')).toBe('true')
    })

    it('loading 吞掉点击 —— 防重复提交', async () => {
        const wrapper = render({loading: true})
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toBeUndefined()
    })

    it('loading 不加原生 disabled，读屏才能停在按钮上', () => {
        const wrapper = render({loading: true})
        expect(wrapper.attributes('disabled')).toBeUndefined()
        expect(wrapper.attributes('aria-busy')).toBe('true')
        expect(wrapper.attributes('data-loading')).toBe('')
    })

    it('loading 时换成 spinner 但保留文案', () => {
        const wrapper = render({loading: true}, {slots: {default: '发送中', icon: '<i class="ico"/>'}})
        expect(wrapper.text()).toContain('发送中')
        expect(wrapper.find('.ico').exists()).toBe(false)
        expect(wrapper.get('svg').classes()).toContain('animate-spin')
        expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
    })

    it('常态不留空的 aria-busy / data-loading / aria-disabled', () => {
        const wrapper = render()
        expect(wrapper.attributes('aria-busy')).toBeUndefined()
        expect(wrapper.attributes('data-loading')).toBeUndefined()
        expect(wrapper.attributes('aria-disabled')).toBeUndefined()
    })

    it('loading 结束后恢复可点', async () => {
        const wrapper = render({loading: true})
        await wrapper.trigger('click')
        await wrapper.setProps({loading: false})
        await wrapper.trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
    })
})

describe('Button · 标签语义', () => {
    it('默认是 type=button，不会误触表单提交', () => {
        expect(render().attributes('type')).toBe('button')
    })

    it('需要提交时才显式给 submit', () => {
        expect(render({type: 'submit'}).attributes('type')).toBe('submit')
    })

    it('渲染成 a 时不带 type / disabled 这些 button 专有属性', () => {
        const wrapper = render({as: 'a', disabled: true}, {attrs: {href: '/inbox'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.attributes('type')).toBeUndefined()
        expect(wrapper.attributes('disabled')).toBeUndefined()
        // 语义还得留下来，交给 aria-disabled
        expect(wrapper.attributes('aria-disabled')).toBe('true')
    })

    it('asChild 时把样式交给子节点，自己不再包一层', () => {
        const wrapper = render({asChild: true}, {slots: {default: '<a href="/x">去收件箱</a>'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.classes()).toContain('inline-flex')
    })

    it('asChild + loading 时 spinner 不参与渲染 —— 否则样式会合并到 svg 上', () => {
        // reka 的 Slot 只认「第一个非注释子节点」，spinner 排在前面就会顶掉宿主节点
        const wrapper = render({asChild: true, loading: true}, {slots: {default: '<a href="/x">去收件箱</a>'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.classes()).toContain('inline-flex')
        expect(wrapper.attributes('aria-busy')).toBe('true')
        expect(wrapper.find('svg').exists()).toBe(false)
    })

    it('asChild 时不硬塞原生 button 的属性', () => {
        const wrapper = render({asChild: true, disabled: true}, {slots: {default: '<a href="/x">去收件箱</a>'}})
        expect(wrapper.attributes('type')).toBeUndefined()
        expect(wrapper.attributes('disabled')).toBeUndefined()
        expect(wrapper.attributes('aria-disabled')).toBe('true')
    })

    it('data-variant 挂在元素上，方便外部按变体做样式钩子', () => {
        expect(render({variant: 'danger'}).attributes('data-variant')).toBe('danger')
    })
})

describe('Button · icon-only', () => {
    it('label 变成 aria-label', () => {
        expect(render({size: 'icon', label: '删除'}).attributes('aria-label')).toBe('删除')
    })

    it('icon-only 少了 label 会在 DEV 下告警', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        render({size: 'icon'})
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('icon-only'), 'icon')
        warn.mockRestore()
    })

    it('有 label 就不告警', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        render({size: 'icon', label: '删除'})
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    it('icon-only 不渲染 suffix 插槽 —— 方形按钮塞不下', () => {
        const wrapper = render({size: 'icon', label: '更多'}, {slots: {suffix: '<i class="sfx"/>'}})
        expect(wrapper.find('.sfx').exists()).toBe(false)
    })

    it('非 icon-only 才渲染 suffix', () => {
        const wrapper = render({}, {slots: {default: '更多', suffix: '<i class="sfx"/>'}})
        expect(wrapper.find('.sfx').exists()).toBe(true)
    })

    it('两档 icon 尺寸是正方形', () => {
        expect(render({size: 'icon', label: 'x'}).classes()).toContain('size-8')
        expect(render({size: 'icon-sm', label: 'x'}).classes()).toContain('size-7')
    })

    it('非 icon-only 时不硬塞 aria-label（可见文字已经是名字）', () => {
        expect(render({}, {slots: {default: '发送'}}).attributes('aria-label')).toBeUndefined()
    })
})

describe('Button · 变体', () => {
    it('三档常规尺寸与其他控件同高', () => {
        expect(render({size: 'sm'}).classes()).toContain('h-7')
        expect(render().classes()).toContain('h-8')
        expect(render({size: 'lg'}).classes()).toContain('h-[38px]')
    })

    it('danger 用 -strong 底色（-solid 上的白字过不了 AA）', () => {
        const classes = buttonVariants({variant: 'danger'})
        expect(classes).toContain('bg-danger-strong')
        expect(classes).not.toContain('bg-danger-solid')
    })

    it('link 退掉方块高度，行内跟随文字', () => {
        const classes = render({variant: 'link'}).classes()
        expect(classes).toContain('h-auto')
        expect(classes).toContain('px-0')
        expect(classes).not.toContain('h-8')
    })

    it('过渡只动颜色系属性，不做位移/缩放', () => {
        const base = buttonVariants()
        expect(base).toContain('transition-[color,background-color,border-color,box-shadow,filter]')
        expect(base).not.toMatch(/transition-transform|hover:scale|hover:-translate/)
    })

    it('block 撑满父容器', () => {
        expect(render({block: true}).classes()).toContain('w-full')
        expect(render().classes()).not.toContain('w-full')
    })

    it('class 追加而不是替换变体样式', () => {
        const wrapper = render({class: 'mt-2'})
        expect(wrapper.classes()).toContain('mt-2')
        expect(wrapper.classes()).toContain('inline-flex')
    })

    it('禁用态靠 aria-disabled 关掉指针事件', () => {
        expect(buttonVariants()).toContain('aria-disabled:pointer-events-none')
    })
})
