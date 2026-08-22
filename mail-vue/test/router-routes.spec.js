/**
 * §5.2 路由表的契约测试。
 *
 * P2 只改 path、不改 name —— 名字是整个应用引用页面的唯一方式（`perm.js` 动态注入、
 * 命令面板的「转到」组、快捷键 `g i`、旧页面里的 `push({name: 'content'})`）。
 * 所以这里锁三件事：name → 新 path 的映射、旧 path 的 redirect 别名、认证页的 meta 门禁。
 *
 * 不在这里测导航本身：`router.push()` 会真的去加载页面组件（旧页面要 pinia + i18n +
 * echarts），那属于浏览器里的人工过审，不是单测该扛的。
 */
import {describe, expect, it} from 'vitest'
import router from '@/router'
import {permsToRouter} from '@/perm/perm.js'

/** 归一化后的路由记录（含 children 与只做重定向的别名记录） */
function recordFor(path) {
    return router.getRoutes().find((r) => r.path === path)
}

describe('路由表 · 静态页（§5.2）', () => {
    it.each([
        ['email', '/mail/inbox'],
        ['content', '/mail/message'],
        ['star', '/mail/starred'],
        ['setting', '/settings'],
    ])('%s → %s', (name, path) => {
        expect(router.hasRoute(name)).toBe(true)
        expect(router.resolve({name}).path).toBe(path)
    })

    it('根路径落在收件箱', () => {
        expect(recordFor('/').redirect).toEqual({name: 'email'})
    })

    it('未匹配的路径落 404 而不是白屏', () => {
        expect(router.resolve('/no-such-page').name).toBe('404')
    })
})

describe('路由表 · 旧路径别名（§5.2「旧路径全部保留为 redirect 别名」）', () => {
    it.each([
        ['/inbox', 'email'],
        ['/message', 'content'],
        ['/starred', 'star'],
    ])('%s 重定向到 %s', (legacy, name) => {
        expect(recordFor(legacy).redirect).toEqual({name})
    })

    it('别名不是页面：没有名字、不进菜单，也就不会出现在侧栏与命令面板里', () => {
        for (const legacy of ['/inbox', '/message', '/starred']) {
            const rec = recordFor(legacy)
            expect(rec.name).toBeUndefined()
            expect(rec.meta.menu).toBeUndefined()
        }
    })

    it('权限页的旧路径不静态注册（否则无权限用户会撞上解析不到的 redirect 目标）', () => {
        for (const legacy of ['/analysis', '/all-users', '/system-setting', '/sent']) {
            expect(recordFor(legacy)).toBeUndefined()
        }
    })
})

describe('路由表 · 认证四视图（§5.3.1）', () => {
    it.each([
        ['login', '/login'],
        ['register', '/register'],
        ['oauth-bind', '/register/bind'],
        ['oauth-callback', '/oauth/callback'],
    ])('%s → %s，且未登录可进', (name, path) => {
        const route = router.resolve({name})
        expect(route.path).toBe(path)
        expect(route.meta.auth).toBe(true)
    })

    it('只有 OAuth 回调允许带着 token 进入（可能是要换个账号登）', () => {
        expect(router.resolve({name: 'oauth-callback'}).meta.signedInOk).toBe(true)
        for (const name of ['login', 'register', 'oauth-bind']) {
            expect(router.resolve({name}).meta.signedInOk).toBeUndefined()
        }
    })

    it('/_ds 预览页不走登录门禁', () => {
        expect(router.resolve('/_ds').meta.public).toBe(true)
    })
})

describe('permsToRouter · 权限页（§5.2「映射关系不变，只改目标 path」）', () => {
    const PAGES = {
        // 写信页跟着 `email:send` 注入（§7.7 整页写信），`menu: false` —— 不进导航
        compose: '/mail/compose',
        // `:emailId?` 与 inbox / starred / trash 一致（审计 P2-7）：少了这一段，
        // `router.replace` 会被 matcher 按 key 过滤掉 emailId，已发送邮件不能深链
        send: '/mail/sent/:emailId?',
        draft: '/mail/drafts',
        user: '/settings/admin/users',
        role: '/settings/admin/roles',
        'sys-setting': '/settings/admin/system',
        'reg-key': '/settings/admin/invites',
        'all-email': '/settings/admin/mail',
        analysis: '/settings/admin/overview',
    }

    const LEGACY = {
        '/sent': 'send',
        '/drafts': 'draft',
        '/all-users': 'user',
        '/role': 'role',
        '/system-setting': 'sys-setting',
        '/invite-code': 'reg-key',
        '/all-mail': 'all-email',
        '/analysis': 'analysis',
    }

    const all = permsToRouter(['*'])
    const pages = all.filter((r) => r.name)
    const aliases = all.filter((r) => !r.name)

    it('八个权限页的名字与新 path 一一对应', () => {
        expect(Object.fromEntries(pages.map((r) => [r.name, r.path]))).toEqual(PAGES)
    })

    it('每个权限页都带一条旧路径别名', () => {
        expect(Object.fromEntries(aliases.map((r) => [r.path, r.redirect.name]))).toEqual(LEGACY)
    })

    it('别名的目标一定是同一批注入里真实存在的页面', () => {
        const names = new Set(pages.map((r) => r.name))
        for (const alias of aliases) {
            expect(names.has(alias.redirect.name)).toBe(true)
            expect(alias.component).toBeUndefined()
        }
    })

    it('没有权限就一个都不注入', () => {
        expect(permsToRouter([])).toEqual([])
        expect(permsToRouter(['email:query'])).toEqual([])
    })

    it('按权限键分别注入，别名跟着它那一份权限走', () => {
        const sendOnly = permsToRouter(['email:send'])
        expect(sendOnly.filter((r) => r.name).map((r) => r.name)).toEqual(['compose', 'send', 'draft'])
        expect(sendOnly.filter((r) => !r.name).map((r) => r.path)).toEqual(['/sent', '/drafts'])

        const adminOnly = permsToRouter(['analysis:query'])
        expect(adminOnly.map((r) => r.path)).toEqual(['/settings/admin/overview', '/analysis'])
    })

    it('页面 meta 原样保留：菜单标记、i18n 标题键、邮件视图标记', () => {
        const send = pages.find((r) => r.name === 'send')
        expect(send.meta).toEqual({title: 'sent', name: 'send', menu: true, mail: true})
        const analysis = pages.find((r) => r.name === 'analysis')
        expect(analysis.meta).toEqual({title: 'analytics', name: 'analysis', menu: true})
    })
})
