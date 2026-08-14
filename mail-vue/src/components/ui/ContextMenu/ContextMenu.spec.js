import {afterEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import ContextMenu from './ContextMenu.vue'

/**
 * 右键菜单的位置由光标决定，所以它**没有** side / align / sideOffset —— reka 的
 * `ContextMenuContent` 把这几个 prop 从类型里 Omit 掉了，这里用 props 契约钉住。
 *
 * 打开路径有两条，都测：
 *   - `contextmenu` 事件（鼠标右键 / ContextMenu 键）；
 *   - touch/pen 的长按，走 `pressOpenDelay`（reka 默认 700ms）。
 *
 * `handleContextMenu` 内部先 `await nextTick()` 才开，所以落地比别的浮层多一拍，
 * `settle()` 统一等三拍。
 *
 * §4.10 的硬规则「右键菜单里的每一项都要在别处有等价入口」是设计约束，测不出来，
 * 评审时按组件头注核对。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(ContextMenu, {
        props,
        slots: {trigger: '<div>邮件行</div>', default: '<p>菜单内容</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

/** as-child 之后触发区域就是插槽里那个 div */
const region = (wrapper) => wrapper.get('div')
const panel = () => document.querySelector('[role="menu"]')

/** 比别的浮层多一拍：reka 的 handleContextMenu 自己先 await 了一次 nextTick */
async function settle() {
    await nextTick()
    await nextTick()
    await nextTick()
}

async function rightClick(wrapper) {
    region(wrapper).element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: 120, clientY: 80,
    }))
    await settle()
}

/** 派一个真的 PointerEvent —— VTU 的 trigger() 设不了只读的 pointerType */
function point(el, type, pointerType = 'mouse') {
    el.dispatchEvent(new PointerEvent(type, {pointerType, bubbles: true, clientX: 10, clientY: 10}))
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('ContextMenu · 触发区域', () => {
    it('as-child：插槽根元素自己当触发区，不额外包一层 span', () => {
        const wrapper = render()
        // reka 的 ContextMenuTrigger 默认 as="span"，包一层会打乱 flex/grid 列表布局
        expect(wrapper.find('span').exists()).toBe(false)
        expect(region(wrapper).text()).toBe('邮件行')
        expect(region(wrapper).attributes('data-state')).toBe('closed')
    })

    it('闭合时面板不在 DOM 里', () => {
        render()
        expect(panel()).toBeNull()
    })

    it('class 落在触发区域上（它是真实存在的元素）', () => {
        const wrapper = render({class: 'w-full'})
        expect(region(wrapper).classes()).toContain('w-full')
    })

    it('右键打开，并把开合发出去', async () => {
        const wrapper = render()
        await rightClick(wrapper)
        expect(panel()).not.toBeNull()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
        expect(region(wrapper).attributes('data-state')).toBe('open')
    })

    it('Esc 收起', async () => {
        const wrapper = render()
        await rightClick(wrapper)
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
        await settle()
        expect(panel()).toBeNull()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('disabled 关掉整块区域 —— 比逐项 disabled 便宜', async () => {
        const wrapper = render({disabled: true})
        await rightClick(wrapper)
        expect(panel()).toBeNull()
        expect(region(wrapper).attributes('data-disabled')).toBe('')
    })
})

describe('ContextMenu · 长按（触屏）', () => {
    it('touch 长按到 700ms 才开', async () => {
        vi.useFakeTimers()
        const wrapper = render()
        point(region(wrapper).element, 'pointerdown', 'touch')
        await nextTick() // handlePointerDown 里那次 await，定时器要等它才挂上

        vi.advanceTimersByTime(699)
        await settle()
        expect(panel()).toBeNull()

        vi.advanceTimersByTime(1)
        await settle()
        expect(panel()).not.toBeNull()
    })

    it('松手就取消这次长按', async () => {
        vi.useFakeTimers()
        const wrapper = render()
        point(region(wrapper).element, 'pointerdown', 'touch')
        await nextTick()
        vi.advanceTimersByTime(300)
        point(region(wrapper).element, 'pointerup', 'touch')
        await nextTick()

        vi.advanceTimersByTime(1000)
        await settle()
        expect(panel()).toBeNull()
    })

    it('鼠标按下不算长按 —— 鼠标只有右键这条路', async () => {
        vi.useFakeTimers()
        const wrapper = render()
        point(region(wrapper).element, 'pointerdown', 'mouse')
        await nextTick()
        vi.advanceTimersByTime(2000)
        await settle()
        expect(panel()).toBeNull()
    })
})

describe('ContextMenu · 面板', () => {
    it('没有 side / align / sideOffset —— 位置由光标决定', () => {
        expect(ContextMenu.props).not.toHaveProperty('side')
        expect(ContextMenu.props).not.toHaveProperty('align')
        expect(ContextMenu.props).not.toHaveProperty('sideOffset')
    })

    it('和 DropdownMenu 同一套菜单外观，内边距 p-1', async () => {
        const wrapper = render()
        await rightClick(wrapper)
        const classes = [...panel().classList]
        expect(classes).toContain('bg-raised')
        expect(classes).toContain('border-line')
        expect(classes).toContain('rounded-lg')
        expect(classes).toContain('shadow-lg')
        expect(classes).toContain('z-50')
        expect(classes).toContain('p-1')
    })

    it('限高用的是 context-menu 自己的变量，不是 dropdown 的', async () => {
        const wrapper = render()
        await rightClick(wrapper)
        const classes = [...panel().classList]
        expect(classes).toContain('max-h-(--reka-context-menu-content-available-height)')
        expect(classes).toContain('overflow-y-auto')
        expect(classes).toContain('min-w-40')
    })

    it('width 和 contentClass 都追加到面板上', async () => {
        const wrapper = render({width: 'w-56', contentClass: 'p-0'})
        await rightClick(wrapper)
        const classes = [...panel().classList]
        expect(classes).toContain('w-56')
        expect(classes).toContain('p-0')
    })

    it('默认插槽就是菜单正文', async () => {
        const wrapper = render()
        await rightClick(wrapper)
        expect(panel().textContent).toContain('菜单内容')
    })
})
