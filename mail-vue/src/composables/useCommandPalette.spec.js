/**
 * 命令面板的三块纯逻辑：输入解析、fuzzy 排序、最近访问。
 *
 * `useCommandPalette()` 本身要 router + i18n + 四个 store，属于组件里的集成，
 * 归 `/_ds` 与浏览器过审；这里只测能单独成立的部分 —— 也正是最容易被改坏的部分：
 * 中文只能走子串命中（拼音不在范围内），所以 `fuzzyScore` 的子串优先必须锁住。
 */
import {beforeEach, describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

// `useCommandPalette.js` 顺着 `utils/day.js` 会在**模块顶层**就 `useSettingStore()`
// （旧代码遗留），少了 pinia 是 import 那一刻就抛。静态 import 会被提升到这行之前，
// 所以模块本体只能动态引 —— 这不是测试写法上的偏好，是那条顶层副作用逼出来的。
setActivePinia(createPinia())
const {
    PALETTE_PREFIX,
    SETTINGS,
    closePalette,
    fuzzyFilter,
    fuzzyScore,
    openPalette,
    parseQuery,
    recordVisit,
    togglePalette,
    usePaletteState,
} = await import('./useCommandPalette.js')

describe('parseQuery · 一个输入框四种意图（§5.1）', () => {
    it('无前缀是全局搜索', () => {
        expect(parseQuery('主题')).toEqual({mode: 'all', term: '主题'})
        expect(parseQuery('  邮件  ')).toEqual({mode: 'all', term: '邮件'})
        expect(parseQuery('')).toEqual({mode: 'all', term: ''})
        expect(parseQuery(null)).toEqual({mode: 'all', term: ''})
    })

    it.each(Object.entries(PALETTE_PREFIX))('%s → %s 模式', (prefix, mode) => {
        expect(parseQuery(prefix)).toEqual({mode, term: ''})
        expect(parseQuery(`${prefix}主题`)).toEqual({mode, term: '主题'})
        // 前缀后允许有空格：`> 主题` 与 `>主题` 等价
        expect(parseQuery(`${prefix} 主题`)).toEqual({mode, term: '主题'})
    })

    it('前缀只认第一个字符，词里的 @ 不会改模式', () => {
        expect(parseQuery('bob@mail.com')).toEqual({mode: 'all', term: 'bob@mail.com'})
    })
})

describe('面板开关 · 模块单例（顶栏、⌘K、/、头像菜单共用一份）', () => {
    it('openPalette 预填输入，closePalette 不清词（与 VS Code 一致）', () => {
        const {open, query, mode} = usePaletteState()

        openPalette('>')
        expect(open.value).toBe(true)
        expect(query.value).toBe('>')
        expect(mode.value).toBe('command')

        closePalette()
        expect(open.value).toBe(false)
        expect(query.value).toBe('>')
    })

    it('toggle 开着就关、关着就开', () => {
        const {open} = usePaletteState()
        closePalette()

        togglePalette('@')
        expect(open.value).toBe(true)
        togglePalette()
        expect(open.value).toBe(false)

        closePalette()
    })
})

describe('fuzzyScore · 子串优先，中文只能走这条路', () => {
    it('空词不参与排序（按原顺序全留）', () => {
        expect(fuzzyScore('收件箱', '')).toBe(0)
    })

    it('子串命中压过子序列命中', () => {
        const substring = fuzzyScore('设置', '设置')
        const subsequence = fuzzyScore('设 x 置', '设置')
        expect(substring).toBeGreaterThan(subsequence)
        expect(subsequence).not.toBeNull()
    })

    it('命中位置越靠前分越高，开头额外加权', () => {
        expect(fuzzyScore('inbox', 'in')).toBeGreaterThan(fuzzyScore('the inbox', 'in'))
    })

    it('缺字符就是不命中', () => {
        expect(fuzzyScore('inbox', 'inx')).not.toBeNull()   // 按序子序列
        expect(fuzzyScore('inbox', 'xin')).toBeNull()       // 顺序不对
        expect(fuzzyScore('inbox', 'zz')).toBeNull()
        expect(fuzzyScore('', 'a')).toBeNull()
    })

    it('大小写无关', () => {
        expect(fuzzyScore('Inbox', 'inbox')).toBe(fuzzyScore('inbox', 'INBOX'))
    })
})

describe('fuzzyFilter', () => {
    const items = [
        {label: '收件箱', keywords: 'inbox shoujianxiang'},
        {label: '已发送', keywords: 'sent yifasong'},
        {label: '草稿', hint: '本机', keywords: 'draft caogao'},
    ]

    it('空词原样返回，只受 limit 约束', () => {
        expect(fuzzyFilter(items, '')).toHaveLength(3)
        expect(fuzzyFilter(items, '', 2)).toHaveLength(2)
    })

    it('label / hint / keywords 三者都参与匹配', () => {
        expect(fuzzyFilter(items, 'shoujian').map((i) => i.label)).toEqual(['收件箱'])
        expect(fuzzyFilter(items, '本机').map((i) => i.label)).toEqual(['草稿'])
        expect(fuzzyFilter(items, '草稿').map((i) => i.label)).toEqual(['草稿'])
    })

    it('按分数降序，limit 是硬上限', () => {
        const hits = fuzzyFilter(items, 's')
        expect(hits.length).toBeGreaterThan(1)
        expect(fuzzyFilter(items, 's', 1)).toHaveLength(1)
    })

    it('一个都不命中时返回空数组而不是全量', () => {
        expect(fuzzyFilter(items, 'zzzz')).toEqual([])
    })
})

describe('recordVisit · 最近访问', () => {
    beforeEach(() => {
        localStorage.removeItem('um-recent-routes')
    })

    it('只记有 meta.title 的真页面（别名与认证页不记）', () => {
        recordVisit({name: 'email', meta: {title: 'inbox'}})
        recordVisit({name: 'login', meta: {}})
        recordVisit({name: undefined, meta: {title: 'x'}})

        expect(JSON.parse(localStorage.getItem('um-recent-routes'))).toEqual([
            {name: 'email', title: 'inbox'},
        ])
    })

    it('同一页只留一条并冒到最前，最多 5 条', () => {
        for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
            recordVisit({name, meta: {title: name}})
        }
        recordVisit({name: 'b', meta: {title: 'b'}})

        const stored = JSON.parse(localStorage.getItem('um-recent-routes'))
        expect(stored).toHaveLength(5)
        expect(stored[0]).toEqual({name: 'b', title: 'b'})
        expect(stored.filter((r) => r.name === 'b')).toHaveLength(1)
        expect(stored.some((r) => r.name === 'a')).toBe(false)
    })
})

describe('SETTINGS · ⚙ 菜单与 # 模式共用一份表', () => {
    it('每一项都能被 router.push({name}) 用，且分到了 account / admin', () => {
        for (const item of SETTINGS) {
            expect(typeof item.name).toBe('string')
            expect(item.label).toBeTruthy()
            expect(['account', 'admin']).toContain(item.group)
        }
    })

    it('名字不重复 —— 重复会让面板出现两条一样的入口', () => {
        expect(new Set(SETTINGS.map((i) => i.name)).size).toBe(SETTINGS.length)
    })
})
