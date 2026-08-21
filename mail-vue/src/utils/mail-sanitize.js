/**
 * 邮件正文的净化（§7.6「阅读窗格：Shadow DOM 隔离 + 默认屏蔽远程图片 + 不做暗色反转」）
 *
 * 为什么不能直接 `shadowRoot.innerHTML = email.content`（旧 `shadow-html/index.vue:37` 就是
 * 这么做的）：Shadow DOM 只隔离**样式**，不隔离行为与网络。
 *   - `<img src=x onerror=…>` 里的内联事件处理器照样执行 → 存储型 XSS，正文来自任何陌生人；
 *   - `<iframe>` / `<object>` / CSS 的 `url()` 会真的发请求 → 打开邮件即暴露 IP 与「已读」；
 *   - `position: fixed` 的元素能盖住整个视口 —— 它在 shadow 里，但定位是相对视口的。
 *
 * 所以这里做一件事：把 HTML 解析成**惰性文档**（`DOMParser` 出来的文档没有浏览上下文，
 * 图片不会加载、脚本不会执行），按白名单删标签、删属性、改 URL，再序列化回字符串。
 * 白名单而不是黑名单：邮件 HTML 的花样是无穷的，只放行认识的那些才是可推理的。
 *
 * 返回 `{html, blocked}`：`blocked` 是被拦下的远程资源数，阅读窗格据此显示
 * 「已屏蔽 N 张图片 · 显示图片」的横幅（§7.6）。
 */

/** 结构、文字、表格、列表、图片；`style` 单独处理（保留但清洗） */
const ALLOWED_TAGS = new Set([
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'b', 'bdi', 'bdo', 'big', 'blockquote',
    'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn',
    'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map',
    'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small',
    'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
    'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr', 'style',
])

/** 每个标签都允许的属性（`on*` 一律不在内） */
const GLOBAL_ATTRS = new Set(['class', 'id', 'dir', 'lang', 'title', 'style', 'align', 'valign'])

/** 按标签追加的属性 */
const TAG_ATTRS = {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'border'],
    table: ['width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor'],
    td: ['width', 'height', 'colspan', 'rowspan', 'bgcolor', 'nowrap'],
    th: ['width', 'height', 'colspan', 'rowspan', 'bgcolor', 'nowrap'],
    tr: ['height', 'bgcolor'],
    col: ['width', 'span'],
    colgroup: ['width', 'span'],
    font: ['color', 'face', 'size'],
    ol: ['start', 'type'],
    li: ['value'],
    time: ['datetime'],
}

/** 链接协议白名单。`javascript:` / `vbscript:` / `file:` 不在内 */
const SAFE_LINK = /^(https?:|mailto:|tel:|cid:|#|\/|\.\/|\.\.\/)/i
/** 图片额外允许内嵌 data:image（邮件里的内嵌图常这么塞） */
const SAFE_IMG = /^(https?:|cid:|data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,)/i
/** 远程 = 会向外发请求，需要用户点「显示图片」才放行 */
const REMOTE = /^https?:/i

/**
 * @param {string} html 邮件原始 HTML
 * @param {{allowRemote?: boolean, trustedOrigins?: string[]}} options
 *   `allowRemote` 为真时放行远程图片与 CSS 里的 url()；
 *   `trustedOrigins` 是「不算远程」的来源（本站 R2 域名 —— 邮件里的内嵌图片就存在那儿，
 *   把自家域名也屏蔽掉会让每封带图的邮件都先显示一个空框）。
 * @returns {{html: string, blocked: number}}
 */
export function sanitizeEmailHtml(html, {allowRemote = false, trustedOrigins = []} = {}) {

    if (!html) return {html: '', blocked: 0}

    const trusted = normalizeOrigins(trustedOrigins)
    const isRemote = (url) => REMOTE.test(url) && !trusted.some(origin => url.toLowerCase().startsWith(origin))

    const doc = new DOMParser().parseFromString(String(html), 'text/html')
    let blocked = 0

    // 解析器会把正文最前面的 `<style>` 放进 `<head>`（HTML 的插入模式规则），而我们只序列化
    // body —— 不搬过来的话邮件的样式会整块消失。head 里的 link / meta / base 不搬，等于删掉。
    for (const style of [...doc.head.querySelectorAll('style')]) {
        doc.body.insertBefore(style, doc.body.firstChild)
    }

    // 倒着遍历快照：清洗过程会删节点，正着遍历实时集合会漏
    for (const el of [...doc.body.querySelectorAll('*')].reverse()) {
        const tag = el.tagName.toLowerCase()

        if (!ALLOWED_TAGS.has(tag)) {
            // 结构性标签（div 之类）不在白名单里的情况不存在，所以这里直接连内容一起删：
            // script / iframe 的「内容」本身就是不该出现的东西
            el.remove()
            continue
        }

        if (tag === 'style') {
            const cleaned = cleanCss(el.textContent ?? '', allowRemote, false, isRemote)
            blocked += cleaned.blocked
            el.textContent = cleaned.css
            continue
        }

        blocked += cleanAttrs(el, tag, allowRemote, isRemote)
    }

    return {html: doc.body.innerHTML, blocked}
}

/** 删属性 + 改 URL，返回本元素上被拦下的远程资源数 */
function cleanAttrs(el, tag, allowRemote, isRemote) {

    const allowed = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[tag] ?? [])])
    let blocked = 0

    for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase()

        // `on*` 是内联事件处理器，innerHTML 塞进去之后照样会触发
        if (name.startsWith('on') || !allowed.has(name)) {
            el.removeAttribute(attr.name)
            continue
        }

        if (name === 'style') {
            const cleaned = cleanCss(attr.value, allowRemote, true, isRemote)
            blocked += cleaned.blocked
            if (cleaned.css) el.setAttribute('style', cleaned.css)
            else el.removeAttribute('style')
        }
    }

    if (tag === 'a') cleanLink(el)
    if (tag === 'img') blocked += cleanImage(el, allowRemote, isRemote)

    return blocked
}

