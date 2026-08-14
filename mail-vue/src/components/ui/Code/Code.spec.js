import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Code from './Code.vue'

const render = (props = {}, options = {}) => mount(Code, {props, ...options})

describe('Code', () => {
    it('inline 渲染成 <code>', () => {
        const wrapper = render({}, {slots: {default: 'pnpm build'}})
        expect(wrapper.element.tagName).toBe('CODE')
        expect(wrapper.text()).toBe('pnpm build')
    })

    it('block 渲染成 <pre><code>，语义上是一整块代码', () => {
        const wrapper = render({variant: 'block'}, {slots: {default: 'line1\nline2'}})
        expect(wrapper.element.tagName).toBe('PRE')
        expect(wrapper.get('code').exists()).toBe(true)
    })

    it('inline 不留空白：标签紧贴内容，句子里不会多出空格', () => {
        const wrapper = render({}, {slots: {default: 'x'}})
        expect(wrapper.html()).not.toMatch(/>\s+x/)
    })

    it('block 可以被键盘聚焦 —— 能横向滚动的区域必须可聚焦', () => {
        expect(render({variant: 'block'}).attributes('tabindex')).toBe('0')
    })

    it('inline 不抢 Tab 焦点', () => {
        expect(render().attributes('tabindex')).toBeUndefined()
    })

    it('block 默认不换行，横向滚动', () => {
        const classes = render({variant: 'block'}).classes()
        expect(classes).toContain('whitespace-pre')
        expect(classes).toContain('overflow-x-auto')
    })

    it('wrap 打开软换行，长行不再横向溢出', () => {
        const classes = render({variant: 'block', wrap: true}).classes()
        expect(classes).toContain('whitespace-pre-wrap')
        expect(classes).toContain('break-words')
    })

    it('两种形态都用等宽字体和 text-mono 字号', () => {
        expect(render().classes()).toEqual(expect.arrayContaining(['font-mono', 'text-mono']))
        expect(render({variant: 'block'}).classes()).toEqual(expect.arrayContaining(['font-mono', 'text-mono']))
    })

    it('class 透传到两种形态', () => {
        expect(render({class: 'my-2'}).classes()).toContain('my-2')
        expect(render({variant: 'block', class: 'my-2'}).classes()).toContain('my-2')
    })
})
