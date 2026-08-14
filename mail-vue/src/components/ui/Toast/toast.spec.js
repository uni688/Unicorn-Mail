import {beforeEach, describe, expect, it, vi} from 'vitest'

/**
 * toast() 是个薄包装，值钱的只有「默认值」这一件事 —— 时长、error 的关闭按钮、
 * 撤销窗口。所以这里把 vue-sonner 换成 spy，测的是**我们交给它的参数**，
 * 而不是它自己的渲染（那部分在 Toaster.spec.js 里连真库一起测）。
 *
 * 注意 `setToastText` 写的是模块作用域的变量，测完必须还回去，
 * 否则后面的用例会拿到别的用例装的解析器。
 */
vi.mock('vue-sonner', () => {
    const toast = vi.fn(() => 'id')
    Object.assign(toast, {
        success: vi.fn(() => 'id'),
        error: vi.fn(() => 'id'),
        warning: vi.fn(() => 'id'),
        info: vi.fn(() => 'id'),
        loading: vi.fn(() => 'id'),
        promise: vi.fn(() => 'id'),
        custom: vi.fn(() => 'id'),
        dismiss: vi.fn(),
    })
    return {toast}
})

const {toast: sonner} = await import('vue-sonner')
const {toast, UNDO_WINDOW, setToastText} = await import('./toast.js')
const {resolveUiText} = await import('../_shared/useUiText.js')

/** 最后一次调用的第二个参数（options） */
const optionsOf = (spy) => spy.mock.calls.at(-1)[1]

beforeEach(() => {
    vi.clearAllMocks()
})

describe('toast · 类型与时长', () => {
    it('默认调用没有类型，2.5s', () => {
        toast('已保存')
        expect(sonner).toHaveBeenCalledWith('已保存', {duration: 2500})
    })

    it.each([
        ['success', 2500],
        ['info', 2500],
        ['warning', 3000],
        ['error', 4000],
    ])('%s 的时长是 %ims —— 越需要读完的越久', (type, duration) => {
        toast[type]('文案')
        expect(optionsOf(sonner[type]).duration).toBe(duration)
    })

    it('调用方传的 duration 压过默认值', () => {
        toast.success('已发送', {duration: 8000})
        expect(optionsOf(sonner.success).duration).toBe(8000)
    })

    it('loading 不自动关 —— 拿返回的 id 自己收', () => {
        const id = toast.loading('发送中')
        expect(optionsOf(sonner.loading).duration).toBe(Infinity)
        expect(id).toBe('id')
    })

    it('loading 的时长也允许覆盖（有兜底超时的场景）', () => {
        toast.loading('发送中', {duration: 30000})
        expect(optionsOf(sonner.loading).duration).toBe(30000)
    })
})

describe('toast · error 的关闭按钮', () => {
    it('error 自带关闭按钮 —— 4s 读不完得能留住', () => {
        toast.error('发送失败：收件人地址无效')
        expect(optionsOf(sonner.error).closeButton).toBe(true)
    })

    it('调用方可以显式关掉它', () => {
        toast.error('发送失败', {closeButton: false})
        expect(optionsOf(sonner.error).closeButton).toBe(false)
    })

    it('只有 error 加，别的类型不加', () => {
        toast.warning('草稿未保存')
        toast.success('已发送')
        expect(optionsOf(sonner.warning)).not.toHaveProperty('closeButton')
        expect(optionsOf(sonner.success)).not.toHaveProperty('closeButton')
    })

    it('其他选项照常透传（id 用来原地更新同一条）', () => {
        toast.success('已发送', {id: 'send', description: '在已发送里'})
        expect(optionsOf(sonner.success)).toMatchObject({id: 'send', description: '在已发送里', duration: 2500})
    })
})

describe('toast.undo · 撤销窗口', () => {
    it('固定 5s，和乐观更新的回滚窗口一个数', () => {
        toast.undo('已删除 3 封')
        expect(optionsOf(sonner).duration).toBe(UNDO_WINDOW)
        expect(UNDO_WINDOW).toBe(5000)
    })

    it('按钮文案默认走兜底的「撤销」', () => {
        toast.undo('已删除 3 封')
        expect(optionsOf(sonner).action.label).toBe('撤销')
    })

    it('点按钮才执行 onUndo', () => {
        const onUndo = vi.fn()
        toast.undo('已删除 3 封', {onUndo})
        expect(onUndo).not.toHaveBeenCalled()
        optionsOf(sonner).action.onClick()
        expect(onUndo).toHaveBeenCalledTimes(1)
    })

    it('没给 onUndo 也不炸 —— 按钮就是个空动作', () => {
        toast.undo('已删除 3 封')
        expect(() => optionsOf(sonner).action.onClick()).not.toThrow()
    })

    it('actionLabel 覆盖文案，且不会漏进 sonner 的 options', () => {
        toast.undo('已归档', {actionLabel: '放回收件箱'})
        const options = optionsOf(sonner)
        expect(options.action.label).toBe('放回收件箱')
        expect(options).not.toHaveProperty('actionLabel')
        expect(options).not.toHaveProperty('onUndo')
    })

    it('其余选项透传，duration 也允许压过 5s', () => {
        toast.undo('已删除', {id: 'del', duration: 9000})
        expect(optionsOf(sonner)).toMatchObject({id: 'del', duration: 9000})
    })
})

describe('toast · 透传的那几个', () => {
    it('promise 原样交给 sonner，三态归它管', () => {
        const p = Promise.resolve(1)
        const data = {loading: '发送中', success: '已发送', error: '失败'}
        toast.promise(p, data)
        expect(sonner.promise).toHaveBeenCalledWith(p, data)
    })

    it('custom 交组件，布局与配色归调用方', () => {
        const component = {template: '<div />'}
        toast.custom(component, {duration: 1000})
        expect(sonner.custom).toHaveBeenCalledWith(component, {duration: 1000})
    })

    it('dismiss 带 id 关一条，不带 id 全关', () => {
        toast.dismiss('send')
        toast.dismiss()
        expect(sonner.dismiss.mock.calls).toEqual([['send'], [undefined]])
    })
})

describe('toast · i18n', () => {
    /** 复原成 toast.js 里那个不带 i18n 的默认解析器 */
    const restore = () => setToastText((key, params) => resolveUiText(null, key, params))

    it('Toaster 挂载后交进来的解析器接管兜底文案', () => {
        setToastText((key) => (key === 'undo' ? 'Undo' : key))
        try {
            toast.undo('Deleted 3')
            expect(optionsOf(sonner).action.label).toBe('Undo')
        } finally {
            restore()
        }
    })

    it('交进来的不是函数就当没说过 —— 原语不能因为宿主没装 i18n 就抛', () => {
        setToastText(undefined)
        setToastText(null)
        toast.undo('已删除 3 封')
        expect(optionsOf(sonner).action.label).toBe('撤销')
    })
})