/** 链接：协议不认识就退化成纯文本锚点；认识的一律新窗口打开且不带 referrer */
function cleanLink(el) {
    const href = (el.getAttribute('href') ?? '').trim()

    if (href && !SAFE_LINK.test(href)) {
        el.removeAttribute('href')
        return
    }

    if (!href) return

    el.setAttribute('target', '_blank')
    // noopener 防 window.opener 反向控制；nofollow 是给外链的礼节
    el.setAttribute('rel', 'noopener noreferrer nofollow')
}

/**
 * 图片：协议不认识就整个删掉；远程图在未放行时把 src 挪到 `data-blocked-src`。
 * 挪而不是删 —— 用户点「显示图片」时要能原地恢复，不必重新净化一遍。
 */
function cleanImage(el, allowRemote, isRemote) {
    const src = (el.getAttribute('src') ?? '').trim()

    if (!src || !SAFE_IMG.test(src)) {
        el.remove()
        return 0
    }

    if (allowRemote || !isRemote(src)) return 0

    el.removeAttribute('src')
    el.setAttribute('data-blocked-src', src)
    return 1
}

/**
 * CSS 清洗（`<style>` 块与 `style` 属性共用）：
 *   - `@import` 一律删：它是远程请求，而且能带进整套没清洗过的规则；
 *   - `url(...)` 在未放行远程时替换成 `about:blank`（背景图同样会暴露 IP 与「已读」）；
 *   - `position: fixed|sticky` 删掉 —— 定位是相对视口的，shadow 边界挡不住它盖住整个界面；
 *   - `-moz-binding` / `expression(` 这些老式脚本注入面一并删。
 *
 * 只做字符串级处理：这里的目标不是理解 CSS，而是把「会发请求」和「会跑代码」的写法拿掉。
 */
function cleanCss(css, allowRemote, isInline = false, isRemote = REMOTE.test.bind(REMOTE)) {

    let blocked = 0
    let out = String(css ?? '')

    out = out.replace(/@import[^;]*;?/gi, '')
    out = out.replace(/expression\s*\(/gi, 'void(')
    out = out.replace(/-moz-binding\s*:[^;]*;?/gi, '')
    out = out.replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, '')

    if (!allowRemote) {
        out = out.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (whole, _quote, url) => {
            if (!isRemote(url.trim())) return whole
            blocked++
            return 'url(about:blank)'
        })
    }

    // 内联 style 里换行没有意义，压掉免得序列化出来的属性值奇形怪状
    return {css: isInline ? out.replace(/\s+/g, ' ').trim() : out, blocked}
}

/**
 * 可信来源规范化。补协议、补末尾斜杠 —— 少了斜杠时 `https://cdn.a.com` 会把
 * `https://cdn.a.com.evil.net/x.png` 也当成自家域名放行。
 */
function normalizeOrigins(origins) {
    return (Array.isArray(origins) ? origins : [origins])
        .map(value => String(value ?? '').trim().toLowerCase())
        .filter(Boolean)
        .map(value => (value.startsWith('http') ? value : `https://${value}`))
        .map(value => (value.endsWith('/') ? value : `${value}/`))
}
