import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import CopyButton from './CopyButton.vue'

/**
 * 这个原语的价值全在「失败不能静默」和「换图标要同时播报」两件事上，
 * 所以三条路径都要测到：clipboard 成功 / clipboard 抛错后 execCommand 兜底 / 两条都失败。
 *
 * jsdom 没有 navigator.clipboard，也没有 document.execCommand，两个都得自己塞。
 */

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

/** 装好剪贴板环境；writeText 为 null 表示「这个 API 不存在」 */
function stubClipboard({writeText}) {
    if (writeText === null) {
        Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true, writable: true})
    } else {
        Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true, writable: true})
    }
}

let execCommand

beforeEach(() => {
    execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete document.execCommand
})

const render = (props = {}) => mount(CopyButton, {props: {value: 'ada@unicorn.mail', ...props}})
const live = (wrapper) => wrapper.get('[role="status"]')

describe('CopyButton · 复制路径', () => {
    it('优先走 navigator.clipboard，并把原文写进去', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        stubClipboard({writeText})

        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await flushAsync()

        expect(writeText).toHaveBeenCalledWith('ada@unicorn.mail')
        expect(execCommand).not.toHaveBeenCalled()
        expect(wrapper.emitted('copy')[0]).toEqual([true])
    })

    it('clipboard 抛错（非安全上下文/权限被拒）时退回 execCommand', async () => {
        stubClipboard({writeText: vi.fn().mockRejectedValue(new Error('denied'))})

        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await flushAsync()

        expect(execCommand).toHaveBeenCalledWith('copy')
        expect(wrapper.emitted('copy')[0]).toEqual([true])
    })

    it('压根没有 clipboard API 也能用 execCommand', async () => {
        stubClipboard({writeText: null})

        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await flushAsync()

        expect(execCommand).toHaveBeenCalledWith('copy')
        expect(wrapper.emitted('copy')[0]).toEqual([true])
    })

    it('兜底用的 textarea 用完就撤，不留在 DOM 里', async () => {
        stubClipboard({writeText: null})

        await render().get('button').trigger('click')
        await flushAsync()

        expect(document.querySelectorAll('textarea')).toHaveLength(0)
    })

    it('两条路都失败时报错态并 emit false，不静默', async () => {
        stubClipboard({writeText: vi.fn().mockRejectedValue(new Error('denied'))})
        execCommand.mockReturnValue(false)

        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await flushAsync()
        await nextTick()

        expect(wrapper.emitted('copy')[0]).toEqual([false])
        expect(live(wrapper).text()).toBe('复制失败')
    })

    it('execCommand 直接抛异常也算失败，不冒泡出去', async () => {
        stubClipboard({writeText: null})
        execCommand.mockImplementation(() => {
            throw new Error('boom')
        })

        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await flushAsync()

        expect(wrapper.emitted('copy')[0]).toEqual([false])
    })

    it('value 为空也照常复制空串，不抛错', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        stubClipboard({writeText})

        await render({value: ''}).get('button').trigger('click')
        await flushAsync()

        expect(writeText).toHaveBeenCalledWith('')
    })
})

describe('CopyButton · 反馈与 a11y', () => {
    beforeEach(() => {
        stubClipboard({writeText: vi.fn().mockResolvedValue(undefined)})
    })

    it('成功后播报「已复制」，1.6s 后自动归位', async () => {
        vi.useFakeTimers()
        const wrapper = render()

        await wrapper.get('button').trigger('click')
        await vi.advanceTimersByTimeAsync(0)
        await nextTick()
        expect(live(wrapper).text()).toBe('已复制')

        await vi.advanceTimersByTimeAsync(1600)
        await nextTick()
        expect(live(wrapper).text()).toBe('')
    })

    it('播报区是 sr-only 的 polite status —— 图标切换本身对读屏是静默的', () => {
        const el = live(render())
        expect(el.classes()).toContain('sr-only')
        expect(el.attributes('aria-live')).toBe('polite')
    })

    it('idle 播报区留空，避免读屏一进页面就念一句', () => {
        expect(live(render()).text()).toBe('')
    })

    it('无障碍名称随状态走：copy → copied', async () => {
        const wrapper = render()
        expect(wrapper.get('button').attributes('aria-label')).toBe('复制')

        await wrapper.get('button').trigger('click')
        await flushAsync()
        await nextTick()
        expect(wrapper.get('button').attributes('aria-label')).toBe('已复制')
    })

    it('label 覆盖后不再跟着状态变（调用方自己说了算）', async () => {
        const wrapper = render({label: '复制邮箱地址'})
        await wrapper.get('button').trigger('click')
        await flushAsync()
        await nextTick()
        expect(wrapper.get('button').attributes('aria-label')).toBe('复制邮箱地址')
    })

    it('连点两次不会被前一次的定时器提前清成 idle', async () => {
        vi.useFakeTimers()
        const wrapper = render()

        await wrapper.get('button').trigger('click')
        await vi.advanceTimersByTimeAsync(1000)
        await wrapper.get('button').trigger('click')
        await vi.advanceTimersByTimeAsync(1000)
        await nextTick()
        // 第一次的 1.6s 已过，但第二次重置了计时，此刻仍应是「已复制」
        expect(live(wrapper).text()).toBe('已复制')
    })

    it('showText 才出文字，默认只有图标', async () => {
        expect(render().text()).toBe('')
        expect(render({showText: true}).text()).toContain('复制')
    })

    it('图标对读屏隐藏', () => {
        expect(render().get('svg').attributes('aria-hidden')).toBe('true')
    })

    it('卸载时清掉定时器，不会在组件没了之后再改状态', async () => {
        vi.useFakeTimers()
        const wrapper = render()
        await wrapper.get('button').trigger('click')
        await vi.advanceTimersByTimeAsync(0)

        wrapper.unmount()
        // 没有 unmount 后的 setState，这一步不应抛任何 Vue 警告
        expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    })
})
