/**
 * 旧正文页的 ShadowHtml（P4 回归）。
 *
 * 管理端「全部邮件」点开一封就走到这里。原来它把邮件 HTML 原样写进 `shadowRoot.innerHTML`
 * —— Shadow DOM 只隔离样式、不隔离行为，`<img onerror>` 在站长的页面里照样执行（真浏览器里
 * 实测过）。另一处是 `<body style>` 被抠出来直接拼进 `<style>` 块，`}</style>` 就能跳出去。
 * jsdom 不加载资源，onerror 不会真的触发，所以这里断言渲染结果里没有可执行的东西。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import ShadowHtml from './index.vue'

async function render(html) {
    const wrapper = mount(ShadowHtml, {props: {html}, attachTo: document.body})
    await nextTick()
    const root = wrapper.get('.content-html').element.shadowRoot
    return {wrapper, root}
}

const executable = (root) => [...root.querySelectorAll('*')].flatMap((el) => [
    ...(['script', 'iframe', 'object', 'embed', 'input'].includes(el.localName) ? [el.localName] : []),
    ...[...el.attributes].filter((a) => a.name.startsWith('on')).map((a) => `${el.localName}[${a.name}]`),
])

describe('ShadowHtml · 正文净化', () => {

    it('内联事件处理器、script、iframe、input[type=image] 全部不进 shadow root', async () => {
        const {wrapper, root} = await render([
            '<p>正文</p>',
            '<img src="https://cdn.example/a.png" onerror="alert(1)">',
            '<im<img>g src=x onerror="alert(2)">',
            '<details open ontoggle="alert(3)"><summary>s</summary></details>',
            '<input type="image" src="x" onerror="alert(4)">',
            '<script>alert(5)</script><iframe src="https://evil.example"></iframe>',
            '<svg><image href="x" onerror="alert(6)"></image></svg>',
        ].join(''))

        expect(executable(root)).toEqual([])
        expect(root.textContent).toContain('正文')
        // 没有「显示图片」按钮的旧页面：合法的远程图片照常显示，只是事件处理器被删了
        expect([...root.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toContain('https://cdn.example/a.png')
        wrapper.unmount()
    })

    it('<body style> 里的 `}</style>` 跳不出样式表', async () => {
        const {wrapper, root} = await render(
            '<body style="color:red}</style><img src=x onerror=alert(1)><style>">' +
            '<p>正文</p></body>',
        )
        expect(executable(root)).toEqual([])
        // 组件自己的样式块排在最前；注入点之后的那条规则还在块里 = 没被 `}</style>` 截断。
        // （邮件正文自带的 <style> 是允许的，由 sanitizeEmailHtml 做 CSS 清洗，所以不数个数）
        const own = root.querySelector('style').textContent
        expect(own).toContain('img:not(table img)')
        expect(own).toContain('color:red')
        // `.shadow-content { … }` 块体里是注入的 body style，不能含 `{}<>`
        const start = own.indexOf('{', own.indexOf('.shadow-content')) + 1
        const block = own.slice(start, own.indexOf('}', start))
        expect(block).toContain('color:red')
        expect(block).not.toMatch(/[<>{]/)
        wrapper.unmount()
    })

    it('<body style> 里的 position:fixed / @import 被清掉，普通声明保留', async () => {
        const {wrapper, root} = await render('<body style="background:#fff;position:fixed;@import x;color:#333"><p>x</p></body>')
        const css = root.querySelector('style').textContent
        expect(css).toContain('background:#fff')
        expect(css).toContain('color:#333')
        expect(css).not.toMatch(/position\s*:\s*fixed/)
        expect(css).not.toContain('@import')
        wrapper.unmount()
    })
})
