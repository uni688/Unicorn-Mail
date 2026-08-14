import {afterEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Toaster from './Toaster.vue'
import {toast} from './toast.js'

/**
 * 这一份连真的 vue-sonner 一起跑（参数层面的默认值在 toast.spec.js 里用 spy 测）。
 * 守两件事：
 *   1. `unstyled` 之后外观**全部**由我们的 classes 提供 —— 少给一个键，那块就是裸的；
 *   2. sonner 真正值钱的 a11y（aria-live 区域、关闭按钮的名字）没被 unstyled 弄丢。
 *
 * sonner 的 toast 存在模块级 store 里，跨用例不会自己清 —— 所以每个用例后
 * `toast.dismiss()` + 卸载，顺序同样是先卸载再清 body（afterEach 反序执行）。
 * 位置是自适应的（useMediaQuery），jsdom 的 matchMedia 恒为 false，
 * 所以默认分支是移动端，桌面分支得自己桩一个。
 *
 * sonner 不用 Portal，节点就长在组件里，而 VTU 的容器默认**不挂进 document** ——
 * 所以这里必须 `attachTo: document.body`，否则 `document.querySelector` 全是 null。
 */

let mounted = []
let restoreMatchMedia = null

function render(props = {}, options = {}) {
    const wrapper = mount(Toaster, {props, attachTo: document.body, ...options})
    mounted.push(wrapper)
    return wrapper
}

/** sonner 从 store 收到通知后要一拍才出现在 DOM 里；mounted 标记还要再一拍 */
async function settle() {
    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function stubMatchMedia(matches) {
    const original = window.matchMedia
    restoreMatchMedia = () => {
        window.matchMedia = original
    }
    window.matchMedia = (query) => ({
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })
}

const list = () => document.querySelector('[data-sonner-toaster]')
const region = () => document.querySelector('section[aria-live]')
const toasts = () => [...document.querySelectorAll('[data-sonner-toast]')]
const firstToast = () => toasts()[0]
const classesOf = (el) => [...el.classList]

afterEach(() => {
    toast.dismiss()
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
    restoreMatchMedia?.()
    restoreMatchMedia = null
})

describe('Toaster · 播报区域', () => {
    it('sonner 的 aria-live 区域还在 —— unstyled 只脱皮，不脱语义', async () => {
        render()
        await settle()
        expect(region().getAttribute('aria-live')).toBe('polite')
        expect(region().getAttribute('aria-atomic')).toBe('false')
        expect(region().getAttribute('aria-relevant')).toBe('additions text')
        // 通知区不该出现在 Tab 顺序里，只走热键
        expect(region().getAttribute('tabindex')).toBe('-1')
    })

    it('区域名字走 ui.notifications 的兜底文案', async () => {
        render()
        await settle()
        expect(region().getAttribute('aria-label')).toContain('通知')
    })

    it('装了 i18n 就用 i18n 的', async () => {
        render({}, {
            global: {config: {globalProperties: {$t: (key) => (key === 'ui.notifications' ? 'Notifications' : key)}}},
        })
        await settle()
        expect(region().getAttribute('aria-label')).toContain('Notifications')
    })
})

describe('Toaster · 位置', () => {
    it('移动端顶部居中 —— 底部要留给 Tab 栏', async () => {
        stubMatchMedia(false)
        render()
        await settle()
        expect(list().getAttribute('data-y-position')).toBe('top')
        expect(list().getAttribute('data-x-position')).toBe('center')
    })

    it('桌面右下角', async () => {
        stubMatchMedia(true)
        render()
        await settle()
        expect(list().getAttribute('data-y-position')).toBe('bottom')
        expect(list().getAttribute('data-x-position')).toBe('right')
    })

    it('position 显式覆盖自适应', async () => {
        stubMatchMedia(true)
        render({position: 'top-right'})
        await settle()
        expect(list().getAttribute('data-y-position')).toBe('top')
        expect(list().getAttribute('data-x-position')).toBe('right')
    })

    it('不传 theme —— 让 sonner 一直以为是 light，暗色归 token 管', async () => {
        render()
        await settle()
        // sonner 有一条没有 data-styled 门禁的暗色规则会把关闭按钮刷成它自己的灰
        expect(list().getAttribute('data-sonner-theme')).toBe('light')
        expect(list().getAttribute('data-theme')).toBe('light')
    })
})

describe('Toaster · 排队', () => {
    it('默认同时 3 条可见，第 4 条排队', async () => {
        render()
        await settle()
        toast('一')
        toast('二')
        toast('三')
        toast('四')
        await settle()
        const visible = toasts().map((el) => el.getAttribute('data-visible'))
        // sonner 把最新的排在前面，所以最早那条被挤出可见区
        expect(visible.filter((v) => v === 'true')).toHaveLength(3)
        expect(visible).toHaveLength(4)
    })

    it('visibleToasts 可调', async () => {
        render({visibleToasts: 1})
        await settle()
        toast('一')
        toast('二')
        await settle()
        expect(toasts().filter((el) => el.getAttribute('data-visible') === 'true')).toHaveLength(1)
    })

    it('默认收起成叠，expand 才全展开', async () => {
        render()
        await settle()
        toast('一')
        await settle()
        expect(firstToast().getAttribute('data-expanded')).toBe('false')
    })

    it('expand=true 时直接展开', async () => {
        render({expand: true})
        await settle()
        toast('一')
        await settle()
        expect(firstToast().getAttribute('data-expanded')).toBe('true')
    })
})

describe('Toaster · unstyled 外观', () => {
    it('确实是 unstyled —— sonner 自己的皮肤关掉了', async () => {
        render()
        await settle()
        toast('已保存')
        await settle()
        expect(firstToast().getAttribute('data-styled')).toBe('false')
    })

    it('卡片壳子由 token 给：raised 底 + line 边 + lg 圆角 + lg 阴影', async () => {
        render()
        await settle()
        toast('已保存')
        await settle()
        expect(classesOf(firstToast())).toEqual(expect.arrayContaining([
            'flex', 'items-start', 'gap-3', 'rounded-lg', 'border', 'border-line', 'bg-raised', 'p-3', 'text-fg', 'shadow-lg',
        ]))
    })

    it('标题与描述各自的字号层级', async () => {
        render()
        await settle()
        toast('已删除 3 封', {description: '30 天内可在回收站找回'})
        await settle()
        const title = firstToast().querySelector('[data-title]')
        const description = firstToast().querySelector('[data-description]')
        expect(title.textContent).toContain('已删除 3 封')
        expect(classesOf(title)).toContain('text-body-strong')
        expect(description.textContent).toContain('回收站')
        expect(classesOf(description)).toEqual(expect.arrayContaining(['text-caption', 'text-fg-muted']))
    })

    it('无类型的提示不给图标位 —— 免得空出一格', async () => {
        render()
        await settle()
        toast('已保存')
        await settle()
        expect(firstToast().querySelector('[data-icon]')).toBeNull()
    })
})

describe('Toaster · 图标插槽', () => {
    it.each([
        ['success', 'text-success-fg'],
        ['error', 'text-danger-fg'],
        ['warning', 'text-warning-fg'],
        ['info', 'text-info-fg'],
    ])('%s 有图标，颜色只染 [data-icon]', async (type, colorClass) => {
        render()
        await settle()
        toast[type]('文案')
        await settle()
        const icon = firstToast().querySelector('[data-icon]')
        // unstyled 下 sonner 不给自带图标，插槽缺了就是个空盒子
        expect(icon.querySelector('svg')).not.toBeNull()
        expect(icon.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
        expect(classesOf(firstToast())).toContain(`[&_[data-icon]]:${colorClass}`)
    })

    it('loading 用 Spinner，而且不给关闭按钮（受控，得由调用方收）', async () => {
        render()
        await settle()
        toast.loading('发送中')
        await settle()
        expect(firstToast().querySelector('[data-icon] svg')).not.toBeNull()
        expect(firstToast().querySelector('[data-close-button]')).toBeNull()
    })
})

describe('Toaster · 关闭按钮', () => {
    it('error 才有，名字走 i18n 兜底', async () => {
        render()
        await settle()
        toast.error('发送失败')
        await settle()
        const close = firstToast().querySelector('[data-close-button]')
        expect(close.getAttribute('aria-label')).toBe('关闭')
        expect(close.querySelector('svg')).not.toBeNull()
    })

    it('DOM 里排第一，视觉上用 order-last 推到末尾', async () => {
        render()
        await settle()
        toast.error('发送失败')
        await settle()
        expect(firstToast().firstElementChild.getAttribute('data-close-button')).toBe('true')
        expect(classesOf(firstToast().querySelector('[data-close-button]'))).toContain('order-last')
    })

    it('点它就关掉这一条', async () => {
        render()
        await settle()
        toast.error('发送失败')
        await settle()
        firstToast().querySelector('[data-close-button]').dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await settle()
        expect(firstToast().getAttribute('data-removed')).toBe('true')
    })

    it('普通提示不给关闭按钮 —— 2.5s 自己走', async () => {
        render()
        await settle()
        toast.success('已发送')
        await settle()
        expect(firstToast().querySelector('[data-close-button]')).toBeNull()
    })
})

describe('Toaster · 撤销按钮', () => {
    it('走 sonner 的 action，样式是次要按钮', async () => {
        render()
        await settle()
        toast.undo('已删除 3 封', {onUndo: () => {}})
        await settle()
        const action = firstToast().querySelector('[data-button]')
        expect(action.textContent.trim()).toBe('撤销')
        expect(classesOf(action)).toEqual(expect.arrayContaining(['order-last', 'border', 'border-line', 'bg-surface', 'text-label']))
    })

    it('点撤销执行回调', async () => {
        const onUndo = vi.fn()
        render()
        await settle()
        toast.undo('已删除 3 封', {onUndo})
        await settle()
        firstToast().querySelector('[data-button]').dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await settle()
        expect(onUndo).toHaveBeenCalledTimes(1)
    })
})
