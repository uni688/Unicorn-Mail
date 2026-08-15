import {describe, expect, it} from 'vitest'
import {createI18n} from 'vue-i18n'
import zh from '@/i18n/zh.js'
import en from '@/i18n/en.js'
import {UI_TEXT_FALLBACK, resolveUiText} from '@/components/ui/_shared/useUiText.js'

/**
 * 原语的文案走「props → i18n `ui.*` → 内置兜底」三级。第二级少一个键不会报错，
 * 只会静默降级成中文兜底 —— 英文界面里冒出中文按钮，而且没有任何日志。
 * 所以键的完整性只能靠这个测试守。
 */

const KEYS = Object.keys(UI_TEXT_FALLBACK)

describe('ui.* i18n 与 UI_TEXT_FALLBACK 对齐', () => {
    it.each([['zh', zh], ['en', en]])('%s 的 ui.* 键集与兜底完全一致', (_lang, messages) => {
        expect(messages.ui).toBeTypeOf('object')
        expect(Object.keys(messages.ui).sort()).toEqual([...KEYS].sort())
    })

    it.each([['zh', zh], ['en', en]])('%s 的每条文案都非空字符串', (_lang, messages) => {
        for (const key of KEYS) {
            expect(messages.ui[key], key).toBeTypeOf('string')
            expect(messages.ui[key].trim(), key).not.toBe('')
        }
    })

    it('带占位符的文案两种语言都保留了 {n}', () => {
        expect(zh.ui.page).toContain('{n}')
        expect(en.ui.page).toContain('{n}')
    })

    it('英文文案不能残留中文（漏翻的典型症状）', () => {
        for (const key of KEYS) {
            expect(/[一-龥]/.test(en.ui[key]), `en.ui.${key}`).toBe(false)
        }
    })
})

describe('每条文案都能被 vue-i18n 编译', () => {
    /**
     * 消息编译是**惰性**的：`t()` 第一次取到某条文案时才编译，所以一条写坏的文案
     * 只会在真的渲染到它的那一刻抛 SyntaxError —— 而 Vue 里这一抛会把整棵子树
     * 撕掉。实测过一次：`shell.paletteHint` 里的裸 `@`（vue-i18n 的链接消息语法
     * `@:key`）让整个命令面板渲染不出来，控制台只有一行 Invalid linked format。
     *
     * 这里把两种语言的每一条都过一遍编译器。裸 `@`、没配对的 `{`、`$` 之类的
     * 语法坑都会在这里当场炸掉，而不是等到用户点开那个界面。
     */
    const leaves = (obj, prefix = '', out = []) => {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key
            if (value && typeof value === 'object') leaves(value, path, out)
            else if (typeof value === 'string') out.push(path)
        }
        return out
    }

    it.each([['zh', zh], ['en', en]])('%s 的全部消息编译通过', (lang, messages) => {
        const i18n = createI18n({legacy: false, locale: lang, messages: {[lang]: messages}})
        const broken = []
        for (const path of leaves(messages)) {
            try {
                i18n.global.t(path)
            } catch (error) {
                broken.push(`${lang}.${path}: ${error.message.split('\n')[0]}`)
            }
        }
        expect(broken).toEqual([])
    })
})

describe('resolveUiText', () => {
    it('没有 translate 时用兜底文案', () => {
        expect(resolveUiText(null, 'close')).toBe(UI_TEXT_FALLBACK.close)
    })

    it('translate 命中时用翻译结果', () => {
        const t = (path) => (path === 'ui.close' ? 'Close' : path)
        expect(resolveUiText(t, 'close')).toBe('Close')
    })

    it('translate 没命中（vue-i18n 原样返回路径）时退回兜底', () => {
        expect(resolveUiText((path) => path, 'close')).toBe(UI_TEXT_FALLBACK.close)
    })

    it('兜底文案也做占位符替换', () => {
        expect(resolveUiText(null, 'page', {n: 3})).toBe('第 3 页')
        // 没给到的占位符保持原样，方便定位漏参
        expect(resolveUiText(null, 'page', {})).toBe('第 {n} 页')
    })

    it('未知键返回键名本身，不抛错', () => {
        expect(resolveUiText(null, 'nope')).toBe('nope')
    })
})
