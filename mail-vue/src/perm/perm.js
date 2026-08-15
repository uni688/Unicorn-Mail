import {useUserStore} from "@/store/user.js";

/**
 * 未登录时 `userStore.user` 是 `{}`，`loginUserInfo()` 失败时也停在 `{}`（`init/init.js`
 * 把异常吞掉了）。P2 之后有公开路由会渲染带权限判定的壳零件（`/_ds` 上的 CommandBar /
 * MiniQuota / ShortcutsDialog），直接解构 `permKeys` 会在那里抛 TypeError 白屏。
 * 拿不到权限表就等于「什么都没有权限」—— 这是唯一安全的默认值。
 */
function readPermKeys() {
    const permKeys = useUserStore().user?.permKeys;
    return Array.isArray(permKeys) ? permKeys : [];
}

export default {
    mounted(el, binding) {
        const permKeys = readPermKeys();
        const value = binding.value;

        if (permKeys.includes('*')) {
            return;
        }

        const hasPermission = Array.isArray(value)
            ? value.some(key => permKeys.includes(key))
            : permKeys.includes(value);

        if (!hasPermission) {
            el.parentNode && el.parentNode.removeChild(el);
        }
    }
}

export function hasPerm(permKey) {
    const permKeys = readPermKeys();
    return permKeys.includes('*') || permKeys.includes(permKey);
}


/**
 * 权限键 → 动态路由。§5.2「`permsToRouter()` 的映射关系不变，只改目标 path」，
 * 所以 P2 只重写了 path，权限键、路由名、组件、meta 一个都没动。
 *
 * 每条权限还会额外注入一个旧路径的 `redirect` 别名（§5.2「旧路径全部保留为
 * redirect 别名」）。别名必须**跟着权限注入**而不是静态注册：没有 `analysis:query`
 * 的用户访问 `/analysis` 时，静态别名会重定向到一个当前不存在的目标，
 * vue-router 对解析不到的 redirect 是抛错而不是落 404。
 */
export function permsToRouter(permKeys) {
    const routerList = []
    Object.keys(routers).forEach(perm => {
        if (permKeys.includes(perm) || permKeys.includes('*')) {
            routerList.push(...routers[perm])
            routerList.push(...legacyRedirects(perm))
        }
    })
    return routerList;
}

/** 旧路径 → 新路由名，按权限分组 */
const legacyPaths = {
    'email:send': [['/sent', 'send'], ['/drafts', 'draft']],
    'user:query': [['/all-users', 'user']],
    'role:query': [['/role', 'role']],
    'setting:query': [['/system-setting', 'sys-setting']],
    'reg-key:query': [['/invite-code', 'reg-key']],
    'all-email:query': [['/all-mail', 'all-email']],
    'analysis:query': [['/analysis', 'analysis']],
}

/** 别名路由：没有 component、没有 name、没有 meta —— 它不是页面，不该进菜单或命令面板 */
function legacyRedirects(perm) {
    return (legacyPaths[perm] ?? []).map(([path, name]) => ({path, redirect: {name}}))
}

const routers = {
    'email:send': [
        {
            path: '/mail/sent',
            name: 'send',
            component: () => import('@/views/send/index.vue'),
            meta: {
                title: 'sent',
                name: 'send',
                menu: true,
                // mail: 邮件视图（CommandBar 只在这类路由上出现，见 router/index.js）
                mail: true
            }
        },
        {
            path: '/mail/drafts',
            name: 'draft',
            component: () => import('@/views/draft/index.vue'),
            meta: {
                title: 'drafts',
                name: 'draft',
                menu: true,
                mail: true
            }
        }
    ],
    'user:query': [{
        path: '/settings/admin/users',
        name: 'user',
        component: () => import('@/views/user/index.vue'),
        meta: {
            title: 'allUsers',
            name: 'user',
            menu: true
        }
    }],
    'role:query': [{
        path: '/settings/admin/roles',
        name: 'role',
        component: () => import('@/views/role/index.vue'),
        meta: {
            title: 'permissions',
            name: 'role',
            menu: true
        }
    }],
    'setting:query': [{
        // §5.2 的 `/settings/admin/system/:section`（9 个 section）要等 P4 拆卡片，
        // 现在仍是那一整页 2015 行，所以先只占住 `:section` 之前的这一段
        path: '/settings/admin/system',
        name: 'sys-setting',
        component: () => import('@/views/sys-setting/index.vue'),
        meta: {
            title: 'SystemSettings',
            name: 'sys-setting',
            menu: true
        }
    }],
    'reg-key:query': [{
        path: '/settings/admin/invites',
        name: 'reg-key',
        component: () => import('@/views/reg-key/index.vue'),
        meta: {
            title: 'inviteCode',
            name: 'reg-key',
            menu: true
        }
    }],
    'all-email:query': [{
        path: '/settings/admin/mail',
        name: 'all-email',
        component: () => import('@/views/all-email/index.vue'),
        meta: {
            title: 'allMail',
            name: 'all-email',
            menu: true
        }
    }],
    'analysis:query': [{
        path: '/settings/admin/overview',
        name: 'analysis',
        component: () => import('@/views/analysis/index.vue'),
        meta: {
            title: 'analytics',
            name: 'analysis',
            menu: true
        }
    }]
}