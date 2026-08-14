/**
 * jsdom 补丁（P1 组件测试用）
 *
 * reka 的浮层组件（Select / Combobox / Popover / Dialog / Tooltip …）依赖几个
 * jsdom 至今没实现的浏览器 API。缺了它们不是「测试写得不对」，而是打开面板的那一刻
 * 直接抛 TypeError，任何交互都测不下去。这里统一补齐，只补不改语义：
 *
 * - Pointer Capture：reka 的 SelectTrigger 用它区分「按住拖选」和「点一下打开」
 * - scrollIntoView：高亮项跟随键盘移动时会调用
 * - ResizeObserver：Popper 用来跟踪触发器尺寸变化
 * - DOMRect：jsdom 里所有元素的矩形都是 0，Popper 至少要能拿到一个对象
 *
 * 注意：这些补丁只让代码跑得下去，不提供真实的布局数值。所以定位相关的断言
 * （面板贴哪边、有没有翻转）不能在 jsdom 里测，那属于人工/视觉回归的范围。
 *
 * setupFiles 对所有测试文件都生效，包括用 `@vitest-environment node` 单独退回
 * node 的那几个静态断言文件——那里根本没有 Element，所以先探一下再补。
 */

if (typeof Element !== 'undefined') {
    if (!Element.prototype.hasPointerCapture) {
        Element.prototype.hasPointerCapture = () => false
        Element.prototype.setPointerCapture = () => {}
        Element.prototype.releasePointerCapture = () => {}
    }

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {}
    }
}

if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}

if (!globalThis.DOMRect) {
    globalThis.DOMRect = class DOMRect {
        constructor(x = 0, y = 0, width = 0, height = 0) {
            Object.assign(this, {
                x, y, width, height,
                top: y, left: x, right: x + width, bottom: y + height,
            })
        }

        static fromRect(rect = {}) {
            return new DOMRect(rect.x, rect.y, rect.width, rect.height)
        }

        toJSON() {
            return {...this}
        }
    }
}
