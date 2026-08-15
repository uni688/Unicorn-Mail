import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {breakpointNow} from "@/composables/useBreakpoint.js";

/**
 * 旧路径 → 新路由名（§5.2「旧路径全部保留为 `redirect` 别名，避免书签与 PWA 快捷方式失效」）。
 *
 * 只有**静态**页的别名在这里；权限页（`/analysis`、`/all-users`…）的别名必须跟着权限
 * 一起注入，否则没有该权限的用户访问旧路径会被重定向到一个当前不存在的目标 ——
 * vue-router 对解析不到的 redirect 目标是直接抛错，不是 404。见 `perm/perm.js`。
 */
const legacyRedirects = [
    ['/inbox', 'email'],
    ['/message', 'content'],
    ['/starred', 'star'],
].map(([path, name]) => ({path, redirect: {name}}))

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: {name: 'email'},
        component: () => import('@/layout/index.vue'),
        children: [
            {
                // §5.2：邮件区收进 `/mail/*`，路由名一个都没改 —— perm.js、命令面板、
                // 快捷键、旧页面里的 `push({name})` 全靠名字，改 path 不改 name 是零风险的
                path: '/mail/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true,
                    // mail: 邮件视图。CommandBar（§6.2）的动作全部作用于邮件列表，
                    // 所以它只在带这个标记的路由上出现；send/draft 在 perm.js 里同样标了
                    mail: true
                }
            },
            {
                // P3 会把它换成 `/mail/:folder/:emailId` 深链（§5.2）；P2 只搬 path，
                // 因为当前的正文页完全靠 store 传值，没有从 URL 取邮件 id 的能力
                path: '/mail/message',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false,
                    mail: true
                }
            },
            {
                // 设置中心（`/settings/account/*` 九个 section）是 P4 的事；
                // 现在这一页仍是旧的混合设置页，留在 `/settings` 不动
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/mail/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true,
                    mail: true
                }
            },
            ...legacyRedirects,
        ]

    },
    {
        // 认证四视图（§5.3.1）。`meta.auth` 让守卫认出「未登录也能进」的页面，
        // 名字保持 `login` 不变 —— perm.js、axios 拦截器、旧代码里到处在用它
        path: '/login',
        name: 'login',
        component: () => import('@/views/auth/Login.vue'),
        meta: {auth: true}
    },
    {
        path: '/register',
        name: 'register',
        component: () => import('@/views/auth/Register.vue'),
        meta: {auth: true}
    },
    {
        // 第三方授权过了但还没绑邮箱的中间步骤（旧版是登录页里的一个弹窗）
        path: '/register/bind',
        name: 'oauth-bind',
        component: () => import('@/views/auth/Bind.vue'),
        meta: {auth: true}
    },
    {
        // `signedInOk`：带着 token 回来也要放行 —— 用户刚刚在 LinuxDo 上点了授权，
        // 这一次授权可能是要换个账号登，把他弹回旧账号的收件箱才是错的
        path: '/oauth/callback',
        name: 'oauth-callback',
        component: () => import('@/views/auth/OauthCallback.vue'),
        meta: {auth: true, signedInOk: true}
    },
    // §5.2 全表最后一行：`/test` 是开发时的草稿页，生产构建里不注册
    ...(import.meta.env.DEV ? [{
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    }] : []),
    {
        // Design System 预览页：P0~P1 的人工过审入口，不读任何用户数据，故不走登录门禁
        path: '/_ds',
        name: 'design-system',
        component: () => import('@/views/design-system/index.vue'),
        meta: {public: true}
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    if (to.meta.public) {
        return next()
    }

    if (!token) {
        // 认证四视图未登录也能进；其余一律弹回登录页
        return to.meta.auth ? next() : next({name: 'login'})
    }

    // 已登录还去认证页：退回来处，直接敲地址进来的（from 没有 name）落到收件箱。
    // 旧代码在这里还有一条 `loadBackground(next)`：登录页要等背景图下载完（超时 3 秒）
    // 才渲染。§5.3.1 把它删了 —— 背景图改由 AuthLayout 自己异步淡入，表单不等图。
    if (to.meta.auth && !to.meta.signedInOk) {
        return next(from.name ? from.path : {name: 'layout'})
    }

    next()

})

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    if (to.meta.menu) {
        if (['content', 'email', 'send'].includes(to.meta.name)) {
            // 旧账号浮层：≥ md 自动展开。`breakpointNow()` 取代旧的 `innerWidth > 767`
            // 硬编码（§4.4 把 19 处 media query 收敛到一处，守卫里也不该再有裸数字）
            uiStore.accountShow = ['md', 'lg', 'xl', '2xl'].includes(breakpointNow())
        } else {
            uiStore.accountShow = false
        }
    }

    // 旧的 `uiStore.asideShow = false`（<1025 收起左滑抽屉）随抽屉一起删了：
    // 侧栏折叠现在由 AppShell 按断点 + 用户偏好决定，asideShow 只是给旧 analysis
    // 图表的「正文区变宽了」信号（AppShell 在折叠态变化时写它），路由不该动它。

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router
