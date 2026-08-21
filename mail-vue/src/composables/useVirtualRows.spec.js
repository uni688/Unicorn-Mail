/**
 * useVirtualRows 单测。
 *
 * jsdom 没有布局，所以这里用 `defineProperty` 直接给容器一个 clientHeight，再手动派发
 * `scroll` 事件驱动 `useScroll` —— 真实的滚动/尺寸行为属于浏览器验收的范围（§10.6），
 * 单测能覆盖的是算术部分：前缀和、二分、窗口边界、触底判定。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'
import {nextTick, ref} from 'vue'
import {useVirtualRows} from '@/composables/useVirtualRows.js'

/** 邮件行 56、分组头 28（§7.4 的 cozy 档） */
const rowsOf = (n, every = 0) => Array.from({length: n}, (_, i) => ({
    key: `r${i}`,
    kind: every && i % every === 0 ? 'group' : 'mail',
}))

const HEIGHT = row => (row.kind === 'group' ? 28 : 56)

let el

beforeEach(() => {
    el = document.createElement('div')
    Object.defineProperty(el, 'clientHeight', {value: 500, configurable: true})
    el.scrollTo = vi.fn()
    document.body.appendChild(el)
})

async function scrollTo(px) {
    Object.defineProperty(el, 'scrollTop', {value: px, configurable: true, writable: true})
    el.dispatchEvent(new Event('scroll'))
    await nextTick()
}

const setup = (rows, options = {}) =>
    useVirtualRows(rows, {container: ref(el), rowHeight: HEIGHT, ...options})

describe('useVirtualRows · 前缀和与二分', () => {

    it('混高行的总高 = 各行之和', () => {
        // 每 5 行一个分组头：20 行里 4 个 28、16 个 56
        const v = setup(ref(rowsOf(20, 5)))
        expect(v.totalHeight.value).toBe(4 * 28 + 16 * 56)
        expect(v.offsets.value).toHaveLength(21)
        expect(v.offsets.value[0]).toBe(0)
    })

    it('indexAt 命中包含该像素的行，边界归下一行', () => {
        const v = setup(ref(rowsOf(10)))
        expect(v.indexAt(0)).toBe(0)
        expect(v.indexAt(55)).toBe(0)
        expect(v.indexAt(56)).toBe(1)
        expect(v.indexAt(57)).toBe(1)
        expect(v.indexAt(9 * 56)).toBe(9)
        // 超出末尾不越界
        expect(v.indexAt(99999)).toBe(9)
    })

    it('rowHeight 也可以是常数；非法高度按 0 处理', () => {
        expect(setup(ref(rowsOf(4)), {rowHeight: 44}).totalHeight.value).toBe(176)
        expect(setup(ref(rowsOf(4)), {rowHeight: () => NaN}).totalHeight.value).toBe(0)
        expect(setup(ref(rowsOf(4)), {rowHeight: () => -10}).totalHeight.value).toBe(0)
    })

    it('空列表：总高 0、没有可见行、不算触底', () => {
        const v = setup(ref([]))
        expect(v.totalHeight.value).toBe(0)
        expect(v.visible.value).toEqual([])
        expect(v.atBottom.value).toBe(false)
    })
})

