/**
 * 极简 CSS 自定义属性求值器 —— 只为测试服务，不追求覆盖 CSS 全集。
 *
 * 能力边界（有意为之）：
 * - 只认 `:root` / `:root.dark` 两种选择器的声明块，其它选择器忽略
 * - 嵌在 `@media` / `@supports` 里的同名选择器也会被收进来（按文档顺序后者覆盖前者），
 *   P0 的 token 文件里这类块只改布局尺度与 glass alpha，不影响颜色断言
 * - 颜色只支持 #hex(3/6/8)、rgb()/rgba()（逗号或空格语法、`/ alpha`），
 *   遇到 color-mix()/none 等返回 null，由调用方决定跳过
 */

const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g

export function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 收集指定选择器（精确匹配）下的所有自定义属性声明，后出现的覆盖先出现的 */
export function collectVars(css, selector) {
    const out = {}
    const clean = stripComments(css)
    BLOCK_RE.lastIndex = 0
    let m
    while ((m = BLOCK_RE.exec(clean)) !== null) {
        // 前面可能粘着以 ; 结尾的语句型 at-rule（如 @custom-variant），只取最后一段当选择器
        if (m[1].split(';').pop().trim() !== selector) continue
        for (const decl of m[2].split(';')) {
            const i = decl.indexOf(':')
            if (i < 0) continue
            const name = decl.slice(0, i).trim()
            if (!name.startsWith('--')) continue
            out[name] = decl.slice(i + 1).trim()
        }
    }
    return out
}

/** 递归展开 var(--x) / var(--x, fallback)，最多 10 层，防环 */
export function resolveVar(map, name, depth = 0) {
    const raw = map[name]
    if (raw === undefined) return undefined
    return expand(map, raw, depth)
}

function expand(map, value, depth) {
    if (depth > 10) return value
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, ref, fallback) => {
        const next = map[ref]
        if (next === undefined) return fallback === undefined ? '' : fallback.trim()
        return expand(map, next, depth + 1)
    })
}

/** @returns {{r:number,g:number,b:number,a:number}|null} */
export function parseColor(input) {
    if (!input) return null
    const value = input.trim()

    const hex = /^#([0-9a-f]{3,8})$/i.exec(value)
    if (hex) {
        const h = hex[1]
        if (h.length === 3) {
            return {
                r: parseInt(h[0] + h[0], 16),
                g: parseInt(h[1] + h[1], 16),
                b: parseInt(h[2] + h[2], 16),
                a: 1,
            }
        }
        if (h.length === 6 || h.length === 8) {
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16),
                a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
            }
        }
        return null
    }

    const fn = /^rgba?\(([^)]*)\)$/i.exec(value)
    if (fn) {
        const [head, alpha] = fn[1].split('/')
        const parts = head
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
        if (parts.length < 3) return null
        const nums = parts.slice(0, 3).map(channel)
        if (nums.some((n) => n === null)) return null
        let a = 1
        if (alpha !== undefined) a = num(alpha)
        else if (parts.length >= 4) a = num(parts[3])
        if (a === null) return null
        return {r: nums[0], g: nums[1], b: nums[2], a}
    }

    return null
}

function channel(token) {
    if (token.endsWith('%')) {
        const n = num(token.slice(0, -1))
        return n === null ? null : Math.round((n / 100) * 255)
    }
    return num(token)
}

function num(token) {
    const n = Number.parseFloat(token)
    return Number.isNaN(n) ? null : n
}

/** 把半透明前景合成到不透明底色上 */
export function composite(fg, bg) {
    if (fg.a >= 1) return {...fg, a: 1}
    return {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
    }
}

function toLinear(channel8) {
    const c = channel8 / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x 相对亮度 */
export function luminance({r, g, b}) {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2.x 对比度，返回值 1~21 */
export function contrast(fg, bg) {
    const l1 = luminance(fg)
    const l2 = luminance(bg)
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
    return (hi + 0.05) / (lo + 0.05)
}
