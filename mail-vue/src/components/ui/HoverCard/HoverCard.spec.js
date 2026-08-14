import {afterEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import HoverCard from './HoverCard.vue'

/**
 * HoverCard 只有一件事值得测：**它什么时候出、什么时候收**。
 * 里面的富内容是宿主的事，外观和 Popover 共用同一套 `popoverPanelVariants`。
 *
 * reka 的时序有两个反直觉点，都在这里钉死：
 *   - `pointerenter` 和 `focus` 走的是同一条 openDelay 定时器（focus 不是立刻开，
 *     跟 Tooltip 相反）；
 *   - 触发器的 `pointerleave` **只负责取消还没触发的打开**；已经开着的时候它什么都不做，
 *     收起由面板侧的 `useGraceArea`（指针离开「触发器→面板」那块多边形）接管。
 *
 * 另外 §4.10 的约束「hover 出来的东西不能是唯一入口」是设计约束而不是代码行为，
 * 测不出来 —— 但组件头注里写了，评审时按注释核对。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(HoverCard, {
        props,
        slots: {trigger: '<button type="button">ada@example.com</button>', default: '<p>发件人卡片</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
/** HoverCard 的面板没有 role，只能从 popper 包装层往里找那个带 data-state 的节点 */
const panel = () => document.querySelector('[data-reka-popper-content-wrapper] > [data-state]')

async function settle() {
    await nextTick()
    await nextTick()
}

/** 派一个真的 PointerEvent —— VTU 的 trigger() 设不了只读的 pointerType */
function point(el, type, pointerType = 'mouse') {
    el.dispatchEvent(new PointerEvent(type, {pointerType, bubbles: true}))
}

/** 推进定时器并让渲染跟上 */
async function advance(ms) {
    vi.advanceTimersByTime(ms)
    await settle()
}

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('HoverCard · 触发器', () => {
    it('as-child：插槽元素自己当触发器，而不是 reka 默认的 <a>', () => {
        const wrapper = render()
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(wrapper.find('a').exists()).toBe(false)
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('闭合时面板不在 DOM 里', () => {
        render()
        expect(panel()).toBeNull()
    })
})

describe('HoverCard · 开合时机', () => {
    it('悬停要等 openDelay，默认 300ms', async () => {
        vi.useFakeTimers()
        const wrapper = render()
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter')

        await advance(299)
        expect(panel()).toBeNull()
        await advance(1)
        expect(panel()).not.toBeNull()
    })

    it('openDelay 可调', async () => {
        vi.useFakeTimers()
        const wrapper = render({openDelay: 0})
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter')
        await advance(0)
        expect(panel()).not.toBeNull()
    })

    it('触屏的 pointerenter 不算悬停', async () => {
        vi.useFakeTimers()
        const wrapper = render({openDelay: 0})
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter', 'touch')
        await advance(1000)
        expect(panel()).toBeNull()
    })

    it('focus 也走同一条延迟 —— 和 Tooltip 的「立刻开」不一样', async () => {
        vi.useFakeTimers()
        const wrapper = render({openDelay: 300})
        await nextTick()
        await trigger(wrapper).trigger('focus')

        await advance(299)
        expect(panel()).toBeNull()
        await advance(1)
        expect(panel()).not.toBeNull()
    })

    it('还没到点就移开 —— 取消这次打开，不要事后才弹出来', async () => {
        vi.useFakeTimers()
        const wrapper = render({openDelay: 300})
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter')
        await advance(200)
        point(trigger(wrapper).element, 'pointerleave')

        await advance(1000)
        expect(panel()).toBeNull()
    })

    it('打开之后从触发器移开不会立刻关 —— 收起交给面板的 grace area', async () => {
        vi.useFakeTimers()
        const wrapper = render({openDelay: 0, closeDelay: 150})
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter')
        await advance(0)
        expect(panel()).not.toBeNull()

        // reka 的 handleLeave 只在「还没开」时才关；开着时指针可能正往面板挪，
        // 真正的收起由 useGraceArea 在指针离开「触发器→面板」这块区域时触发
        point(trigger(wrapper).element, 'pointerleave')
        await advance(1000)
        expect(panel()).not.toBeNull()
    })

    it('open 受控：宿主说开就开，且把变更发出去', async () => {
        vi.useFakeTimers()
        const wrapper = render({open: false, openDelay: 0})
        await nextTick()
        point(trigger(wrapper).element, 'pointerenter')
        await advance(0)
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
        // 宿主没回写就得停在关闭态
        expect(panel()).toBeNull()

        await wrapper.setProps({open: true})
        await settle()
        expect(panel()).not.toBeNull()
    })
})

describe('HoverCard · 面板', () => {
    it('和 Popover 共用同一套浮层外观，内容型内边距 p-3', async () => {
        render({open: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('bg-raised')
        expect(classes).toContain('border-line')
        expect(classes).toContain('rounded-lg')
        expect(classes).toContain('shadow-lg')
        expect(classes).toContain('z-50')
        expect(classes).toContain('p-3')
    })

    it('默认宽度 w-72 —— 富内容需要一个确定的宽度才不会忽宽忽窄', async () => {
        render({open: true})
        await settle()
        expect([...panel().classList]).toContain('w-72')
    })

    it('width 换掉默认宽度，contentClass 追加', async () => {
        render({open: true, width: 'w-96', contentClass: 'p-0'})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('w-96')
        expect(classes).toContain('p-0')
        expect(classes).not.toContain('w-72')
    })

    it('默认插槽就是卡片正文', async () => {
        render({open: true})
        await settle()
        expect(panel().textContent).toContain('发件人卡片')
    })

    it('箭头默认不画', async () => {
        render({open: true})
        await settle()
        expect(panel().querySelector('svg')).toBeNull()
    })

    it('arrow=true 才画箭头，颜色跟面板同源', async () => {
        render({open: true, arrow: true})
        await settle()
        const arrow = panel().querySelector('svg')
        expect(arrow).not.toBeNull()
        expect(arrow.getAttribute('class')).toContain('fill-raised')
    })
})
