import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Dialog from './Dialog.vue'

/**
 * Dialog 的重点全在 a11y 和「关不关得掉」，长相只占一小半。
 *
 * 两条 reka 契约要记住：
 *   - `role="dialog"` 的 aria-labelledby 永远指向 `DialogTitle`，所以标题**必须存在**；
 *     没有可见标题时组件塞一个 VisuallyHidden 的，读屏才不会只念「对话框」。
 *   - `DialogContentImpl` 无条件写 `aria-describedby="reka-dialog-description-x"`，
 *     没有 description 时那是个悬空引用（axe: aria-valid-attr-value，serious），
 *     所以组件在没 description 时显式把它抹掉 —— 这里钉住。
 *
 * 面板走 Portal 到 body，用原生查询；卸载与清 body 必须在同一个 afterEach 里。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Dialog, {
        props,
        slots: {trigger: '<button type="button">新建邮件</button>', default: '<p>正文</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
const panel = () => document.querySelector('[role="dialog"]')
const overlay = () => document.querySelector('.bg-overlay')
const closeButton = () => panel()?.querySelector('button')

async function settle() {
    await nextTick()
    await nextTick()
}

function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Dialog · 触发器', () => {
    it('#trigger 插槽自己当触发器，标成 haspopup=dialog', () => {
        const wrapper = render()
        expect(trigger(wrapper).attributes('aria-haspopup')).toBe('dialog')
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('class 落在触发器上（as-child 合并，不额外包一层）', () => {
        const wrapper = render({class: 'w-full'})
        expect(trigger(wrapper).classes()).toContain('w-full')
    })

    it('不给 #trigger 就纯受控 —— 不渲染任何触发元素', () => {
        const wrapper = mount(Dialog, {slots: {default: '<p>正文</p>'}})
        mounted.push(wrapper)
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('点击打开，aria-expanded 跟着翻', async () => {
        const wrapper = render()
        await trigger(wrapper).trigger('click')
        await settle()
        expect(panel()).not.toBeNull()
        expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')
    })

    it('闭合时面板和遮罩都不在 DOM 里', () => {
        render()
        expect(panel()).toBeNull()
        expect(overlay()).toBeNull()
    })
})

describe('Dialog · 可访问名称与描述', () => {
    it('title 就是读屏名称（aria-labelledby 指向它）', async () => {
        render({open: true, title: '写邮件'})
        await settle()
        const labelledby = panel().getAttribute('aria-labelledby')
        const titleEl = document.getElementById(labelledby)
        expect(titleEl.textContent).toBe('写邮件')
        expect([...titleEl.classList]).toContain('text-title')
    })

    it('没可见标题时塞一个隐藏标题，名称不打折', async () => {
        render({open: true})
        await settle()
        const titleEl = document.getElementById(panel().getAttribute('aria-labelledby'))
        expect(titleEl.textContent).toBe('对话框')
        // 视觉上不占位：VisuallyHidden 那一套内联样式
        expect(titleEl.closest('[style*="absolute"]')).not.toBeNull()
    })

    it('ariaLabel 用来给无标题面板起名', async () => {
        render({open: true, ariaLabel: '快捷回复'})
        await settle()
        expect(document.getElementById(panel().getAttribute('aria-labelledby')).textContent).toBe('快捷回复')
    })

    it('兜底名称走 i18n 的 ui.dialog', async () => {
        render({open: true}, {
            global: {config: {globalProperties: {$t: (key) => (key === 'ui.dialog' ? 'Dialog' : key)}}},
        })
        await settle()
        expect(document.getElementById(panel().getAttribute('aria-labelledby')).textContent).toBe('Dialog')
    })

    it('description 接到 aria-describedby 上', async () => {
        render({open: true, title: '写邮件', description: '收件人可留空'})
        await settle()
        const describedby = panel().getAttribute('aria-describedby')
        expect(document.getElementById(describedby).textContent).toContain('收件人可留空')
    })

    it('没 description 就不留悬空引用 —— reka 默认会留一个', async () => {
        render({open: true, title: '写邮件'})
        await settle()
        expect(panel().getAttribute('aria-describedby')).toBeNull()
    })
})

describe('Dialog · 面板', () => {
    it('遮罩用共用的模态底 —— 玻璃面之一（§4.12）', async () => {
        render({open: true, title: 'x'})
        await settle()
        const classes = [...overlay().classList]
        expect(classes).toContain('fixed')
        expect(classes).toContain('inset-0')
        expect(classes).toContain('backdrop-blur-sm')
    })

    it('三段布局：头固定、身体自己滚、脚固定', async () => {
        render({open: true, title: 'x'}, {slots: {default: '<p>正文</p>', footer: '<button>发送</button>'}})
        await settle()
        expect([...panel().classList]).toEqual(expect.arrayContaining(['flex', 'flex-col', 'max-h-[85vh]']))
        expect(panel().querySelector('.overflow-y-auto').textContent).toContain('正文')
    })

    it('没有 #footer 就不渲染底部那一行', async () => {
        render({open: true, title: 'x'})
        await settle()
        expect(panel().querySelector('.justify-end')).toBeNull()
    })

    it('size 换的是最大宽度，默认 md', async () => {
        render({open: true, title: 'x'})
        await settle()
        expect([...panel().classList]).toContain('max-w-md')
    })

    it('size=lg / full 各走各的宽度', async () => {
        const wrapper = render({open: true, title: 'x', size: 'lg'})
        await settle()
        expect([...panel().classList]).toContain('max-w-lg')

        await wrapper.setProps({size: 'full'})
        await settle()
        expect([...panel().classList]).toContain('max-w-[calc(100vw-2rem)]')
    })

    it('contentClass 追加到面板上', async () => {
        render({open: true, title: 'x', contentClass: 'p-0'})
        await settle()
        expect([...panel().classList]).toContain('p-0')
    })
})

describe('Dialog · 关闭', () => {
    it('默认给关闭按钮，带兜底的无障碍名称', async () => {
        render({open: true, title: 'x'})
        await settle()
        expect(closeButton().getAttribute('aria-label')).toBe('关闭')
        expect(closeButton().querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    })

    it('closable=false 就没有 X —— 只能靠底部按钮走流程', async () => {
        render({open: true, title: 'x', closable: false})
        await settle()
        expect(closeButton()).toBeNull()
    })

    it('点 X 发出关闭', async () => {
        const wrapper = render({open: true, title: 'x'})
        await settle()
        closeButton().dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('Esc 关闭', async () => {
        const wrapper = render({open: true, title: 'x'})
        await settle()
        pressEscape()
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('dismissible=false 时 Esc 不关 —— 提交中别手滑', async () => {
        const wrapper = render({open: true, title: 'x', dismissible: false})
        await settle()
        pressEscape()
        await settle()
        expect(wrapper.emitted('update:open')).toBeUndefined()
        expect(panel()).not.toBeNull()
    })

    it('dismissible=false 时点外面也不关', async () => {
        const wrapper = render({open: true, title: 'x', dismissible: false})
        await settle()
        document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'mouse'}))
        await settle()
        expect(wrapper.emitted('update:open')).toBeUndefined()
    })
})
