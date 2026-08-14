import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Badge from './Badge.vue'
import {badgeVariants} from './badge.variants.js'

/**
 * Badge 是纯展示件，值得测的只有两处：状态圆点的取色规则（solid 底上必须跟着字色走，
 * 否则点会看不见），以及 solid 用 -strong 而不是 -solid 这条对比度硬约束。
 */

const render = (props = {}, options = {}) => mount(Badge, {props, ...options})
const dot = (wrapper) => wrapper.find('[aria-hidden="true"]')

describe('Badge · 结构', () => {
    it('默认是 span，纯展示不带交互语义', () => {
        const wrapper = render({}, {slots: {default: '未读'}})
        expect(wrapper.element.tagName).toBe('SPAN')
        expect(wrapper.attributes('role')).toBeUndefined()
        expect(wrapper.text()).toBe('未读')
    })

    it('需要可点时可以换标签', () => {
        expect(render({as: 'button'}).element.tagName).toBe('BUTTON')
    })

    it('asChild 把样式交给子节点', () => {
        const wrapper = render({asChild: true}, {slots: {default: '<a href="/x">标签</a>'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.classes()).toContain('inline-flex')
    })

    it('asChild 时 dot 不参与渲染 —— 否则样式会合并到圆点上', () => {
        // reka 的 Slot 只认「第一个非注释子节点」，圆点排在前面就会顶掉宿主节点
        const wrapper = render({asChild: true, dot: true}, {slots: {default: '<a href="/x">标签</a>'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.classes()).toContain('inline-flex')
        expect(dot(wrapper).exists()).toBe(false)
    })

    it('tone / appearance 落成 data-* 钩子', () => {
        const wrapper = render({tone: 'danger', appearance: 'outline'})
        expect(wrapper.attributes('data-tone')).toBe('danger')
        expect(wrapper.attributes('data-appearance')).toBe('outline')
    })

    it('icon 插槽排在文字前', () => {
        const wrapper = render({}, {slots: {icon: '<i class="ico"/>', default: '已发送'}})
        const children = [...wrapper.element.children]
        expect(children[0].className).toContain('ico')
    })

    it('class 追加而不是替换变体样式', () => {
        const wrapper = render({class: 'ml-1'})
        expect(wrapper.classes()).toContain('ml-1')
        expect(wrapper.classes()).toContain('inline-flex')
    })
})

describe('Badge · 状态圆点', () => {
    it('默认不出圆点', () => {
        expect(dot(render()).exists()).toBe(false)
    })

    it('dot 时圆点对读屏隐身 —— 状态已经写在文案里', () => {
        const wrapper = render({dot: true}, {slots: {default: '投递中'}})
        expect(dot(wrapper).exists()).toBe(true)
        expect(dot(wrapper).classes()).toContain('rounded-full')
    })

    it('subtle / outline 下圆点用该色调的实色', () => {
        expect(dot(render({dot: true, tone: 'success'})).classes()).toContain('bg-success')
        expect(dot(render({dot: true, tone: 'danger', appearance: 'outline'})).classes()).toContain('bg-danger')
    })

    it('solid 底上圆点跟着字色走，否则同色叠同色会看不见', () => {
        const wrapper = render({dot: true, tone: 'success', appearance: 'solid'})
        expect(dot(wrapper).classes()).toContain('bg-current')
        expect(dot(wrapper).classes()).not.toContain('bg-success')
    })

    it('neutral 的圆点用前景色档而不是底色档', () => {
        expect(dot(render({dot: true, tone: 'neutral'})).classes()).toContain('bg-fg-subtle')
    })
})

describe('Badge · 变体', () => {
    it('solid 一律用 -strong 底色（-solid 上白字过不了 AA）', () => {
        const tones = ['neutral', 'success', 'warning', 'danger', 'info']
        tones.forEach((tone) => {
            const classes = badgeVariants({tone, appearance: 'solid'})
            expect(classes).toContain(`bg-${tone}-strong`)
        })
    })

    it('accent 的 solid 走专用的 on-accent 字色', () => {
        const classes = badgeVariants({tone: 'accent', appearance: 'solid'})
        expect(classes).toContain('bg-accent')
        expect(classes).toContain('text-on-accent')
    })

    it('outline 不铺底色', () => {
        expect(badgeVariants({appearance: 'outline'})).toContain('bg-transparent')
    })

    it('两档尺寸对应两档字号', () => {
        expect(render({size: 'sm'}).classes()).toEqual(expect.arrayContaining(['h-4.5', 'text-micro']))
        expect(render().classes()).toEqual(expect.arrayContaining(['h-5.5', 'text-caption']))
    })

    it('六个色调 × 三种实心程度都有对应样式，不留空壳', () => {
        const tones = ['neutral', 'accent', 'success', 'warning', 'danger', 'info']
        const appearances = ['solid', 'subtle', 'outline']
        tones.forEach((tone) => {
            appearances.forEach((appearance) => {
                const classes = badgeVariants({tone, appearance})
                // 每种组合至少要带一个 bg-/border-/text- 的具体取色
                expect(classes).toMatch(/(bg-|border-)[a-z]/)
            })
        })
    })
})
