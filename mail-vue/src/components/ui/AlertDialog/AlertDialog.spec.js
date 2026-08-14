import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import AlertDialog from './AlertDialog.vue'

/**
 * AlertDialog 是「不许手滑」的那个对话框，所以测的都是安全性质：
 * role=alertdialog、初始焦点在取消、点遮罩关不掉、确认不自动关（等异步结果）。
 *
 * 两个坑：
 *   - Esc **仍然**能关（reka 只拦了 pointerDownOutside / interactOutside），
 *     这是 radix 一脉的默认行为，不是漏了；
 *   - 派 Escape 必须 `cancelable: true`，否则 `preventDefault()` 是空操作，
 *     所有「拦不拦得住」的用例都会假绿。
 */

let mounted = []

function render(props = {}, options = {}) {
    const wrapper = mount(AlertDialog, {
        props: {title: '删除这封邮件？', open: true, ...props},
        ...options,
    })
    mounted.push(wrapper)
    return wrapper
}

const panel = () => document.querySelector('[role="alertdialog"]')
const buttons = () => [...panel().querySelectorAll('button')]
const cancelButton = () => buttons()[0]
const confirmButton = () => buttons()[1]

async function settle() {
    await nextTick()
    await nextTick()
    await nextTick()
}

function click(el) {
    el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('AlertDialog · 语义', () => {
    it('是 role=alertdialog，不是普通 dialog', async () => {
        render()
        await settle()
        expect(panel()).not.toBeNull()
        expect(document.querySelector('[role="dialog"]')).toBeNull()
    })

    it('title 是必填的，也是读屏名称', async () => {
        render()
        await settle()
        expect(AlertDialog.props.title.required).toBe(true)
        const titleEl = document.getElementById(panel().getAttribute('aria-labelledby'))
        expect(titleEl.textContent).toBe('删除这封邮件？')
    })

    it('description 接到 aria-describedby 上', async () => {
        render({description: '删除后 30 天内可在回收站找回'})
        await settle()
        const describedby = panel().getAttribute('aria-describedby')
        expect(document.getElementById(describedby).textContent).toContain('30 天内')
    })

    it('没 description 就不留悬空引用 —— reka 默认会留一个', async () => {
        render()
        await settle()
        expect(panel().getAttribute('aria-describedby')).toBeNull()
    })

    it('闭合时面板不在 DOM 里', () => {
        render({open: false})
        expect(panel()).toBeNull()
    })

    it('没有关闭 X —— 必须显式选一边', async () => {
        render()
        await settle()
        expect(buttons()).toHaveLength(2)
    })
})

describe('AlertDialog · 焦点与关闭', () => {
    it('初始焦点落在取消上，防手滑', async () => {
        render()
        await settle()
        expect(document.activeElement).toBe(cancelButton())
    })

    it('点遮罩关不掉', async () => {
        const wrapper = render()
        await settle()
        document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'mouse'}))
        await settle()
        expect(wrapper.emitted('update:open')).toBeUndefined()
        expect(panel()).not.toBeNull()
    })

    it('Esc 还是能关 —— 键盘用户需要一条退路', async () => {
        const wrapper = render()
        await settle()
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))
        await settle()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })
})

describe('AlertDialog · 两个动作', () => {
    it('取消：发 cancel，并让 reka 关掉', async () => {
        const wrapper = render()
        await settle()
        click(cancelButton())
        await settle()
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('确认：只发 confirm，不自动关 —— 异步操作要等结果', async () => {
        const wrapper = render()
        await settle()
        click(confirmButton())
        await settle()
        expect(wrapper.emitted('confirm')).toHaveLength(1)
        // 确认按钮没套 AlertDialogAction（那个的 onClick 无条件关，还不看 defaultPrevented）
        expect(wrapper.emitted('update:open')).toBeUndefined()
        expect(panel()).not.toBeNull()
    })

    it('文案默认走兜底的确定/取消', async () => {
        render()
        await settle()
        expect(cancelButton().textContent.trim()).toBe('取消')
        expect(confirmButton().textContent.trim()).toBe('确定')
    })

    it('破坏性操作自己传动词化文案', async () => {
        render({confirmText: '删除', cancelText: '保留'})
        await settle()
        expect(cancelButton().textContent.trim()).toBe('保留')
        expect(confirmButton().textContent.trim()).toBe('删除')
    })

    it('兜底文案走 i18n 的 ui.confirm / ui.cancel', async () => {
        render({}, {
            global: {
                config: {
                    globalProperties: {
                        $t: (key) => ({'ui.confirm': 'Delete', 'ui.cancel': 'Keep'})[key] ?? key,
                    },
                },
            },
        })
        await settle()
        expect(cancelButton().textContent.trim()).toBe('Keep')
        expect(confirmButton().textContent.trim()).toBe('Delete')
    })

    it('tone=danger 时确认按钮走 danger 变体', async () => {
        render({tone: 'danger'})
        await settle()
        expect(confirmButton().getAttribute('data-variant')).toBe('danger')
        expect(cancelButton().getAttribute('data-variant')).toBe('secondary')
    })

    it('默认确认按钮是 primary', async () => {
        render()
        await settle()
        expect(confirmButton().getAttribute('data-variant')).toBe('primary')
    })
})

describe('AlertDialog · loading', () => {
    it('确认进行中：按钮转圈报 busy，再点也不重复提交', async () => {
        const wrapper = render({loading: true})
        await settle()
        expect(confirmButton().hasAttribute('data-loading')).toBe(true)
        expect(confirmButton().getAttribute('aria-busy')).toBe('true')
        // 不加原生 disabled：读屏焦点要能停在按钮上
        expect(confirmButton().hasAttribute('disabled')).toBe(false)
        click(confirmButton())
        await settle()
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('进行中取消按钮禁用，但面板还在', async () => {
        render({loading: true})
        await settle()
        expect(cancelButton().hasAttribute('disabled')).toBe(true)
        expect(cancelButton().getAttribute('aria-disabled')).toBe('true')
        expect(panel()).not.toBeNull()
    })
})

describe('AlertDialog · 面板', () => {
    it('遮罩和 Dialog 共用同一套模态底', async () => {
        render()
        await settle()
        const classes = [...document.querySelector('.bg-overlay').classList]
        expect(classes).toContain('fixed')
        expect(classes).toContain('inset-0')
        expect(classes).toContain('backdrop-blur-sm')
    })

    it('窄面板：确认框不该长得像表单弹窗', async () => {
        render()
        await settle()
        expect([...panel().classList]).toContain('max-w-sm')
    })

    it('contentClass 追加到面板上', async () => {
        render({contentClass: 'max-w-md'})
        await settle()
        expect([...panel().classList]).toContain('max-w-md')
    })

    it('默认插槽是标题/描述之外的补充内容', async () => {
        render({}, {slots: {default: '<p>还有 3 封未读</p>'}})
        await settle()
        expect(panel().textContent).toContain('还有 3 封未读')
    })
})
