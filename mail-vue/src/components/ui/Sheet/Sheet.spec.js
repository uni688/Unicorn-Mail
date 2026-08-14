import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import Sheet from './Sheet.vue'

/**
 * Sheet 底下是 vaul-vue，而 vaul 又是搭在 reka 的 Dialog 上的 —— 所以它同时继承了
 * 两边的性质：`role="dialog"` + aria-labelledby/describedby 来自 reka，位移和手势来自 vaul。
 * 手势本身（拖拽阈值、吸附）在 jsdom 里没有布局可言，测不了；这里守的是
 * **方向 → 位置/圆角/把手/关闭线索** 这套映射，和标题永不缺席。
 *
 * 标题有两条路：有头部那一行时标题在里面（可见或 VisuallyHidden），
 * 整行都不渲染时走模板末尾那个 `v-else` 的隐藏标题 —— 两条都要有名字。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(Sheet, {
        props: {open: true, ...props},
        slots: {trigger: '<button type="button">筛选</button>', default: '<p>正文</p>'},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const trigger = (wrapper) => wrapper.get('button')
const panel = () => document.querySelector('[role="dialog"]')
const overlay = () => document.querySelector('[data-vaul-overlay]')
const handle = () => document.querySelector('[data-vaul-handle]')
const closeButton = () => panel()?.querySelector('button[aria-label]')
const titleOf = () => document.getElementById(panel().getAttribute('aria-labelledby'))

async function settle() {
    await nextTick()
    await nextTick()
    await nextTick()
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Sheet · 触发器', () => {
    it('#trigger 插槽自己当触发器', async () => {
        const wrapper = render({open: undefined})
        await settle()
        expect(wrapper.findAll('button')).toHaveLength(1)
        expect(trigger(wrapper).attributes('data-state')).toBe('closed')
    })

    it('不给 #trigger 就纯受控 —— 不渲染任何触发元素', async () => {
        const wrapper = mount(Sheet, {props: {open: undefined}, slots: {default: '<p>正文</p>'}})
        mounted.push(wrapper)
        await settle()
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('闭合时面板和遮罩都不在 DOM 里', async () => {
        render({open: false})
        await settle()
        expect(panel()).toBeNull()
        expect(overlay()).toBeNull()
    })
})

describe('Sheet · 方向映射', () => {
    it('默认从底部升起：顶部 2xl 圆角 + 只有上边框', async () => {
        render()
        await settle()
        const classes = [...panel().classList]
        expect(panel().getAttribute('data-vaul-drawer-direction')).toBe('bottom')
        expect(classes).toEqual(expect.arrayContaining(['inset-x-0', 'bottom-0', 'max-h-[85vh]', 'rounded-t-2xl', 'border-t']))
    })

    it('左右方向是抽屉：限宽 + 贴边那侧不要圆角', async () => {
        render({side: 'left'})
        await settle()
        const classes = [...panel().classList]
        expect(panel().getAttribute('data-vaul-drawer-direction')).toBe('left')
        expect(classes).toEqual(expect.arrayContaining(['inset-y-0', 'left-0', 'w-[85vw]', 'max-w-sm', 'rounded-r-2xl', 'border-r']))
    })

    it('上下方向给把手，不给 X —— 把手就是关闭线索', async () => {
        render()
        await settle()
        expect(handle()).not.toBeNull()
        expect(closeButton()).toBeNull()
    })

    it('把手对辅助技术隐藏 —— 它按不动，读出来只会误导', async () => {
        render()
        await settle()
        expect(handle().getAttribute('aria-hidden')).toBe('true')
    })

    it('左右抽屉反过来：没有把手，给 X', async () => {
        render({side: 'right'})
        await settle()
        expect(handle()).toBeNull()
        expect(closeButton()).not.toBeNull()
        expect(closeButton().getAttribute('aria-label')).toBe('关闭')
    })

    it('handle / closable 可以各自强制覆盖', async () => {
        render({side: 'bottom', handle: false, closable: true})
        await settle()
        expect(handle()).toBeNull()
        expect(closeButton()).not.toBeNull()
    })

    it('size 追加到面板上（左右抽屉的宽 / 上下的高）', async () => {
        render({side: 'left', size: 'max-w-xs'})
        await settle()
        expect([...panel().classList]).toContain('max-w-xs')
    })

    it('contentClass 追加到面板上', async () => {
        render({contentClass: 'px-0'})
        await settle()
        expect([...panel().classList]).toContain('px-0')
    })
})

describe('Sheet · 可访问名称与描述', () => {
    it('title 就是读屏名称', async () => {
        render({title: '筛选邮件'})
        await settle()
        expect(titleOf().textContent).toBe('筛选邮件')
        expect([...titleOf().classList]).toContain('text-title')
    })

    it('连头部那一行都不渲染时，标题也不能缺 —— 走末尾那个隐藏标题', async () => {
        render()
        await settle()
        // 没 title / description / #header，bottom 方向也没 X：整行都省了
        expect(panel().querySelector('.pb-3')).toBeNull()
        expect(titleOf().textContent).toBe('对话框')
    })

    it('ariaLabel 给无标题面板起名', async () => {
        render({ariaLabel: '批量操作'})
        await settle()
        expect(titleOf().textContent).toBe('批量操作')
    })

    it('兜底名称走 i18n 的 ui.dialog', async () => {
        render({}, {
            global: {config: {globalProperties: {$t: (key) => (key === 'ui.dialog' ? 'Sheet' : key)}}},
        })
        await settle()
        expect(titleOf().textContent).toBe('Sheet')
    })

    it('description 接到 aria-describedby 上', async () => {
        render({title: '筛选邮件', description: '只影响当前文件夹'})
        await settle()
        const describedby = panel().getAttribute('aria-describedby')
        expect(document.getElementById(describedby).textContent).toContain('只影响当前文件夹')
    })

    it('没 description 就不留悬空引用 —— reka 默认会留一个', async () => {
        render({title: '筛选邮件'})
        await settle()
        expect(panel().getAttribute('aria-describedby')).toBeNull()
    })
})

describe('Sheet · 面板结构', () => {
    it('遮罩用共用的模态底，但不挂动画类 —— 位移交给 vaul', async () => {
        render()
        await settle()
        const classes = [...overlay().classList]
        expect(classes).toEqual(expect.arrayContaining(['fixed', 'inset-0', 'backdrop-blur-sm']))
        expect(classes.some((c) => c.includes('animate-overlay'))).toBe(false)
    })

    it('内容自己滚，底部留出安全区', async () => {
        render({title: 'x'})
        await settle()
        const body = panel().querySelector('.overflow-y-auto')
        expect(body.textContent).toContain('正文')
        expect([...body.classList]).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]')
    })

    it('没有 #footer 就不渲染底部那一行', async () => {
        render({title: 'x'})
        await settle()
        expect(panel().querySelector('.border-t.px-4')).toBeNull()
    })

    it('有 #footer 时给一条分隔的固定底栏', async () => {
        render({title: 'x'}, {slots: {default: '<p>正文</p>', footer: '<button type="button">应用</button>'}})
        await settle()
        const footer = panel().querySelector('.border-t.px-4')
        expect(footer).not.toBeNull()
        expect(footer.textContent).toContain('应用')
    })
})

describe('Sheet · 关闭', () => {
    /** vaul 自己 watch(isOpen, {immediate: true}) 再发一次，所以只看有没有 false */
    const closedOnce = (wrapper) => (wrapper.emitted('update:open') ?? []).some(([v]) => v === false)

    it('受控打开时 vaul 会回声一次 update:open(true) —— 值没变，不是自作主张', async () => {
        const wrapper = render({title: 'x'})
        await settle()
        expect(wrapper.emitted('update:open')).toEqual([[true]])
    })

    it('点 X 发出关闭', async () => {
        const wrapper = render({side: 'right', title: 'x'})
        await settle()
        closeButton().dispatchEvent(new MouseEvent('click', {bubbles: true}))
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('Esc 关闭', async () => {
        const wrapper = render({title: 'x'})
        await settle()
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('dismissible=false 时 Esc 不关', async () => {
        const wrapper = render({title: 'x', dismissible: false})
        await settle()
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))
        await settle()
        expect(closedOnce(wrapper)).toBe(false)
        expect(panel()).not.toBeNull()
    })
})
