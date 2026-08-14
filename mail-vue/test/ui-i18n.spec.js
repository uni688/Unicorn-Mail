import {describe, expect, it} from 'vitest'
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
