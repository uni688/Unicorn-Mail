import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import DropdownMenu from './DropdownMenu.vue'

/**
 * 这个文件只管「壳」：触发器的 ARIA、面板的外观与转发进去的排版参数。
 * 菜单项那套词汇（MenuItem / CheckboxItem / RadioGroup / Sub …）在
 * `Menu/Menu.spec.js` 里连着 DropdownMenu 一起测，不在这儿重复。
 *
 * 两个容易踩空的点：
 *   - 触发器是 **click** 打开的（`event.button === 0 && !ctrlKey`），不是 pointerdown；
 *     键盘上 Enter/Space 是 toggle，ArrowDown 只负责开。
 *   - 面板走 Portal 到 body，`wrapper.find` 看不见，只能 `document.querySelector`。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(DropdownMenu, {
        props,
        slots: {trigger: '<button type="button">更多操作</button>', default: '<p>菜单内容</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
const panel = () => document.querySelector('[role="menu"]')

/** 开合到面板落地要两拍：Presence 先 watch 到 present，再挂 PopperContent */
async function settle() {
    await nextTick()
    await nextTick()
}

async function open(wrapper) {
    await trigger(wrapper).trigger('click')
    await settle()
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('DropdownMenu · 触发器', () => {
    it('as-child：插槽里的按钮自己当触发器，ARIA 由 reka 挂', () => {
        const wrapper = render()
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(trigger(wrapper).attributes('aria-haspopup')).toBe('menu')
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('闭合时面板不在 DOM 里', () => {
        render()
        expect(panel()).toBeNull()
    })

    it('点击打开，aria-expanded / data-state 跟着翻', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(panel()).not.toBeNull()
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
        expect(trigger(wrapper).attributes('data-state')).toBe('open')
    })

    it('菜单的名字来自触发器 —— 和 Popover 同一个契约，图标触发器必须自带 label', async () => {
        const wrapper = render({defaultOpen: true}, {attachTo: document.body})
        await settle()
        const labelledby = panel().getAttribute('aria-labelledby')
        expect(labelledby).toBe(trigger(wrapper).attributes('id'))
        expect(document.getElementById(labelledby).textContent).toContain('更多操作')
    })

    it('再点一次关掉', async () => {
        const wrapper = render()
        await open(wrapper)
        await trigger(wrapper).trigger('click')
        await settle()
        expect(panel()).toBeNull()
    })

    it('ArrowDown 也能开 —— 键盘用户不用先按 Enter', async () => {
        const wrapper = render()
        await trigger(wrapper).trigger('keydown', {key: 'ArrowDown'})
        await settle()
        expect(panel()).not.toBeNull()
    })
})

describe('DropdownMenu · 开合契约', () => {
    it('defaultOpen 一挂上就是开的', async () => {
        render({defaultOpen: true})
        await settle()
        expect(panel()).not.toBeNull()
    })

    it('受控 open：自己不动，只把新值发出去', async () => {
        const wrapper = render({open: false})
        await trigger(wrapper).trigger('click')
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
        // 宿主没回写就得停在关闭态
        expect(panel()).toBeNull()

        await wrapper.setProps({open: true})
        await settle()
        expect(panel()).not.toBeNull()
    })
})

describe('DropdownMenu · 面板', () => {
    it('和 Popover 共用浮层外观，但内边距是菜单型的 p-1', async () => {
        render({defaultOpen: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('bg-raised')
        expect(classes).toContain('border-line')
        expect(classes).toContain('rounded-lg')
        expect(classes).toContain('shadow-lg')
        expect(classes).toContain('z-50')
        expect(classes).toContain('p-1')
        expect(classes).not.toContain('p-3')
    })

    it('限高跟着 reka 给的可用高度走，超了自己滚', async () => {
        render({defaultOpen: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('max-h-(--reka-dropdown-menu-content-available-height)')
        expect(classes).toContain('overflow-y-auto')
    })

    it('默认最小宽度 min-w-40 —— 菜单不该窄成一条', async () => {
        render({defaultOpen: true})
        await settle()
        expect([...panel().classList]).toContain('min-w-40')
    })

    it('width 和 contentClass 都追加到面板上', async () => {
        render({defaultOpen: true, width: 'w-56', contentClass: 'p-0'})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('w-56')
        expect(classes).toContain('p-0')
    })

    it('默认插槽就是菜单正文', async () => {
        render({defaultOpen: true})
        await settle()
        expect(panel().textContent).toContain('菜单内容')
    })

    it('side / align 转发给 reka，落在面板的 data 属性上', async () => {
        render({defaultOpen: true, side: 'top', align: 'end'})
        await settle()
        expect(panel().getAttribute('data-side')).toBe('top')
        expect(panel().getAttribute('data-align')).toBe('end')
    })

    it('箭头默认不画', async () => {
        render({defaultOpen: true})
        await settle()
        expect(panel().querySelector('svg')).toBeNull()
    })

    it('arrow=true 才画箭头，颜色跟面板同源', async () => {
        render({defaultOpen: true, arrow: true})
        await settle()
        const arrow = panel().querySelector('svg')
        expect(arrow).not.toBeNull()
        expect(arrow.getAttribute('class')).toContain('fill-raised')
    })
})
