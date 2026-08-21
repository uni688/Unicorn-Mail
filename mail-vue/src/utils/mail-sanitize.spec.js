/**
 * mail-sanitize 单测。
 *
 * 这一层是安全边界，所以测试写的是**攻击面**而不是快乐路径：内联事件处理器、
 * javascript: 链接、iframe/object、CSS 里的远程 url()、position:fixed 盖屏、
 * 以及「点了显示图片之后才放行远程图」。
 *
 * 附录 C 的两处后端问题按约定在 UI 全部完成后再动，这里是新写的前端代码，不受那条冻结影响。
 */
import {describe, it, expect} from 'vitest'
import {sanitizeEmailHtml} from '@/utils/mail-sanitize.js'

const clean = (html, options) => sanitizeEmailHtml(html, options).html

describe('sanitizeEmailHtml · 脚本面', () => {

    it('删掉 script / iframe / object / embed / link / form 及其内容', () => {
        const out = clean(`
            <p>正文</p>
            <script>alert(1)</script>
            <iframe src="https://evil.example"></iframe>
            <object data="x.swf"></object>
            <embed src="x">
            <link rel="stylesheet" href="https://evil.example/a.css">
            <form action="https://evil.example"><input name="a"></form>
        `)
        expect(out).toContain('<p>正文</p>')
        for (const tag of ['script', 'iframe', 'object', 'embed', 'link', 'form', 'input']) {
            expect(out).not.toContain(`<${tag}`)
        }
        expect(out).not.toContain('alert(1)')
    })

    it('内联事件处理器一个都不留（innerHTML 塞进去照样会触发）', () => {
        const out = clean('<img src="https://a/x.png" onerror="alert(1)"><div onclick="x()">a</div>')
        expect(out.toLowerCase()).not.toContain('onerror')
        expect(out.toLowerCase()).not.toContain('onclick')
    })

    it('javascript: / vbscript: 链接退化成没有 href 的锚点', () => {
        const out = clean('<a href="javascript:alert(1)">点我</a><a href="vbscript:x">或我</a>')
        expect(out).not.toContain('javascript:')
        expect(out).not.toContain('vbscript:')
        expect(out).toContain('点我')
    })

    it('正常链接强制新窗口 + noopener noreferrer', () => {
        const out = clean('<a href="https://ok.example/a">去</a>')
        expect(out).toContain('target="_blank"')
        expect(out).toContain('rel="noopener noreferrer nofollow"')
    })

    it('未知标签删掉但保留文字层级里的正文（svg 整块删）', () => {
        const out = clean('<svg onload="alert(1)"><use href="#x"/></svg><p>还在</p>')
        expect(out).not.toContain('<svg')
        expect(out).toContain('还在')
    })
})

describe('sanitizeEmailHtml · 远程资源', () => {

    it('默认屏蔽远程图片：src 挪进 data-blocked-src，并计数', () => {
        const {html, blocked} = sanitizeEmailHtml(
            '<img src="https://track.example/p.gif"><img src="http://a.example/b.png">'
        )
        expect(blocked).toBe(2)
        expect(html).toContain('data-blocked-src="https://track.example/p.gif"')
        // 断言「没有 src」要按属性判定：`data-blocked-src="…"` 的字符串里也含 `src="…"`
        const doc = new DOMParser().parseFromString(html, 'text/html')
        for (const img of doc.querySelectorAll('img')) {
            expect(img.hasAttribute('src')).toBe(false)
        }
    })

    it('allowRemote 之后原样放行，blocked 归零', () => {
        const {html, blocked} = sanitizeEmailHtml(
            '<img src="https://track.example/p.gif">', {allowRemote: true}
        )
        expect(blocked).toBe(0)
        expect(html).toContain('src="https://track.example/p.gif"')
    })

    it('内嵌 data:image 与 cid: 不算远程，直接保留', () => {
        const src = 'data:image/png;base64,iVBORw0KGgo='
        const {html, blocked} = sanitizeEmailHtml(`<img src="${src}"><img src="cid:part1">`)
        expect(blocked).toBe(0)
        expect(html).toContain(src)
        expect(html).toContain('cid:part1')
    })

    it('协议不认识的图片整个删掉', () => {
        expect(clean('<img src="javascript:alert(1)">')).not.toContain('<img')
        expect(clean('<img src="file:///etc/passwd">')).not.toContain('<img')
    })

    it('CSS 里的远程 url() 也要拦（背景图一样会暴露 IP 与已读）', () => {
        const {html, blocked} = sanitizeEmailHtml(
            '<style>.a{background:url(https://track.example/bg.png)}</style>'
            + '<div style="background-image:url(\'https://track.example/x.png\')">a</div>'
        )
        expect(blocked).toBe(2)
        expect(html).not.toContain('track.example')
        expect(html).toContain('about:blank')
    })

    it('@import 一律删（远程请求 + 带进未清洗的规则）', () => {
        const out = clean('<style>@import url("https://evil.example/a.css");.a{color:red}</style>')
        expect(out).not.toContain('@import')
        expect(out).toContain('color:red')
    })
})

