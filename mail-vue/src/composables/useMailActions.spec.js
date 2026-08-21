/**
 * useMailActions 单测。
 *
 * 这个单例只解决一个具体问题：命令条在 AppShell 里、列表在路由视图里，两者没有父子关系。
 * 所以测的就是那两条规则：后注册覆盖先注册、卸载时只有「自己还是当前」才清空
 * （路由切换的顺序是「新视图 mount → 旧视图 unmount」，反了就会把新的清掉）。
 */
import {beforeEach, describe, it, expect, vi} from 'vitest'
import {registerMailActions, setMailSelection, useMailActions} from '@/composables/useMailActions.js'

let unregister

beforeEach(() => {
    unregister?.()
    unregister = null
    setMailSelection({count: 0})
})

describe('useMailActions', () => {

    it('没有列表注册时 available=false，run 不抛错', () => {
        const {available, run} = useMailActions()
        expect(available.value).toBe(false)
        expect(() => run('delete')).not.toThrow()
    })

    it('注册后 run 派发到对应 handler', () => {
        const del = vi.fn()
        unregister = registerMailActions({delete: del})
        const {available, run} = useMailActions()
        expect(available.value).toBe(true)
        run('delete')
        run('star')          // 没注册的动作静默跳过
        expect(del).toHaveBeenCalledTimes(1)
    })

    it('选中数量与验证码标记会同步给命令条', () => {
        unregister = registerMailActions({})
        const {count, hasCode} = useMailActions()
        setMailSelection({count: 3, hasCode: true})
        expect(count.value).toBe(3)
        expect(hasCode.value).toBe(true)
    })

    it('后注册的覆盖先注册的（同屏只可能有一个邮件列表）', () => {
        const first = vi.fn()
        const second = vi.fn()
        const offFirst = registerMailActions({delete: first})
        unregister = registerMailActions({delete: second})

        useMailActions().run('delete')
        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()

        // 旧视图后卸载：不能把新视图的注册清掉
        offFirst()
        expect(useMailActions().available.value).toBe(true)
        useMailActions().run('delete')
        expect(second).toHaveBeenCalledTimes(2)
    })

    it('当前列表卸载后归零', () => {
        unregister = registerMailActions({delete: vi.fn()})
        setMailSelection({count: 2})
        unregister()
        unregister = null

        const {available, count} = useMailActions()
        expect(available.value).toBe(false)
        expect(count.value).toBe(0)
    })
})
