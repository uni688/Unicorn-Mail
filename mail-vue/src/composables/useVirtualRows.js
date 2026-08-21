/**
 * useVirtualRows — 变高虚拟滚动（§7.4 邮件列表 / §10.5 MailboxPicker 共用）。
 *
 * 为什么自己写而不是继续用 `UseVirtualList`（`email-scroll:31`）或 reka 的
 * `ListboxVirtualizer`：
 *   1. 列表里有三种高度（44/56/72 的邮件行、28 的日期分组头、哨兵行），`UseVirtualList`
 *      的 itemHeight 一变就得靠 `keyCount++` 整表重挂（旧实现 :412-415 的注释就是这个坑）。
 *   2. `@tanstack/vue-virtual` 只是 reka-ui 的传递依赖，没有提到顶层 node_modules，
 *      业务代码直接 import 属于依赖越界；reka 自己的 `ComboboxVirtualizer` 照常能用。
 *   3. 这里要的东西很少：前缀和 + 二分 + 一个窗口，加起来不到 100 行。
 *
 * 用法：
 * ```js
 * const scroller = ref(null)
 * const {visible, totalHeight, atBottom, scrollToIndex} = useVirtualRows(rows, {
 *     container: scroller,
 *     rowHeight: row => (row.kind === 'group' ? 28 : density.value),
 * })
 * ```
 * 模板里 `container` 是唯一的滚动容器，内部放一个 `height: totalHeight` 的占位层，
 * 每个可见行 `position:absolute; transform: translateY(offset)`。
 */
import {computed, ref, toValue} from 'vue'
import {useElementSize, useScroll} from '@vueuse/core'

/** 容器还没量出高度时的兜底视口，只影响首帧渲染多少行 */
const FALLBACK_VIEWPORT = 640

export function useVirtualRows(rows, options = {}) {

    const {
        container = ref(null),
        rowHeight = () => 44,
        overscan = 6,
        /** 距底多少像素算「到底了」，旧实现用 1200（`email-scroll:388`） */
        bottomThreshold = 1200,
    } = options

    const heightOf = (row, index) => {
        const h = typeof rowHeight === 'function' ? rowHeight(row, index) : rowHeight
        return Number(h) > 0 ? Number(h) : 0
    }

    /** 前缀和：offsets[i] = 第 i 行的顶边，offsets[n] = 总高 */
    const offsets = computed(() => {
        const list = toValue(rows) ?? []
        const out = new Array(list.length + 1)
        out[0] = 0
        for (let i = 0; i < list.length; i++) {
            out[i + 1] = out[i] + heightOf(list[i], i)
        }
        return out
    })

    const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0)

    const {y} = useScroll(container)
    const {height: measuredHeight} = useElementSize(container)

    const viewport = computed(() => measuredHeight.value || container.value?.clientHeight || FALLBACK_VIEWPORT)

    /** 二分：返回包含 px 的行号 */
    function indexAt(px) {
        const off = offsets.value
        let lo = 0
        let hi = off.length - 2

        if (hi < 0) return 0

        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (off[mid] <= px) lo = mid
            else hi = mid - 1
        }
        return lo
    }

    const range = computed(() => {
        const list = toValue(rows) ?? []

        if (!list.length) return {start: 0, end: 0}

        const top = Math.max(0, y.value)
        const start = Math.max(0, indexAt(top) - overscan)
        const end = Math.min(list.length, indexAt(top + viewport.value) + 1 + overscan)
        return {start, end}
    })

    /** 当前需要挂在 DOM 里的行 */
    const visible = computed(() => {
        const list = toValue(rows) ?? []
        const off = offsets.value
        const {start, end} = range.value
        const out = []

        for (let i = start; i < end; i++) {
            out.push({
                index: i,
                row: list[i],
                offset: off[i],
                height: off[i + 1] - off[i],
                key: list[i]?.key ?? i,
            })
        }
        return out
    })

    /** 触底：驱动翻页（旧实现是 `useScroll` 的 arrivedState.bottom + offset 1200） */
    const atBottom = computed(() => {
        if (!totalHeight.value) return false
        return totalHeight.value - (y.value + viewport.value) <= bottomThreshold
    })

    function scrollToOffset(px, behavior = 'auto') {
        const el = container.value
        if (!el) return
        el.scrollTo({top: Math.max(0, px), behavior})
    }

    /**
     * 把某一行滚进视口。align:
     *   'auto'  只在行不完整可见时滚（键盘导航用）
     *   'start' 行顶对齐视口顶（跳转到某封邮件用）
     */
    function scrollToIndex(index, {align = 'auto', behavior = 'auto'} = {}) {
        const off = offsets.value
        const i = Math.max(0, Math.min(index, off.length - 2))

        if (i < 0 || off.length < 2) return

        const top = off[i]
        const bottom = off[i + 1]

        if (align === 'start') return scrollToOffset(top, behavior)

        if (top < y.value) return scrollToOffset(top, behavior)
        if (bottom > y.value + viewport.value) return scrollToOffset(bottom - viewport.value, behavior)
    }

    return {container, visible, range, offsets, totalHeight, viewport, scrollTop: y, atBottom, scrollToIndex, scrollToOffset, indexAt}
}