describe('sanitizeEmailHtml · 版式与杂项', () => {

    it('position: fixed / sticky 删掉（shadow 边界挡不住盖屏）', () => {
        const out = clean('<div style="position:fixed;top:0;left:0;width:100vw">盖屏</div>'
            + '<style>.b{position:sticky;top:0}</style>')
        expect(out).not.toContain('fixed')
        expect(out).not.toContain('sticky')
        expect(out).toContain('盖屏')
    })

    it('expression() 与 -moz-binding 拆掉', () => {
        const out = clean('<style>.a{width:expression(alert(1));-moz-binding:url(x.xml)}</style>')
        expect(out).not.toContain('expression(')
        expect(out).not.toContain('-moz-binding')
    })

    it('表格与排版属性保留（邮件模板全靠它们）', () => {
        const out = clean(
            '<table width="600" cellpadding="0" bgcolor="#fff"><tr><td colspan="2" align="center">'
            + '<font color="#333" size="2">文字</font></td></tr></table>'
        )
        expect(out).toContain('width="600"')
        expect(out).toContain('cellpadding="0"')
        expect(out).toContain('colspan="2"')
        expect(out).toContain('color="#333"')
    })

    it('未知属性（data-*、srcset、formaction）不进白名单', () => {
        const out = clean('<img src="cid:a" srcset="https://a/x 2x" data-x="1">')
        expect(out).not.toContain('srcset')
        expect(out).not.toContain('data-x')
    })

    it('空输入与非字符串不抛错', () => {
        expect(sanitizeEmailHtml('')).toEqual({html: '', blocked: 0})
        expect(sanitizeEmailHtml(null)).toEqual({html: '', blocked: 0})
        expect(sanitizeEmailHtml(undefined).html).toBe('')
    })

    it('纯文本原样保留（很多邮件其实没有 HTML）', () => {
        expect(clean('你好，这是一封纯文本邮件')).toBe('你好，这是一封纯文本邮件')
    })

    it('trustedOrigins 里的来源不算远程（本站 R2 的内嵌图不该先显示空框）', () => {
        const opts = {trustedOrigins: ['cdn.uni.dev']}
        const own = sanitizeEmailHtml('<img src="https://cdn.uni.dev/mail/1.png">', opts)
        expect(own.blocked).toBe(0)
        expect(own.html).toContain('src="https://cdn.uni.dev/mail/1.png"')

        const other = sanitizeEmailHtml('<img src="https://track.example/p.gif">', opts)
        expect(other.blocked).toBe(1)
    })

    it('可信来源只按「域名 + 斜杠」前缀匹配，冒充域名不放行', () => {
        const {blocked} = sanitizeEmailHtml(
            '<img src="https://cdn.uni.dev.evil.net/p.gif">',
            {trustedOrigins: ['https://cdn.uni.dev']},
        )
        expect(blocked).toBe(1)
    })
})
