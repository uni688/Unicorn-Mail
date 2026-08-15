/**
 * useBgEffect 的两级开关（§8.5 / §0.3）。这一层值得单独锁住，因为它决定的是
 * **canvas 到底启不启动**：判定写错的后果不是「样式不好看」，而是低端机上白跑一个
 * 每秒 30 帧的动画，或者站长明明关了效果、登录页还在飘点。
 *
 * 三件事必须成立：
 * - 站长 `off`/`on` 压过用户偏好，`optional`（含字段缺失）才轮到用户
 * - `particleMode` 只在「用户选了粒子 + 非移动端 + 非低端机」时才是 animated，
 *   reduced-motion 降级成 static（一帧点阵）而不是 off —— 减少动效 ≠ 减少装饰
 * - `adminLocked` 为真时设置页要置灰而不是隐藏那组单选
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useSettingStore} from '@/store/setting.js'

/**
 * 一个认查询串的 matchMedia：`test/setup.js` 的全局桩恒为 false，那等于
 * 「移动端」（`min-width: 768px` 不命中），粒子永远是 off，三条分支里两条测不到。
 *
 * 桩必须在 import 之前装好：`useBreakpoint` 的 mql 是模块级单例（首次调用就建好、
 * 全站共用），`useBgEffect.js` 里的 `isLowEnd` 更是模块加载时算一次。
 */
const state = {width: 1440, reduce: false}
const created = []

window.matchMedia = (query) => {
    const q = String(query)
    const min = Number(q.match(/min-width:\s*(\d+)px/)?.[1] ?? 0)
    const mql = {
        media: q,
        matches: q.includes('prefers-reduced-motion') ? state.reduce : state.width >= min,
        handlers: new Set(),
        addEventListener: (_, fn) => mql.handlers.add(fn),
        removeEventListener: (_, fn) => mql.handlers.delete(fn),
        addListener: (fn) => mql.handlers.add(fn),
        removeListener: (fn) => mql.handlers.delete(fn),
        dispatchEvent: () => false,
        onchange: null,
    }
    created.push(mql)
    return mql
}

/** 改宽度：像浏览器那样通知已建立的监听器（断点是单例，只能靠事件推） */
function setWidth(width) {
    state.width = width
    for (const mql of created) {
        const min = Number(mql.media.match(/min-width:\s*(\d+)px/)?.[1] ?? 0)
        if (!mql.media.includes('min-width')) continue
        mql.matches = width >= min
        for (const fn of mql.handlers) fn({matches: mql.matches})
    }
}

// 8 核 + 无 saveData = 不是低端机；这个值在模块加载时就被读走，改不回来
Object.defineProperty(navigator, 'hardwareConcurrency', {value: 8, configurable: true})

setActivePinia(createPinia())
const {USER_BG_MODES, useBgEffect} = await import('./useBgEffect.js')

/** `settings.bgEffect` 还没落库（§10.5 增量 5），字段缺失要按 optional 处理 */
function withAdmin(bgEffect) {
    setActivePinia(createPinia())
    useSettingStore().settings = bgEffect === undefined ? {} : {bgEffect}
    return useBgEffect()
}

beforeEach(() => {
    localStorage.removeItem('um-bg-effect')
    setWidth(1440)
    state.reduce = false
})

describe('adminPolicy · 站长策略', () => {
    it('只认 off / on，其余（含缺失与脏值）都是 optional', () => {
        expect(withAdmin('off').adminPolicy.value).toBe('off')
        expect(withAdmin('on').adminPolicy.value).toBe('on')
        expect(withAdmin(undefined).adminPolicy.value).toBe('optional')
        expect(withAdmin('yes-please').adminPolicy.value).toBe('optional')
    })

    it('adminLocked 只在站长做了决定时为真（设置页据此置灰而非隐藏）', () => {
        expect(withAdmin('off').adminLocked.value).toBe(true)
        expect(withAdmin('on').adminLocked.value).toBe(true)
        expect(withAdmin(undefined).adminLocked.value).toBe(false)
    })
})

describe('pref · 站长优先，optional 才看用户', () => {
    it('站长 off 压掉用户的 particles', () => {
        const bg = withAdmin('optional')
        bg.setUserPref('particles')

        const off = withAdmin('off')
        expect(off.pref.value).toBe('off')
        expect(off.glowVisible.value).toBe(false)
        expect(off.particleMode.value).toBe('off')
    })

    it('站长 on 压掉用户的 off', () => {
        withAdmin('optional').setUserPref('off')

        const on = withAdmin('on')
        expect(on.pref.value).toBe('particles')
        expect(on.glowVisible.value).toBe(true)
    })

    /**
     * `userPref` 是模块级 ref，只在加载时读一次 localStorage —— 一次会话里改了就
     * 留着，这是对的（P5 接口上线后它会换成 store）。所以「用户从没选过」这一支
     * 只能靠重新加载模块来复现，清 localStorage 是不够的。
     */
    it('optional 时用户没选过就是 glow —— 柔光是默认档，不是「没效果」', async () => {
        vi.resetModules()
        setActivePinia(createPinia())
        const fresh = await import('./useBgEffect.js')
        useSettingStore().settings = {}
        const bg = fresh.useBgEffect()

        expect(bg.pref.value).toBe('glow')
        expect(bg.userPref.value).toBe('glow')
        expect(bg.glowVisible.value).toBe(true)
        expect(bg.particleMode.value).toBe('off')
    })

    it('setUserPref 落 localStorage，脏值直接不理（不写、也不改现状）', () => {
        const bg = withAdmin(undefined)

        bg.setUserPref('particles')
        expect(localStorage.getItem('um-bg-effect')).toBe('particles')
        expect(bg.pref.value).toBe('particles')

        bg.setUserPref('sparkles')
        expect(localStorage.getItem('um-bg-effect')).toBe('particles')
        expect(bg.pref.value).toBe('particles')
    })

    it('用户侧是 off/glow/particles 三选一，与站长侧的 optional 不同源', () => {
        expect(USER_BG_MODES).toEqual(['off', 'glow', 'particles'])
        expect(USER_BG_MODES).not.toContain('optional')
    })
})

describe('particleMode · 只有一档真的跑 RAF', () => {
    it('桌面 + 不减少动效 = animated', () => {
        const bg = withAdmin('on')
        expect(bg.isLowEnd).toBe(false)
        expect(bg.particleMode.value).toBe('animated')
    })

    it('prefers-reduced-motion = static（画一帧就停，不是撤掉装饰）', () => {
        state.reduce = true
        expect(withAdmin('on').particleMode.value).toBe('static')
    })

    it('< md 直接不启动 canvas，柔光照旧留着', () => {
        const bg = withAdmin('on')
        setWidth(390)
        expect(bg.particleMode.value).toBe('off')
        expect(bg.glowVisible.value).toBe(true)
    })

    it('pref 不是 particles 时永远 off（glow 档不该有 canvas）', () => {
        const bg = withAdmin(undefined)
        bg.setUserPref('glow')
        expect(bg.particleMode.value).toBe('off')
    })
})
