/**
 * useSelection — 列表多选（§7.4「选中态与路由无关，用组件内的 `Set<id>`，切换筛选 / 邮箱时清空
 * 并给出提示；表头 Checkbox 三态；全选只作用于已加载项，要全选 N 封需要二次确认」）。
 *
 * 旧实现把 `checked` 塞进每封邮件对象里（`email-scroll:49`），于是：
 *   - `watch(() => emailList.map(i => i.checked), …, {deep:true})` 每次勾选都要遍历全表；
 *   - 邮件对象被列表、阅读窗格、星标列表共享，`checked` 会跟着串台；
 *   - 翻页拿回来的新对象没有 `checked`，得在 map 里补。
 * 这里改成一个独立的 Set，邮件对象保持只读，行组件只问 `isSelected(id)`。
 */
import {computed, reactive} from 'vue'

export function useSelection(items, options = {}) {

    const {idKey = 'emailId'} = options

    const selected = reactive(new Set())
    /** Shift 连选的锚点 */
    let anchorId = null

    const list = () => (typeof items === 'function' ? items() : items?.value ?? items) ?? []
    const idsOf = () => list().map(item => item?.[idKey]).filter(id => id !== undefined && id !== null)

    const ids = computed(() => [...selected])
    const count = computed(() => selected.size)
    const loadedCount = computed(() => idsOf().length)

    const isSelected = id => selected.has(id)

    /** 表头 Checkbox 三态：none / some / all（all 只针对已加载项） */
    const headerState = computed(() => {
        if (selected.size === 0) return 'none'
        const total = loadedCount.value
        return total > 0 && selected.size >= total ? 'all' : 'some'
    })

    function select(id) {
        if (id === undefined || id === null) return
        selected.add(id)
        anchorId = id
    }

    function deselect(id) {
        selected.delete(id)
        if (anchorId === id) anchorId = null
    }

    function toggle(id) {
        if (selected.has(id)) deselect(id)
        else select(id)
    }

    /**
     * Shift 连选：从锚点到 id 之间（按当前列表顺序）全部选中。没有锚点时退化成单选。
     */
    function selectRange(id) {

        const all = idsOf()
        const to = all.indexOf(id)

        if (to === -1) return

        const from = anchorId === null ? -1 : all.indexOf(anchorId)

        if (from === -1) {
            select(id)
            return
        }

        const [lo, hi] = from <= to ? [from, to] : [to, from]
        for (let i = lo; i <= hi; i++) selected.add(all[i])
        // 锚点保持不动，方便反复调整范围
    }

    /** 全选已加载项 */
    function selectAllLoaded() {
        idsOf().forEach(id => selected.add(id))
    }

    /** 表头 Checkbox：有选中就清空，没选中就全选已加载项 */
    function toggleAll() {
        if (selected.size > 0) clear()
        else selectAllLoaded()
    }

    /** 返回被清掉的数量，调用方据此决定要不要提示「已取消选择 N 项」 */
    function clear() {
        const n = selected.size
        selected.clear()
        anchorId = null
        return n
    }

    /** 删除等操作后把已消失的 id 从选中集合里摘掉 */
    function prune() {
        const all = new Set(idsOf())
        for (const id of [...selected]) {
            if (!all.has(id)) selected.delete(id)
        }
    }

    return {
        selected, ids, count, loadedCount, headerState,
        isSelected, select, deselect, toggle, selectRange, selectAllLoaded, toggleAll, clear, prune,
    }
}
