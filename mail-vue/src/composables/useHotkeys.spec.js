/**
 * useHotkeys 的匹配层。§7.1 的硬性约束是「焦点在输入框里时单字母键全部失效」——
 * 这条错了就是「在收件人框里打 j 变成跳下一封」，所以文本上下文那一组是重点。
 *
 * 键位归一化里最容易回退的两处也在这里锁住：
 * - `?` 只能由 Shift+/ 打出来，所以可打印的非字母字符**不记 shift**（记了就永远匹配不上）
 * - 非 mac 上 `Ctrl` 与 `Mod` 是同一个物理键，两种写法必须折叠成同一个签名
 *
 * jsdom 的 `navigator` 不是 mac，所以 `Mod` = Ctrl。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {
    __internals,
    __resetHotkeys,
    hotkeysEnabled,
    isHotkeyActive,
    isTypingContext,
    setHotkeysEnabled,
    useHotkeyCatalog,
    useHotkeys,
} from './useHotkeys.js'

/** 从 window 派发（target 不是元素 → 不算文本上下文） */
function press(key, init = {}) {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init})
    window.dispatchEvent(event)
    return event
}

/** 从某个元素派发：事件冒泡到 window，但 target 是那个元素 */
function pressIn(el, key, init = {}) {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init})
    el.dispatchEvent(event)
    return event
}

function inputEl(type = 'text') {
    const el = document.createElement('input')
    el.type = type
    document.body.appendChild(el)
    return el
}

beforeEach(() => {
    __resetHotkeys()
    setHotkeysEnabled(true)
})

afterEach(() => {
    __resetHotkeys()
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('useHotkeys · 匹配', () => {
    it('组合键与单键各自命中，并默认阻止浏览器默认行为', () => {
        const palette = vi.fn()
        const star = vi.fn()
        useHotkeys([{keys: 'Mod+K', run: palette}, {keys: 's', run: star}])

        const combo = press('k', {ctrlKey: true})
        expect(palette).toHaveBeenCalledTimes(1)
        expect(combo.defaultPrevented).toBe(true)

        press('s')
        expect(star).toHaveBeenCalledTimes(1)
        // 裸 k 不该走到 Mod+K 上
        press('k')
        expect(palette).toHaveBeenCalledTimes(1)
    })

    it('非 mac 上 Ctrl 与 Mod 折叠成同一个签名', () => {
        expect(__internals.isMac).toBe(false)
        expect(__internals.normalizeKeys('Ctrl+K')).toBe(__internals.normalizeKeys('Mod+K'))
    })

    it('可打印的非字母字符不记 shift：? 与 # 能被打出来', () => {
        const shortcuts = vi.fn()
        const del = vi.fn()
        useHotkeys([{keys: '?', run: shortcuts}, {keys: '#', run: del}])

        press('?', {shiftKey: true})
        press('#', {shiftKey: true})
        expect(shortcuts).toHaveBeenCalledTimes(1)
        expect(del).toHaveBeenCalledTimes(1)
    })

    it('目录里的 id 能省掉 keys，实现与 ? 面板不会走偏', () => {
        const run = vi.fn()
        useHotkeys([{id: 'palette', run}])
        press('k', {ctrlKey: true})
        expect(run).toHaveBeenCalledTimes(1)
        expect(isHotkeyActive('palette')).toBe(true)
    })

    it('浮层已经处理掉的键不再抢（Esc 归 reka/vaul）', () => {
        const run = vi.fn()
        useHotkeys([{keys: 'Esc', run}])

        const event = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})
        event.preventDefault()
        window.dispatchEvent(event)
        expect(run).not.toHaveBeenCalled()
    })

    it('preventDefault: false 的绑定不吞原生行为', () => {
        useHotkeys([{keys: 'Esc', preventDefault: false, run: () => {}}])
        expect(press('Escape').defaultPrevented).toBe(false)
    })

    it('整体开关关掉后一个都不响应', () => {
        const run = vi.fn()
        useHotkeys([{keys: 's', run}])
        setHotkeysEnabled(false)
        press('s')
        expect(run).not.toHaveBeenCalled()
        expect(hotkeysEnabled.value).toBe(false)
        expect(localStorage.getItem('um-hotkeys')).toBe('0')
    })
})

