import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import VisuallyHidden from './VisuallyHidden.vue'

/**
 * 这个组件存在的唯一理由是「聚焦后能恢复可见」——不然一个 `sr-only` 类就够了。
 * 所以测的重点是它没有把内容从无障碍树里摘掉（不是 display:none / aria-hidden），
 * 以及 feature 能切到永久隐藏。
 *
 * 隐藏是靠 base.css 里的 .um-visually-hidden 做的，jsdom 不加载 CSS，所以样式本身
 * 单独用一组静态断言盯着（见文件末尾），组件这边只验类名和 ARIA。
 */

const render = (props = {}, options = {}) => mount(VisuallyHidden, {props, ...options})

describe('VisuallyHidden', () => {
    it('内容还在 DOM 和无障碍树里，只是看不见', () => {
        const wrapper = render({}, {slots: {default: '跳到主内容'}})
        expect(wrapper.text()).toBe('跳到主内容')
        expect(wrapper.attributes('aria-hidden')).toBeUndefined()
        expect(wrapper.classes()).toContain('um-visually-hidden')
    })

    it('默认 focusable：带上聚焦恢复的钩子类，且不脱离 Tab 序列', () => {
        const wrapper = render({}, {slots: {default: 'x'}})
        expect(wrapper.classes()).toContain('um-visually-hidden-focusable')
        expect(wrapper.attributes('tabindex')).toBeUndefined()
        expect(wrapper.attributes('data-hidden')).toBeUndefined()
    })

    it('feature 可以切成永久隐藏：读屏不念，也 Tab 不到', () => {
        const wrapper = render({feature: 'fully-hidden'}, {slots: {default: 'x'}})
        expect(wrapper.attributes('data-hidden')).toBe('')
        expect(wrapper.attributes('aria-hidden')).toBe('true')
        expect(wrapper.attributes('tabindex')).toBe('-1')
        // 永久隐藏就不该再有聚焦恢复，否则 aria-hidden 的内容会被 Tab 出来
        expect(wrapper.classes()).not.toContain('um-visually-hidden-focusable')
    })

    it('默认渲染成 span，能塞在文字中间', () => {
        expect(render({}, {slots: {default: 'x'}}).element.tagName).toBe('SPAN')
    })

    it('as 可以换标签', () => {
        expect(render({as: 'div'}, {slots: {default: 'x'}}).element.tagName).toBe('DIV')
    })

    it('asChild 把隐藏样式盖到子节点上', () => {
        const wrapper = render({asChild: true}, {slots: {default: '<a href="#main">跳到主内容</a>'}})
        expect(wrapper.element.tagName).toBe('A')
        expect(wrapper.classes()).toContain('um-visually-hidden')
    })

    it('class 追加而不是替换', () => {
        expect(render({class: 'z-50'}, {slots: {default: 'x'}}).classes()).toContain('z-50')
    })
})

describe('VisuallyHidden · 隐藏样式（静态）', () => {
    /**
     * 路径必须经过变量再进 `new URL`，两个坑各堵一个：
     * 写成字面量 `new URL('./x.css', import.meta.url)` 会被 Vite 的 asset 插件改写成
     * 资源 URL（不再是 file:，fileURLToPath 直接抛）；改走 `?raw` 导入也不行 ——
     * vitest 默认 `css: false`，CSS 一律换成空串。
     */
    const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    const css = read('../../../design/base.css')

    it('用裁剪而不是 display:none —— 后者读屏也读不到', () => {
        const rule = css.match(/\.um-visually-hidden\s*\{([^}]*)\}/)
        expect(rule).not.toBeNull()
        expect(rule[1]).toContain('position: absolute')
        expect(rule[1]).toContain('clip-path: inset(50%)')
        expect(rule[1]).not.toContain('display: none')
    })

    it('占位 1px 而不是 0，聚焦时才好恢复', () => {
        const rule = css.match(/\.um-visually-hidden\s*\{([^}]*)\}/)
        expect(rule[1]).toContain('width: 1px')
        expect(rule[1]).toContain('height: 1px')
    })

    it('focusable 变体在自身或内部节点被键盘聚焦时都恢复', () => {
        expect(css).toContain('.um-visually-hidden-focusable:focus-visible')
        expect(css).toContain('.um-visually-hidden-focusable:has(:focus-visible)')
        const rule = css.match(/\.um-visually-hidden-focusable:has\(:focus-visible\)\s*\{([^}]*)\}/)
        expect(rule[1]).toContain('position: static')
        expect(rule[1]).toContain('clip-path: none')
    })
})
