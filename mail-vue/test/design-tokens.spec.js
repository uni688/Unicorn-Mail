import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {collectVars, composite, contrast, parseColor, resolveVar} from './helpers/css-vars.js'

/**
 * Design token 的静态契约测试（§4.2 / §9.4 的可执行版本）。
 *
 * 之所以值得写：配色是三层 token + 两套主题 + 半透明叠加，
 * 「改一个色阶顺手把某个组合的对比度踩到 AA 以下」是最容易发生且最难肉眼发现的回归。
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const primitives = read('../src/design/primitives.css')
const tokens = read('../src/design/tokens.css')

const LIGHT = {...collectVars(primitives, ':root'), ...collectVars(tokens, ':root')}
const DARK = {...LIGHT, ...collectVars(tokens, ':root.dark')}
const THEMES = {light: LIGHT, dark: DARK}

function color(map, name) {
    const raw = resolveVar(map, name)
    expect(raw, `token ${name} 未定义`).toBeTruthy()
    const parsed = parseColor(raw)
    expect(parsed, `token ${name} = "${raw}" 解析不出颜色`).not.toBeNull()
    return parsed
}

/** 前景/背景都可能是半透明，统一先合成到 base（默认卡片底）上再算 */
function ratio(map, fgName, bgName, baseName) {
    const base = color(map, baseName)
    const bg = composite(color(map, bgName), base)
    return contrast(composite(color(map, fgName), bg), bg)
}

// Layer 3 里 --um-sidebar-w 这类布局尺度也以 sidebar 开头，别把它们当颜色求值
const COLOR_TOKEN = /^--um-(bg|fg|border|accent|success|warning|danger|info|chart)-|^--um-sidebar-(bg|fg|indicator)$/

// [前景, 背景, 最低对比度, 合成底色]
const TEXT_PAIRS = [
    ['--um-fg-default', '--um-bg-canvas', 4.5],
    ['--um-fg-default', '--um-bg-subtle', 4.5],
    ['--um-fg-default', '--um-bg-surface', 4.5],
    ['--um-fg-default', '--um-bg-raised', 4.5],
    ['--um-fg-default', '--um-bg-inset', 4.5],
    ['--um-fg-default', '--um-bg-hover', 4.5, '--um-bg-surface'],
    ['--um-fg-default', '--um-bg-active', 4.5, '--um-bg-surface'],
    ['--um-fg-default', '--um-bg-selected', 4.5, '--um-bg-surface'],
    ['--um-fg-muted', '--um-bg-canvas', 4.5],
    ['--um-fg-muted', '--um-bg-subtle', 4.5],
    ['--um-fg-muted', '--um-bg-surface', 4.5],
    ['--um-fg-muted', '--um-bg-inset', 4.5],
    ['--um-fg-muted', '--um-bg-hover', 4.5, '--um-bg-surface'],
    // 主按钮：白字压在实底上。这一条就是 dark accent-solid 不能用 violet-550 的原因
    ['--um-fg-on-accent', '--um-accent-solid', 4.5],
    // accent 当文字用必须走 accent-fg，不能走 accent-solid
    ['--um-accent-fg', '--um-bg-canvas', 4.5],
    ['--um-accent-fg', '--um-bg-surface', 4.5],
    ['--um-accent-subtle-fg', '--um-accent-subtle-bg', 4.5, '--um-bg-surface'],
    ['--um-sidebar-fg', '--um-sidebar-bg', 4.5],
    ['--um-success-subtle-fg', '--um-success-subtle-bg', 4.5, '--um-bg-surface'],
    ['--um-warning-subtle-fg', '--um-warning-subtle-bg', 4.5, '--um-bg-surface'],
    ['--um-danger-subtle-fg', '--um-danger-subtle-bg', 4.5, '--um-bg-surface'],
    ['--um-info-subtle-fg', '--um-info-subtle-bg', 4.5, '--um-bg-surface'],
]

// 非文字元素（图标 / 描边 / 焦点环 / 状态点）按 WCAG 2.2 SC 1.4.11 只要 3:1
const UI_PAIRS = [
    ['--um-border-focus', '--um-bg-canvas', 3],
    ['--um-border-focus', '--um-bg-subtle', 3],
    ['--um-border-focus', '--um-bg-surface', 3],
    ['--um-border-focus', '--um-bg-inset', 3],
    ['--um-accent-solid', '--um-bg-canvas', 3],
    ['--um-accent-solid', '--um-bg-surface', 3],
    ['--um-success-solid', '--um-bg-surface', 3],
    ['--um-warning-solid', '--um-bg-surface', 3],
    ['--um-danger-solid', '--um-bg-surface', 3],
    ['--um-info-solid', '--um-bg-surface', 3],
    ['--um-sidebar-indicator', '--um-sidebar-bg', 3],
    // §4.2 写明 fg-subtle 只用于 ≥13px 的非关键信息，因此按 3:1 收
    ['--um-fg-subtle', '--um-bg-canvas', 3],
    ['--um-fg-subtle', '--um-bg-surface', 3],
    // hover/active 是瞬时态，不按正文 4.5 收，但也不能烂到看不清
    ['--um-fg-on-accent', '--um-accent-hover', 3],
    ['--um-fg-on-accent', '--um-accent-active', 3],
]

describe.each(Object.keys(THEMES))('%s 主题对比度', (theme) => {
    const map = THEMES[theme]

    it.each(TEXT_PAIRS)('正文 %s / %s ≥ %s:1', (fg, bg, min, base = '--um-bg-canvas') => {
        const value = ratio(map, fg, bg, base)
        expect(Number(value.toFixed(2)), `${fg} on ${bg} = ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    })

    it.each(UI_PAIRS)('非文字 %s / %s ≥ %s:1', (fg, bg, min, base = '--um-bg-canvas') => {
        const value = ratio(map, fg, bg, base)
        expect(Number(value.toFixed(2)), `${fg} on ${bg} = ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    })

    it('每个语义色 token 都能求值成一个真实颜色', () => {
        const broken = []
        for (const name of Object.keys(map)) {
            if (!COLOR_TOKEN.test(name)) continue
            const raw = resolveVar(map, name)
            if (!raw || raw.includes('var(') || parseColor(raw) === null) broken.push(`${name} → "${raw}"`)
        }
        expect(broken).toEqual([])
    })
})

describe('Tailwind 桥接层（@theme inline）', () => {
    const bridge = collectVars(tokens, '@theme inline')

    it('至少桥接了主要命名空间', () => {
        const names = Object.keys(bridge)
        expect(names.length).toBeGreaterThan(30)
        expect(names).toContain('--color-canvas')
        expect(names).toContain('--color-fg')
        expect(names).toContain('--color-accent-fg')
    })

    it('引用的每个 --um-* 在两套主题里都存在', () => {
        const missing = []
        for (const [name, value] of Object.entries(bridge)) {
            for (const ref of value.match(/--um-[\w-]+/g) ?? []) {
                if (LIGHT[ref] === undefined) missing.push(`${name} → ${ref}（light 缺失）`)
                if (DARK[ref] === undefined) missing.push(`${name} → ${ref}（dark 缺失）`)
            }
        }
        expect(missing).toEqual([])
    })

    it('不直接引用 Layer 1 原色（桥接层只能读语义层）', () => {
        const leaks = Object.entries(bridge)
            .filter(([, v]) => /--um-(gray|violet|green|amber|red|cyan)-/.test(v))
            .map(([k, v]) => `${k}: ${v}`)
        expect(leaks).toEqual([])
    })
})
