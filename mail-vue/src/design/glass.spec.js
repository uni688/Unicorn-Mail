/**
 * `authCardAlpha()` —— 登录卡不透明度的下限判定。
 *
 * 这个函数唯一的职责就是「有背景图时把下限从 0.55 抬到 0.88」，而这条规则是
 * §9.5 那 8 种组合里唯一真的踩过线的地方（浅色主题 + 近黑照片 + 0.55 时卡内
 * `text-fg-muted` 只有 2.2:1）。所以这里锁的不是数字本身，而是「照片在就抬」。
 */
import {describe, expect, it} from 'vitest'
import {GLASS_ALPHA_MIN, GLASS_ALPHA_MIN_PHOTO, authCardAlpha} from './glass.js'

describe('authCardAlpha · 无背景图', () => {
    it('没设过就交给 token 缺省（null），不硬塞一个数字', () => {
        expect(authCardAlpha(null, false)).toBeNull()
        expect(authCardAlpha(undefined, false)).toBeNull()
        expect(authCardAlpha('', false)).toBeNull()
        expect(authCardAlpha('abc', false)).toBeNull()
    })

    it('设过就夹在 0.55–1.00', () => {
        expect(authCardAlpha(0.2, false)).toBe(GLASS_ALPHA_MIN)
        expect(authCardAlpha(0, false)).toBe(GLASS_ALPHA_MIN)
        expect(authCardAlpha(0.72, false)).toBe(0.72)
        expect(authCardAlpha(1.4, false)).toBe(1)
    })

    it('接口回来的字符串也认（`login_opacity` 是文本字段）', () => {
        expect(authCardAlpha('0.72', false)).toBe(0.72)
        expect(authCardAlpha('0.3', false)).toBe(GLASS_ALPHA_MIN)
    })
})

describe('authCardAlpha · 有背景图', () => {
    it('下限抬到 0.88 —— 0.55 与 0.72 都会被抬上来', () => {
        expect(authCardAlpha(0.55, true)).toBe(GLASS_ALPHA_MIN_PHOTO)
        expect(authCardAlpha(0.72, true)).toBe(GLASS_ALPHA_MIN_PHOTO)
        expect(authCardAlpha(0.87, true)).toBe(GLASS_ALPHA_MIN_PHOTO)
    })

    it('没设过时也是 0.88，不能落回 token 缺省的 0.72', () => {
        expect(authCardAlpha(null, true)).toBe(GLASS_ALPHA_MIN_PHOTO)
        expect(authCardAlpha(undefined, true)).toBe(GLASS_ALPHA_MIN_PHOTO)
    })

    it('0.88 以上照旧听站长的（滑杆的高段没被废掉）', () => {
        expect(authCardAlpha(0.94, true)).toBe(0.94)
        expect(authCardAlpha(1, true)).toBe(1)
    })

    it('第二个参数缺省按「没有背景图」算（GlassCard 的通用下限）', () => {
        expect(authCardAlpha(0.55)).toBe(GLASS_ALPHA_MIN)
    })
})

describe('两个下限的关系', () => {
    it('照片下限严格高于通用下限，且都在合法区间内', () => {
        expect(GLASS_ALPHA_MIN_PHOTO).toBeGreaterThan(GLASS_ALPHA_MIN)
        for (const v of [GLASS_ALPHA_MIN, GLASS_ALPHA_MIN_PHOTO]) {
            expect(v).toBeGreaterThan(0)
            expect(v).toBeLessThanOrEqual(1)
        }
    })

    /** 实测需求是 Light 0.86 / Dark 0.84，下限必须覆盖这两个数 */
    it('照片下限覆盖两套主题实测出来的最坏需求（0.86 / 0.84）', () => {
        expect(GLASS_ALPHA_MIN_PHOTO).toBeGreaterThanOrEqual(0.86)
    })
})
