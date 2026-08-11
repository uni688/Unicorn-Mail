import {readFileSync, readdirSync} from 'node:fs'
import {extname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

/**
 * P0 迁移的回归护栏：
 * 1. 旧 style.css 里那条 `*:focus{outline:none}` 不许回来（§9.4 的 a11y 底线）
 * 2. 删 token 时不能把还有人 var() 引用的旧变量一起删掉（compat-ep.css 存在的意义）
 * 3. index.html 的防闪白脚本与 useTheme.js 的 THEME_COLOR 是被迫的重复，必须同步
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const SCAN_EXT = new Set(['.vue', '.css', '.scss', '.less', '.js', '.html'])
const SKIP_DIR = new Set(['node_modules', 'dist', 'dev-dist', 'public', '.git'])

function walk(dir, out = []) {
    for (const entry of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
        const rel = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIR.has(entry.name)) walk(rel, out)
        } else if (SCAN_EXT.has(extname(entry.name))) {
            out.push(rel)
        }
    }
    return out
}

const FILES = [...walk('src'), 'index.html']
const SOURCES = new Map(FILES.map((f) => [f, read(f)]))
// 注释里会出现 `var(--um-*)` 这类示意写法，扫描前先剥掉块注释
const CODE = new Map([...SOURCES].map(([f, c]) => [f, c.replace(/\/\*[\s\S]*?\*\//g, '')]))

/**
 * 允许 outline:none 的唯一场景：焦点环被「搬」到了外层容器上（EP 的输入框把环
 * 画在 .el-input__wrapper 上，内层 <input> 再画一次就是双重环）。
 * 每条例外都必须在下面的「环搬到哪儿」测试里有对应的正向断言。
 */
const FOCUS_RING_RELOCATED = [
    '.el-input .el-input__inner:focus-visible',
    '.el-textarea .el-textarea__inner:focus-visible',
    '.el-select .el-select__wrapper:focus-visible',
]

/** 选择器里 `:not(:focus-visible)` 是「只关鼠标环」的正当写法，判定前先摘掉 :not(…) */
const withoutNot = (selector) => selector.replace(/:not\([^)]*\)/g, '')

describe('焦点可见性（P0 硬指标）', () => {
    it('style.css 不再有任何 outline:none（注释里的历史说明不算）', () => {
        expect(CODE.get(join('src', 'style.css'))).not.toMatch(/outline\s*:\s*none/)
    })

    it('base.css 提供了全局 :focus-visible 焦点环', () => {
        const base = read('src/design/base.css')
        expect(base).toMatch(/:focus-visible\s*\{[^}]*outline:/)
        expect(base).toMatch(/--um-focus-ring-w/)
    })

    it('没有任何源码用 outline:none 关掉 :focus-visible', () => {
        const offenders = []
        for (const [file, code] of CODE) {
            for (const m of code.matchAll(/([^{}]*):focus-visible([^{}]*)\{([^}]*)\}/g)) {
                const selector = `${m[1]}:focus-visible${m[2]}`
                if (!/outline\s*:\s*(none|0)\b/.test(m[3])) continue
                // 逐条选择器判断：只有「摘掉 :not() 后仍含 :focus-visible」的才算关掉了键盘焦点环
                for (const one of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
                    if (!withoutNot(one).includes(':focus-visible')) continue
                    if (FOCUS_RING_RELOCATED.includes(one)) continue
                    offenders.push(`${file}: ${one}`)
                }
            }
        }
        expect(offenders).toEqual([])
    })

    it('被豁免的 EP 输入框把环搬到了外层容器', () => {
        const ep = read('src/design/compat-ep.css')
        // 内层不画环的三个选择器都在 compat-ep.css 里，且外层有可见的 accent 环
        for (const selector of FOCUS_RING_RELOCATED) {
            expect(ep, `${selector} 不在 compat-ep.css 里，豁免名单已过期`).toContain(selector)
        }
        const wrapperRing = /\.el-(input|select)[^{]*\.is-focus(ed)?[^{]*\{([^}]*)\}/g
        const rings = [...ep.matchAll(wrapperRing)].map((m) => m[3])
        expect(rings.length, '找不到 .is-focus/.is-focused 的容器焦点环').toBeGreaterThan(0)
        for (const body of rings) {
            expect(body).toMatch(/box-shadow[^;]*--um-accent-(solid|ring)/)
        }
        // textarea 没有 wrapper，环直接画在 inner 的 :focus 上
        expect(ep).toMatch(/\.el-textarea__inner:focus\s*\{[^}]*box-shadow[^}]*--um-accent-/)
    })
})