describe('useVirtualRows · 窗口', () => {

    it('1000 行只挂视口 + overscan 那些（这是虚拟滚动的全部意义）', () => {
        const v = setup(ref(rowsOf(1000)), {overscan: 6})
        // 视口 500 / 行高 56 ≈ 9 行，加下方 overscan
        expect(v.visible.value.length).toBeLessThanOrEqual(9 + 6 + 2)
        expect(v.visible.value[0].index).toBe(0)
        expect(v.visible.value[0].offset).toBe(0)
        expect(v.visible.value[0].height).toBe(56)
        expect(v.visible.value[0].key).toBe('r0')
    })

    it('滚动后窗口跟着走，上方也留 overscan', async () => {
        const v = setup(ref(rowsOf(1000)), {overscan: 6})
        await scrollTo(56 * 100)
        expect(v.scrollTop.value).toBe(5600)
        expect(v.range.value.start).toBe(100 - 6)
        expect(v.visible.value[0].index).toBe(94)
        expect(v.visible.value.at(-1).index).toBeGreaterThan(100)
        // offset 始终是该行的绝对顶边，模板直接拿去 translateY
        expect(v.visible.value[0].offset).toBe(94 * 56)
    })

    it('overscan=0 时窗口正好覆盖视口', async () => {
        const v = setup(ref(rowsOf(100)), {overscan: 0})
        await scrollTo(0)
        expect(v.range.value.start).toBe(0)
        // 500/56 = 8.9 → 第 8 行仍露一部分，所以 end 到 9
        expect(v.range.value.end).toBe(9)
    })

    it('行数变化后窗口自动重算（翻页追加）', async () => {
        const rows = ref(rowsOf(10))
        const v = setup(rows)
        const before = v.visible.value.length
        rows.value = rowsOf(200)
        await nextTick()
        expect(v.visible.value.length).toBeGreaterThan(before)
        expect(v.totalHeight.value).toBe(200 * 56)
    })
})

describe('useVirtualRows · 触底与滚动', () => {

    it('距底 ≤ 1200px 算触底（沿用旧实现的 offset）', async () => {
        const v = setup(ref(rowsOf(100)))       // 总高 5600，视口 500
        await scrollTo(0)
        expect(v.atBottom.value).toBe(false)    // 距底 5100
        await scrollTo(3899)
        expect(v.atBottom.value).toBe(false)    // 距底 1201
        await scrollTo(3900)
        expect(v.atBottom.value).toBe(true)     // 距底 1200
    })

    it('阈值可调；短列表（不足一屏）一开始就算触底', async () => {
        const v = setup(ref(rowsOf(100)), {bottomThreshold: 100})
        await scrollTo(3900)
        expect(v.atBottom.value).toBe(false)
        await scrollTo(5000)
        expect(v.atBottom.value).toBe(true)

        const short = setup(ref(rowsOf(3)))
        await scrollTo(0)
        expect(short.atBottom.value).toBe(true)
    })

    it('scrollToIndex align=start 顶边对齐', () => {
        const v = setup(ref(rowsOf(100)))
        v.scrollToIndex(10, {align: 'start'})
        expect(el.scrollTo).toHaveBeenCalledWith({top: 560, behavior: 'auto'})
    })

    it('align=auto 只在行不完整可见时滚动，向上/向下方向不同', async () => {
        const v = setup(ref(rowsOf(100)))
        await scrollTo(1000)
        el.scrollTo.mockClear()

        // 第 20 行（1120~1176）已完整可见 → 不滚
        v.scrollToIndex(20)
        expect(el.scrollTo).not.toHaveBeenCalled()

        // 上方的行 → 顶边对齐
        v.scrollToIndex(5)
        expect(el.scrollTo).toHaveBeenLastCalledWith({top: 280, behavior: 'auto'})

        // 下方的行 → 底边贴视口底
        v.scrollToIndex(30)
        expect(el.scrollTo).toHaveBeenLastCalledWith({top: 31 * 56 - 500, behavior: 'auto'})
    })

    it('索引越界被夹住，容器为空时不抛错', () => {
        const v = setup(ref(rowsOf(10)))
        v.scrollToIndex(999, {align: 'start'})
        expect(el.scrollTo).toHaveBeenLastCalledWith({top: 9 * 56, behavior: 'auto'})

        const detached = useVirtualRows(ref(rowsOf(10)), {container: ref(null), rowHeight: HEIGHT})
        expect(() => detached.scrollToIndex(3, {align: 'start'})).not.toThrow()
        expect(detached.viewport.value).toBe(640)
    })
})
