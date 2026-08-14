import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Popover from './Popover.vue'

/**
 * Popover 和 Tooltip 的分工是这个文件的主线：Popover 是个 `role="dialog"`，
 * 所以「有没有可访问名称」不是锦上添花而是硬要求 —— 读屏进到 dialog 里，
 * 没名字就只念「对话框」。这个名字**只能**来自触发器：reka 把 `aria-labelledby`
 * 硬写成触发器 id，外面传什么都会被盖掉（见「可访问名称」那组用例）。
 *
 * 面板走 `PopoverPortal` 传到 body，查询用原生 DOM；卸载与清 body 必须在同一个
 * afterEach 里且先卸载后清（vitest 的 afterEach 是反序执行的）。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Popover, {
        props,
        slots: {trigger: '<button type="button">筛选</button>', default: '<p>面板内容</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
const panel = () => document.querySelector('[role="dialog"]')
const closeButton = () => panel()?.querySelector('button')

/** 开合到面板落地要两拍：Presence 先 watch 到 present，再挂 PopperContent */
async function settle() {
    await nextTick()
    await nextTick()
}

async function open(wrapper) {
    await trigger(wrapper).trigger('click')
    await settle()
}

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Popover · 触发器', () => {
    it('#trigger 插槽自己当触发器，标成 haspopup=dialog', () => {
        const wrapper = render()
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(trigger(wrapper).attributes('aria-haspopup')).toBe('dialog')
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('闭合时面板不在 DOM 里', () => {
        render()
        expect(panel()).toBeNull()
    })

    it('class 落在触发器上（as-child 合并，不额外包一层）', () => {
        const wrapper = render({class: 'w-full'})
        expect(trigger(wrapper).classes()).toContain('w-full')
    })

    it('点击打开，aria-expanded 跟着翻', async () => {
        const wrapper = render()
        await open(wrapper)
        expect(panel()).not.toBeNull()
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
        expect(trigger(wrapper).attributes('data-state')).toBe('open')
    })

    it('再点一次关掉', async () => {
        const wrapper = render()
        await open(wrapper)
        await trigger(wrapper).trigger('click')
        await settle()
        expect(panel()).toBeNull()
    })
})

describe('Popover · 开合契约', () => {
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

describe('Popover · 可访问名称', () => {
    it('面板名称由 reka 接到触发器上 —— 这是唯一生效的命名通道', async () => {
        const wrapper = render({defaultOpen: true}, {attachTo: document.body})
        await settle()
        const labelledby = panel().getAttribute('aria-labelledby')
        expect(labelledby).toBe(trigger(wrapper).attributes('id'))
        expect(document.getElementById(labelledby).textContent).toContain('筛选')
    })

    it('有 title 也不改名 —— 可见标题只是面板首个内容', async () => {
        const wrapper = render({defaultOpen: true, title: '筛选条件'}, {attachTo: document.body})
        await settle()
        // 从外面传 aria-labelledby / aria-label 都会被 reka 硬写的值盖掉，所以别试
        expect(panel().getAttribute('aria-labelledby')).toBe(trigger(wrapper).attributes('id'))
        expect(panel().getAttribute('aria-label')).toBeNull()
        expect(panel().querySelector('p').textContent).toBe('筛选条件')
    })
})

describe('Popover · 面板', () => {
    it('用共用的浮层外观（和菜单/下拉同一套），内容型内边距 p-3', async () => {
        render({defaultOpen: true})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('bg-raised')
        expect(classes).toContain('border-line')
        expect(classes).toContain('rounded-lg')
        expect(classes).toContain('shadow-lg')
        expect(classes).toContain('z-50')
        expect(classes).toContain('p-3')
    })

    it('限宽跟着 reka 给的可用宽度走，不会顶出视口', async () => {
        render({defaultOpen: true})
        await settle()
        expect([...panel().classList]).toContain('max-w-(--reka-popover-content-available-width)')
    })

    it('width 和 contentClass 都追加到面板上', async () => {
        render({defaultOpen: true, width: 'w-80', contentClass: 'p-0'})
        await settle()
        const classes = [...panel().classList]
        expect(classes).toContain('w-80')
        expect(classes).toContain('p-0')
    })

    it('默认插槽就是面板正文', async () => {
        render({defaultOpen: true})
        await settle()
        expect(panel().textContent).toContain('面板内容')
    })

    it('箭头默认不画 —— 大多数场景不需要指回触发器', async () => {
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

    it('没标题也没关闭按钮时不渲染头部那一行，不白占 8px', async () => {
        render({defaultOpen: true})
        await settle()
        expect(panel().querySelector('.mb-2')).toBeNull()
    })
})

describe('Popover · 关闭按钮', () => {
    it('默认不给关闭按钮 —— 点外面/Esc 就能关，多一个按钮是噪音', async () => {
        render({defaultOpen: true})
        await settle()
        expect(closeButton()).toBeNull()
    })

    it('closable 时给按钮，并带兜底的无障碍名称', async () => {
        render({defaultOpen: true, closable: true})
        await settle()
        expect(closeButton()).not.toBeNull()
        expect(closeButton().getAttribute('aria-label')).toBe('关闭')
        // 图标本身对读屏隐藏，名字只来自 aria-label
        expect(closeButton().querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    })

    it('关闭按钮的文案走 i18n 的 ui.close', async () => {
        render({defaultOpen: true, closable: true}, {
            global: {config: {globalProperties: {$t: (key) => (key === 'ui.close' ? 'Close' : key)}}},
        })
        await settle()
        expect(closeButton().getAttribute('aria-label')).toBe('Close')
    })

    it('点关闭按钮就收起', async () => {
        const wrapper = render({closable: true})
        await open(wrapper)
        closeButton().dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await settle()
        expect(panel()).toBeNull()
    })

    it('只给 closable 不给 title 时，头部只有那颗按钮', async () => {
        render({defaultOpen: true, closable: true})
        await settle()
        const header = panel().querySelector('.mb-2')
        expect(header).not.toBeNull()
        expect(header.querySelector('p')).toBeNull()
    })
})