describe('useHotkeys · 文本上下文（§7.1 的硬性约束）', () => {
    it('输入框里单字母键全部失效', () => {
        const run = vi.fn()
        useHotkeys([{keys: 'j', run}])
        pressIn(inputEl(), 'j')
        expect(run).not.toHaveBeenCalled()
    })

    it('输入框里带 Mod/Alt 的组合键与命名键照常放行', () => {
        const send = vi.fn()
        const escape = vi.fn()
        useHotkeys([{keys: 'Mod+Enter', run: send}, {keys: 'Esc', run: escape}])

        const el = inputEl()
        pressIn(el, 'Enter', {ctrlKey: true})
        pressIn(el, 'Escape')
        expect(send).toHaveBeenCalledTimes(1)
        expect(escape).toHaveBeenCalledTimes(1)
    })

    it('输入法组合中一律不响应（isComposing 与 keyCode 229 双拦）', () => {
        const run = vi.fn()
        const send = vi.fn()
        useHotkeys([{keys: 'j', run}, {keys: 'Mod+Enter', run: send}])

        pressIn(inputEl(), 'j', {isComposing: true})
        press('j', {isComposing: true})
        expect(run).not.toHaveBeenCalled()

        // 部分 IME 在 compositionstart 之前就发 keydown，此时 isComposing 还是 false
        expect(isTypingContext({keyCode: 229, target: document.body})).toBe(true)
    })

    it('不吃字符的 input（checkbox / 按钮）不算文本上下文', () => {
        const run = vi.fn()
        useHotkeys([{keys: 'x', run}])
        pressIn(inputEl('checkbox'), 'x')
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('contenteditable 与 textarea 也算文本上下文', () => {
        const div = document.createElement('div')
        div.contentEditable = 'true'
        // jsdom 不实现 isContentEditable，显式补上再断言判定逻辑本身
        Object.defineProperty(div, 'isContentEditable', {value: true})
        expect(isTypingContext({target: div})).toBe(true)

        const area = document.createElement('textarea')
        expect(isTypingContext({target: area})).toBe(true)
    })
})

describe('useHotkeys · 序列键', () => {
    it('g i 走通；第一个键被吞掉不下传', () => {
        const run = vi.fn()
        useHotkeys([{keys: 'g i', run}])

        const first = press('g')
        expect(run).not.toHaveBeenCalled()
        expect(first.defaultPrevented).toBe(true)

        press('i')
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('序列没走通就整次作废，第二个键不再当独立快捷键用', () => {
        const goTrash = vi.fn()
        const toggleCheck = vi.fn()
        useHotkeys([{keys: 'g x', run: goTrash}, {keys: 'c', run: toggleCheck}])

        press('g')
        press('c')
        // 刚按过 g 的人按 c 是想去某个文件夹，不该变成「写邮件」
        expect(toggleCheck).not.toHaveBeenCalled()
        expect(goTrash).not.toHaveBeenCalled()

        // 作废后恢复正常
        press('c')
        expect(toggleCheck).toHaveBeenCalledTimes(1)
    })

    it('超过等待窗口后第二个键不再算序列', () => {
        vi.useFakeTimers()
        const run = vi.fn()
        useHotkeys([{keys: 'g i', run}])

        press('g')
        vi.advanceTimersByTime(1300)
        press('i')
        expect(run).not.toHaveBeenCalled()
    })

    it('输入框里序列键连第一个都进不来', () => {
        const run = vi.fn()
        useHotkeys([{keys: 'g i', run}])
        const el = inputEl()
        pressIn(el, 'g')
        pressIn(el, 'i')
        expect(run).not.toHaveBeenCalled()
    })
})

describe('useHotkeys · 优先级与注销', () => {
    it('后注册的赢：列表页的 x 压住全局的 x', () => {
        const global = vi.fn()
        const list = vi.fn()
        useHotkeys([{keys: 'x', run: global}])
        useHotkeys([{keys: 'x', run: list}])

        press('x')
        expect(list).toHaveBeenCalledTimes(1)
        expect(global).not.toHaveBeenCalled()
    })

    it('when 为假时让位给下一个候选', () => {
        const global = vi.fn()
        const list = vi.fn()
        useHotkeys([{keys: 'x', run: global}])
        useHotkeys([{keys: 'x', when: () => false, run: list}])

        press('x')
        expect(list).not.toHaveBeenCalled()
        expect(global).toHaveBeenCalledTimes(1)
    })

    it('enabled 是响应式的：整组可以临时关掉', () => {
        const run = vi.fn()
        const enabled = ref(false)
        useHotkeys([{keys: 'x', run}], {enabled})

        press('x')
        expect(run).not.toHaveBeenCalled()

        enabled.value = true
        press('x')
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('stop() 之后不再响应，可用性标记也跟着掉', () => {
        const run = vi.fn()
        const {stop} = useHotkeys([{id: 'star', keys: 's', run}])
        expect(isHotkeyActive('star')).toBe(true)

        stop()
        press('s')
        expect(run).not.toHaveBeenCalled()
        expect(isHotkeyActive('star')).toBe(false)
    })

    it('同一个 id 多处注册时按引用计数消，不会被先卸的那一处清掉', () => {
        const {stop} = useHotkeys([{id: 'star', keys: 's', run: () => {}}])
        useHotkeys([{id: 'star', keys: 's', run: () => {}}])

        stop()
        expect(isHotkeyActive('star')).toBe(true)
    })
})

describe('useHotkeyCatalog · ? 面板的数据源', () => {
    it('按作用域分组，注册过的标 available', () => {
        useHotkeys([{id: 'palette', run: () => {}}])
        const groups = useHotkeyCatalog().value

        expect(groups.map((g) => g.scope)).toEqual(
            expect.arrayContaining(['global', 'list', 'read', 'compose']),
        )
        const global = groups.find((g) => g.scope === 'global')
        expect(global.items.find((i) => i.id === 'palette').available).toBe(true)
        expect(global.items.find((i) => i.id === 'go-trash').available).toBe(false)
    })

    it('无权限的条目整行不出现（§7.1）', () => {
        const withPerm = useHotkeyCatalog(() => true).value.find((g) => g.scope === 'global')
        const without = useHotkeyCatalog(() => false).value.find((g) => g.scope === 'global')

        expect(withPerm.items.some((i) => i.id === 'go-admin')).toBe(true)
        expect(without.items.some((i) => i.id === 'go-admin')).toBe(false)
    })

    it('注册变化会让面板重算（registryVersion 被读进 computed）', () => {
        const catalog = useHotkeyCatalog()
        const before = catalog.value.find((g) => g.scope === 'list')
            .items.find((i) => i.id === 'star').available
        expect(before).toBe(false)

        useHotkeys([{id: 'star', run: () => {}}])
        const after = catalog.value.find((g) => g.scope === 'list')
            .items.find((i) => i.id === 'star').available
        expect(after).toBe(true)
    })
})
