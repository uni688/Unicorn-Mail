import {describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import ScrollArea from './ScrollArea.vue'

/**
 * 这个组件故意不用 reka 的 ScrollArea（见组件头注），所以它自己那点逻辑全在
 * 「渐隐要不要挂」上——那段是手写的，也是最容易出错的：内容不溢出时不能挂、
 * 滚到中间两头都要挂、到底了尾部那段要撤掉。
 *
 * jsdom 里所有尺寸都是 0，于是 scrollHeight/clientHeight 得自己钉死。
 */

const render = (props = {}, options = {}) => mount(ScrollArea, {
    props,
    slots: {default: '<div>内容</div>'},
    ...options,
})

/** 把一个「可滚动」的几何量钉到元素上：视口 100、内容 300 */
function fakeGeometry(el, {pos = 0, size = 100, total = 300, horizontal = false} = {}) {
    const map = horizontal
        ? {scrollLeft: pos, clientWidth: size, scrollWidth: total}
        : {scrollTop: pos, clientHeight: size, scrollHeight: total}
    Object.entries(map).forEach(([key, value]) => {
        Object.defineProperty(el, key, {configurable: true, get: () => value})
    })
}

/**
 * 渐隐必须从 vnode 上读，不能读 DOM。
 *
 * jsdom 的 CSS 解析器不认 gradient 色标里的 `calc()`，遇到就把整条声明丢掉——
 * `el.style.maskImage` 读回来是空的，`style` 属性压根不写。而「尾部还没到底」的那几种
 * 情况恰好都带 `calc(100% - 24px)`，于是断言 DOM 只会看到 undefined 或上一次的残值。
 */
function maskOf(wrapper) {
    return wrapper.vm.$.subTree.props?.style?.maskImage
}

/**
 * 挂载 → 等一拍 → 钉几何量 → 派 scroll。
 * 那一拍是必须的：`useEventListener` 盯的是模板 ref，mount 当拍还没落地，
 * 此时派 scroll 没有任何监听器接。
 */
async function renderScrolled(props = {}, geometry = {}) {
    const wrapper = render({fade: true, ...props})
    await nextTick()
    fakeGeometry(wrapper.element, geometry)
    await wrapper.trigger('scroll')
    return wrapper
}

describe('ScrollArea · 容器语义', () => {
    it('默认竖向滚动，横向不给溢出', () => {
        const classes = render().classes()
        expect(classes).toContain('overflow-y-auto')
        expect(classes).toContain('overflow-x-hidden')
    })

    it('orientation 决定溢出轴', () => {
        expect(render({orientation: 'horizontal'}).classes()).toEqual(
            expect.arrayContaining(['overflow-x-auto', 'overflow-y-hidden']),
        )
        expect(render({orientation: 'both'}).classes()).toContain('overflow-auto')
    })

    it('给了没见过的 orientation 就退回竖向，而不是不给溢出', () => {
        expect(render({orientation: 'diagonal'}).classes()).toContain('overflow-y-auto')
    })

    it('带 min-h-0 / min-w-0 —— flex 子项里少了它就撑不出滚动', () => {
        expect(render().classes()).toEqual(expect.arrayContaining(['min-h-0', 'min-w-0']))
    })

    it('overscroll-contain：滚到底不把整页带着一起滚', () => {
        expect(render().classes()).toContain('overscroll-contain')
    })

    it('class 追加而不是替换', () => {
        expect(render({class: 'h-40'}).classes()).toEqual(
            expect.arrayContaining(['h-40', 'overflow-y-auto']),
        )
    })
})

describe('ScrollArea · a11y', () => {
    it('默认可聚焦：只靠滚动查看的区域必须能被键盘到达', () => {
        const wrapper = render()
        expect(wrapper.attributes('role')).toBe('region')
        expect(wrapper.attributes('tabindex')).toBe('0')
    })

    it('ariaLabel 给这个 region 起名', () => {
        expect(render({ariaLabel: '邮件列表'}).attributes('aria-label')).toBe('邮件列表')
    })

    it('里面本来就有可聚焦元素时关掉，免得多一个空的 Tab 停留点', () => {
        const wrapper = render({focusable: false})
        expect(wrapper.attributes('tabindex')).toBeUndefined()
        expect(wrapper.attributes('role')).toBeUndefined()
    })

    it('没给名字就不硬塞一个空的 aria-label', () => {
        expect(render().attributes('aria-label')).toBeUndefined()
    })
})

describe('ScrollArea · 滚动条粗细', () => {
    it('auto 用 base.css 里的全局样式，不额外加类', () => {
        const classes = render({scrollbar: 'auto'}).classes()
        expect(classes.some((c) => c.includes('scrollbar'))).toBe(false)
    })

    it('thin 把条压到 6px', () => {
        const classes = render({scrollbar: 'thin'}).classes()
        expect(classes).toContain('[&::-webkit-scrollbar]:w-1.5')
        expect(classes).toContain('[&::-webkit-scrollbar]:h-1.5')
    })

    it('hidden 两套引擎都要藏 —— 只写 webkit 的话 Firefox 还留着', () => {
        const classes = render({scrollbar: 'hidden'}).classes()
        expect(classes).toContain('[scrollbar-width:none]')
        expect(classes).toContain('[&::-webkit-scrollbar]:hidden')
    })
})

describe('ScrollArea · 边缘渐隐', () => {
    it('默认不开，不给任何 mask', () => {
        expect(maskOf(render())).toBeUndefined()
    })

    it('内容不溢出时也不挂 —— 两头都到了就没有「还有更多」可提示', async () => {
        const wrapper = await renderScrolled({}, {pos: 0, size: 100, total: 100})
        expect(maskOf(wrapper)).toBeUndefined()
    })

    it('停在顶部时只淡出底边', async () => {
        const mask = maskOf(await renderScrolled({}, {pos: 0}))
        expect(mask).toContain('to bottom')
        // 顶边保持实心，只有尾部收进去
        expect(mask).toContain('#000 0')
        expect(mask).toContain('#000 calc(100% - 24px), transparent 100%')
    })

    it('滚到中间时两头都淡出', async () => {
        const mask = maskOf(await renderScrolled({}, {pos: 100}))
        expect(mask).toContain('transparent 0, #000 24px')
        expect(mask).toContain('transparent 100%')
    })

    it('滚到底时撤掉底边那段', async () => {
        const mask = maskOf(await renderScrolled({}, {pos: 200}))
        expect(mask).toContain('transparent 0, #000 24px')
        expect(mask).toContain('#000 100%')
        expect(mask).not.toContain('transparent 100%')
    })

    it('差几个亚像素也算到底 —— 缩放和 rem 取整会差出 1px', async () => {
        // 200 + 100 = 300，差 1px 到 301
        const mask = maskOf(await renderScrolled({}, {pos: 200, size: 100, total: 301}))
        expect(mask).toContain('#000 100%')
        expect(mask).not.toContain('transparent 100%')
    })

    it('横向渐隐沿 to right 走，量的是 scrollLeft', async () => {
        const wrapper = await renderScrolled(
            {orientation: 'horizontal'},
            {pos: 100, horizontal: true},
        )
        expect(maskOf(wrapper)).toContain('to right')
    })

    it('fade 关着的时候滚动不触发任何测量', async () => {
        const wrapper = await renderScrolled({fade: false}, {pos: 100})
        expect(maskOf(wrapper)).toBeUndefined()
    })

    it('中途打开 fade 会立刻重算，不用等第一次滚动', async () => {
        const wrapper = render()
        await nextTick()
        fakeGeometry(wrapper.element, {pos: 100})
        await wrapper.setProps({fade: true})
        await nextTick()
        expect(maskOf(wrapper)).toContain('transparent 0')
    })
})

describe('ScrollArea · 暴露给宿主的接口', () => {
    it('把原生滚动容器交出去 —— 虚拟列表和 scrollIntoView 都要它', () => {
        const wrapper = render()
        expect(wrapper.vm.viewport).toBe(wrapper.element)
    })

    it('measure 可以被外部调用：内容变多后重算渐隐', async () => {
        const wrapper = render({fade: true})
        await nextTick()
        fakeGeometry(wrapper.element, {pos: 100})
        // 不派 scroll 事件，直接手动重算
        wrapper.vm.measure()
        await nextTick()
        expect(maskOf(wrapper)).toContain('transparent 0')
    })

    it('容器还没挂上时 measure 不炸', () => {
        const wrapper = render()
        wrapper.unmount()
        expect(() => wrapper.vm.measure()).not.toThrow()
    })
})
