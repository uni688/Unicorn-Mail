import {afterEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Tooltip from './Tooltip.vue'

/**
 * Tooltip 的价值在「什么时候出、出来之后读屏怎么念」，样式只是附带。
 *
 * 面板走 `TooltipPortal` 传到 `document.body`，`wrapper.find` 看不到，只能用原生查询；
 * 也因此每个用例都要卸载 + 清 body，否则上一个用例的残留会被下一个查到。
 *
 * reka 的触发条件不是直觉里的 mouseenter/hover：
 *   - `focus` → 立刻开（键盘可达的那条路，不走 delay）
 *   - `pointermove`（不是 pointerenter）→ 走 delay 定时器
 *   - `pointerType === 'touch'` 直接忽略（触屏没有 hover 这回事）
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Tooltip, {
        props,
        slots: {default: '<button type="button">归档</button>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
/** 面板是 PopperContent 包装层里的那个 Primitive，带 data-state */
const panel = () => document.querySelector('[data-reka-popper-content-wrapper] > [data-state]')
/** reka 把可访问名称放在一个 VisuallyHidden 的 role=tooltip 节点里，不是面板本身 */
const a11yNode = () => document.querySelector('[role="tooltip"]')

/** 打开动作到面板落地要两拍：Presence 先 watch 到 present，再挂 PopperContent */
async function settle() {
    await nextTick()
    await nextTick()
}

/**
 * 卸载和清 body 必须在同一个 afterEach 里，而且顺序是「先卸载再清」。
 * vitest 默认 `sequence.hooks: 'stack'`（afterEach 反序执行），拆成两个 hook 会先清 body、
 * 再让 Vue 去 remove 已经不在文档里的 teleport 节点 → `Cannot read properties of null`。
 */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('Tooltip · 触发器', () => {
    it('as-child：插槽元素自己就是触发器，不额外套一层 button', () => {
        const wrapper = render()
        // Provider/Root/PopperRoot 都是渲染无关层，触发器就是插槽里那个 button
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(trigger(wrapper).attributes('data-grace-area-trigger')).toBe('')
    })

    it('闭合时不渲染面板，也不留 aria-describedby', () => {
        const wrapper = render({text: '归档这封邮件'})
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
        expect(trigger(wrapper).attributes('aria-describedby')).toBeUndefined()
        expect(panel()).toBeNull()
    })

    it('自带 TooltipProvider：单独挂载不抛错', () => {
        // reka 的 TooltipRoot 要求祖先有 provider，缺了会直接抛；组件自带就是为了这个
        expect(() => render()).not.toThrow()
    })
})

describe('Tooltip · 开合时机', () => {
    it('focus 立刻打开 —— 键盘用户不该等 400ms', async () => {
        const wrapper = render({text: '归档'})
        await trigger(wrapper).trigger('focus')
        await settle()
        expect(panel()).not.toBeNull()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
        // 立刻开的是 instant-open，延迟开的才是 delayed-open
        expect(panel().getAttribute('data-state')).toBe('instant-open')
    })

    it('blur 就收起', async () => {
        const wrapper = render({text: '归档'})
        await trigger(wrapper).trigger('focus')
        await settle()
        await trigger(wrapper).trigger('blur')
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('指针悬停要等 delay 才出，不是立刻', async () => {
        vi.useFakeTimers()
        const wrapper = render({text: '归档', delay: 400})
        await nextTick()
        trigger(wrapper).element.dispatchEvent(new PointerEvent('pointermove', {
            pointerType: 'mouse', bubbles: true,
        }))
        vi.advanceTimersByTime(399)
        await settle()
        expect(panel()).toBeNull()

        vi.advanceTimersByTime(1)
        await settle()
        expect(panel()).not.toBeNull()
        expect(panel().getAttribute('data-state')).toBe('delayed-open')
    })

    it('触屏的 pointermove 不算悬停 —— 手指没有 hover', async () => {
        vi.useFakeTimers()
        const wrapper = render({text: '归档', delay: 100})
        await nextTick()
        trigger(wrapper).element.dispatchEvent(new PointerEvent('pointermove', {
            pointerType: 'touch', bubbles: true,
        }))
        vi.advanceTimersByTime(1000)
        await settle()
        expect(panel()).toBeNull()
    })

    it('disabled 时连 focus 都不开', async () => {
        const wrapper = render({text: '归档', disabled: true})
        await trigger(wrapper).trigger('focus')
        await settle()
        expect(panel()).toBeNull()
        expect(wrapper.emitted('update:open')).toBeUndefined()
    })

    it('受控 open：宿主说开就开，不依赖任何交互', async () => {
        const wrapper = render({text: '归档', open: true})
        await settle()
        expect(panel()).not.toBeNull()

        await wrapper.setProps({open: false})
        await settle()
        expect(panel()).toBeNull()
    })
})

describe('Tooltip · a11y', () => {
    it('名字走 aria-describedby 指向 role=tooltip 的节点，而不是给触发器改名', async () => {
        const wrapper = render({text: '归档这封邮件', open: true})
        await settle()
        const described = trigger(wrapper).attributes('aria-describedby')
        expect(described).toBeTruthy()
        expect(a11yNode().id).toBe(described)
        expect(a11yNode().textContent).toContain('归档这封邮件')
        // tooltip 是补充说明，不能顶替 aria-label
        expect(trigger(wrapper).attributes('aria-label')).toBeUndefined()
    })

    it('面板本身不带 role=tooltip —— 那是 reka 藏起来的那个节点的活', async () => {
        render({text: '归档', open: true})
        await settle()
        expect(panel().getAttribute('role')).toBeNull()
    })
})

describe('Tooltip · 面板外观', () => {
    it('text 直接当文案', async () => {
        render({text: '归档这封邮件', open: true})
        await settle()
        expect(panel().textContent).toContain('归档这封邮件')
    })

    it('#content 插槽盖掉 text', async () => {
        render({text: '被盖掉的', open: true}, {
            slots: {default: '<button>x</button>', content: '<span>自定义说明</span>'},
        })
        await settle()
        expect(panel().textContent).toContain('自定义说明')
        expect(panel().textContent).not.toContain('被盖掉的')
    })

    it('用 neutral-strong 反色底 —— tooltip 要压在任何背景之上', async () => {
        render({text: 'x', open: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('bg-neutral-strong')
        expect(classes).toContain('text-on-strong')
        expect(classes).toContain('text-caption')
        expect(classes).toContain('z-50')
    })

    it('限宽 max-w-64，长说明要换行而不是拉成一条', async () => {
        render({text: 'x', open: true})
        await settle()
        expect([...panel().classList]).toContain('max-w-64')
    })

    it('两种 open 态都挂进场动画 —— 只写 data-[state=open] 会漏掉 tooltip', async () => {
        render({text: 'x', open: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('data-[state=delayed-open]:animate-popover-in')
        expect(classes).toContain('data-[state=instant-open]:animate-popover-in')
        expect(classes).toContain('data-[state=closed]:animate-popover-out')
    })

    it('contentClass 追加而不是替换', async () => {
        render({text: 'x', open: true, contentClass: 'max-w-40'})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('max-w-40')
        expect(classes).toContain('bg-neutral-strong')
    })

    it('默认带箭头，颜色跟面板同源', async () => {
        render({text: 'x', open: true})
        await settle()
        const arrow = panel().querySelector('svg')
        expect(arrow).not.toBeNull()
        expect(arrow.getAttribute('class')).toContain('fill-neutral-strong')
    })

    it('arrow=false 就不画箭头', async () => {
        render({text: 'x', open: true, arrow: false})
        await settle()
        expect(panel().querySelector('svg')).toBeNull()
    })
})