describe('CSS 自定义属性完整性', () => {
    it('被 var() 引用的变量都有定义', () => {
        const used = new Map()
        const defined = new Set()

        for (const [file, code] of CODE) {
            for (const m of code.matchAll(/var\(\s*(--[\w-]+)/g)) {
                if (!used.has(m[1])) used.set(m[1], file)
            }
            for (const m of code.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/gm)) {
                defined.add(m[2])
            }
            // 运行期由 JS 写入的变量（如 View Transition 的 --vt-*）也算已定义
            for (const m of code.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) {
                defined.add(m[1])
            }
        }

        // Element Plus 自带的变量表由 EP 的 CSS 提供，不在本仓库里定义
        const missing = [...used]
            .filter(([name]) => !name.startsWith('--el-') && !name.startsWith('--tw-'))
            .filter(([name]) => !defined.has(name))
            .map(([name, file]) => `${name}（首次出现于 ${file}）`)

        expect(missing).toEqual([])
    })

    it('业务代码不直接读 Layer 1 原色', () => {
        const leaks = []
        for (const [file, code] of CODE) {
            if (file.startsWith(join('src', 'design'))) continue
            for (const m of code.matchAll(/var\(\s*(--um-(?:gray|violet|green|amber|red|cyan)-[\w-]+)/g)) {
                leaks.push(`${file}: ${m[1]}`)
            }
        }
        expect(leaks).toEqual([])
    })
})

describe('侧栏文字必须跟着 --aside-backgound 走', () => {
    /**
     * P0 把 --aside-backgound 从深蓝 #001529 改成了浅色 --um-sidebar-bg（§4.6），
     * 而旧侧栏把文字写死成白色 —— 浅色底 + 白字 = 整条导航看不见。
     * 这里锁住「侧栏文字只能来自 token」，避免哪天又被改回 #fff。
     */
    const aside = read('src/layout/aside/index.vue')

    it('el-menu 的 text-color / active-text-color 用 token 而不是写死颜色', () => {
        for (const attr of ['text-color', 'active-text-color']) {
            const m = new RegExp(`${attr}="([^"]+)"`).exec(aside)
            expect(m, `<el-menu> 上找不到 ${attr}`).not.toBeNull()
            expect(m[1], `${attr} 写死了颜色`).toMatch(/var\(--um-/)
        }
    })

    it('管理分组标题、分割线文字、选中态都不再硬编码白色', () => {
        const blocks = ['.manage-title', ':deep(.el-divider__text)', '.choose-item']
        for (const sel of blocks) {
            const start = aside.indexOf(sel)
            expect(start, `${sel} 不在侧栏样式里了`).toBeGreaterThan(-1)
            const body = aside.slice(start, aside.indexOf('}', start))
            const color = /(?:^|[\s;])color:\s*([^;]+)/.exec(body)
            if (!color) continue
            expect(color[1].trim(), `${sel} 的 color 仍是写死的白`).toMatch(/var\(--um-/)
        }
        // 选中态与 hover 的底色也要用 token（旧值 rgba(255,255,255,.08) 在浅底上等于没有）
        expect(aside).not.toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*0?\.08\)/)
    })
})

describe('主题色两处定义必须一致', () => {
    const hex = (s) => (s.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((v) => v.toUpperCase())

    const themeColor = (() => {
        const block = /const THEME_COLOR\s*=\s*\{([\s\S]*?)\n\}/.exec(read('src/composables/useTheme.js'))
        expect(block, 'useTheme.js 里找不到 THEME_COLOR').not.toBeNull()
        return block[1]
    })()

    const inlineScript = (() => {
        const html = read('index.html')
        const m = /<script>([\s\S]*?)<\/script>/.exec(html)
        expect(m, 'index.html 里找不到防闪白内联脚本').not.toBeNull()
        return m[1]
    })()

    it('内联脚本用的 4 个 theme-color 与 THEME_COLOR 完全一致', () => {
        expect(new Set(hex(inlineScript))).toEqual(new Set(hex(themeColor)))
        expect(hex(themeColor)).toHaveLength(4)
    })

    it('<meta name="theme-color"> 默认值 = 浅色桌面端主题色', () => {
        const html = read('index.html')
        const meta = /<meta[^>]+name="theme-color"[^>]+content="(#[0-9A-Fa-f]{6})"/.exec(html)
        expect(meta, '找不到 theme-color meta').not.toBeNull()
        const light = /light:\s*\{[^}]*desktop:\s*'(#[0-9A-Fa-f]{6})'/.exec(themeColor)
        expect(meta[1].toUpperCase()).toBe(light[1].toUpperCase())
    })
})
