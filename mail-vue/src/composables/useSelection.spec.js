/**
 * useSelection 单测（§7.4 选中模型）。
 *
 * 重点测三件旧实现做不到的事：Set 与邮件对象解耦、Shift 连选的锚点行为、
 * 以及删除后 `prune()` 摘掉已消失的 id。表头三态只针对**已加载项**，这条也在这里钉住。
 */
import {describe, it, expect} from 'vitest'
import {ref} from 'vue'
import {useSelection} from '@/composables/useSelection.js'

const mails = n => Array.from({length: n}, (_, i) => ({emailId: i + 1}))

describe('useSelection · 基本选中', () => {

    it('toggle 反复切换，count 跟着变', () => {
        const s = useSelection(ref(mails(3)))
        s.toggle(1)
        expect(s.isSelected(1)).toBe(true)
        expect(s.count.value).toBe(1)
        s.toggle(1)
        expect(s.isSelected(1)).toBe(false)
        expect(s.count.value).toBe(0)
    })

    it('不写任何字段到邮件对象上（旧实现把 checked 塞进邮件里）', () => {
        const list = mails(2)
        const s = useSelection(ref(list))
        s.select(1)
        expect(Object.keys(list[0])).toEqual(['emailId'])
    })

    it('id 为 null / undefined 时不入集合', () => {
        const s = useSelection(ref(mails(2)))
        s.select(null)
        s.select(undefined)
        expect(s.count.value).toBe(0)
    })
})

describe('useSelection · Shift 连选', () => {

    it('从锚点连选到目标，锚点保持不动以便反复调整', () => {
        const s = useSelection(ref(mails(6)))
        s.select(2)
        s.selectRange(5)
        expect([...s.ids.value].sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
        s.selectRange(3)
        expect([...s.ids.value].sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
    })

    it('反方向连选（从下往上）同样成立', () => {
        const s = useSelection(ref(mails(6)))
        s.select(5)
        s.selectRange(2)
        expect([...s.ids.value].sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
    })

    it('没有锚点时退化成单选；目标不在列表里则什么都不做', () => {
        const s = useSelection(ref(mails(4)))
        s.selectRange(3)
        expect([...s.ids.value]).toEqual([3])
        s.clear()
        s.selectRange(99)
        expect(s.count.value).toBe(0)
    })

    it('取消掉锚点后再连选，退回单选（锚点随 deselect 失效）', () => {
        const s = useSelection(ref(mails(5)))
        s.select(2)
        s.deselect(2)
        s.selectRange(4)
        expect([...s.ids.value]).toEqual([4])
    })
})

describe('useSelection · 表头三态与清理', () => {

    it('none / some / all 三态；all 只针对已加载项', () => {
        const list = ref(mails(3))
        const s = useSelection(list)
        expect(s.headerState.value).toBe('none')
        s.select(1)
        expect(s.headerState.value).toBe('some')
        s.selectAllLoaded()
        expect(s.headerState.value).toBe('all')
        // 又翻回来一页：已加载项变多，全选态自动降级为部分选中
        list.value = mails(6)
        expect(s.headerState.value).toBe('some')
        expect(s.loadedCount.value).toBe(6)
    })

    it('toggleAll：有选中就清空，没选中就全选已加载项', () => {
        const s = useSelection(ref(mails(4)))
        s.toggleAll()
        expect(s.count.value).toBe(4)
        s.toggleAll()
        expect(s.count.value).toBe(0)
    })

    it('clear 返回被清掉的数量（调用方据此提示「已取消选择 N 项」）', () => {
        const s = useSelection(ref(mails(4)))
        s.selectAllLoaded()
        expect(s.clear()).toBe(4)
        expect(s.clear()).toBe(0)
    })

    it('prune 摘掉已从列表消失的 id（删除之后）', () => {
        const list = ref(mails(4))
        const s = useSelection(list)
        s.selectAllLoaded()
        list.value = list.value.filter(m => m.emailId > 2)
        s.prune()
        expect([...s.ids.value].sort((a, b) => a - b)).toEqual([3, 4])
    })

    it('items 传函数或裸数组都能用', () => {
        const arr = mails(2)
        expect(useSelection(() => arr).loadedCount.value).toBe(2)
        expect(useSelection(arr).loadedCount.value).toBe(2)
        expect(useSelection(undefined).loadedCount.value).toBe(0)
    })
})
