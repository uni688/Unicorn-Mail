/**
 * P4（§5.3.5 / §4.3）：开放 API 的内置描述表。
 *
 * 调试台（从这里生成表单）与文档页（从这里生成接口索引）**同读一份**。分成两份维护的话，
 * 文档上写着的参数在调试台里填不进去，用户会以为是接口坏了。
 *
 * 字段说明：
 * - `scope`  这条接口需要的 scope。与服务端 `const/api-const.js` 的 `apiScopes` 对应；
 *            调试台用它把「当前选中的 Key 没有这个 scope」提前标出来，而不是等 403。
 * - `write`  写操作。调试台对它做二次确认（§4.3「写操作二次确认」）—— `/open/email/send`
 *            点一下就真发信出去了，没有撤回。
 * - `params` 参数表。`in: 'query' | 'body'`；`type` 只用于把输入转成正确的 JSON 类型，
 *            不做校验（服务端才是唯一的校验方，前端拦一遍只会两边规则打架）。
 *
 * 文案不放这里：`label` / `desc` 都是 i18n 键（`openApi.*`），两种语言各自翻译。
 */

/**
 * `/open/*` 的实际基址。
 *
 * 三个页面（Keys 的 cURL 示例、调试台的真实请求、文档页的示例）都要拼它，写三遍必然会
 * 有一处忘记跟着改。**必须**带上 `VITE_BASE_URL` 那一段：`index.js` 只把 `/api/` 前缀的
 * 请求交给 hono（`url.pathname.startsWith('/api/')`），少了它就是 404 —— 也就是说
 * `/open/email/list` 打不通，`/api/open/email/list` 才能。
 *
 * `absolute`：给 cURL / fetch 片段用，必须是能直接粘进终端的完整 URL。发布环境下
 * `VITE_BASE_URL` 是相对的 `/api`，所以补上当前 origin；反代到别的域名时由用户自己换 host
 * （文档页写了这句话）。
 */
export function openApiBase({absolute = false} = {}) {
    const raw = String(import.meta.env.VITE_BASE_URL ?? '/api').replace(/\/+$/, '')
    if (/^https?:\/\//i.test(raw)) {
        return raw
    }
    const path = raw.startsWith('/') ? raw : `/${raw}`
    return absolute ? `${location.origin}${path}` : path
}

/** `/public/*` 的旧接口。文档页要把它们标成 Deprecated 并引导到 `/open/*`（§5.3.5） */
export const legacyEndpoints = [
    {method: 'POST', path: '/public/genToken', replacement: '/open/email/list'},
    {method: 'GET', path: '/public/emailList', replacement: '/open/email/list'},
]

export const openApiEndpoints = [
    {
        id: 'ping',
        method: 'GET',
        path: '/open/ping',
        scope: null,
        write: false,
        params: [],
    },
    {
        id: 'emailList',
        method: 'GET',
        path: '/open/email/list',
        scope: 'email:read',
        write: false,
        params: [
            {name: 'accountId', in: 'query', type: 'number'},
            {name: 'type', in: 'query', type: 'number', placeholder: '0'},
            {name: 'size', in: 'query', type: 'number', placeholder: '20'},
            {name: 'emailId', in: 'query', type: 'number'},
            {name: 'keyword', in: 'query', type: 'string'},
        ],
    },
    {
        id: 'emailDetail',
        method: 'GET',
        path: '/open/email/detail',
        scope: 'email:read',
        write: false,
        params: [
            {name: 'emailId', in: 'query', type: 'number', required: true},
        ],
    },
    {
        id: 'emailCounts',
        method: 'GET',
        path: '/open/email/counts',
        scope: 'email:read',
        write: false,
        params: [
            {name: 'accountId', in: 'query', type: 'number'},
            {name: 'all', in: 'query', type: 'number', placeholder: '1'},
        ],
    },
    {
        id: 'emailSend',
        method: 'POST',
        path: '/open/email/send',
        scope: 'email:send',
        write: true,
        params: [
            {name: 'accountId', in: 'body', type: 'number', required: true},
            {name: 'sendEmail', in: 'body', type: 'string', required: true},
            {name: 'subject', in: 'body', type: 'string'},
            {name: 'content', in: 'body', type: 'string'},
        ],
    },
    {
        id: 'accountList',
        method: 'GET',
        path: '/open/account/list',
        scope: 'account:read',
        write: false,
        params: [
            {name: 'size', in: 'query', type: 'number', placeholder: '20'},
            {name: 'accountId', in: 'query', type: 'number'},
        ],
    },
]

/** 调试台按 scope 分组左侧列表；`null`（探活）单独一组 */
export const openApiScopeGroups = ['email:read', 'email:send', 'account:read', null]

export default {openApiEndpoints, legacyEndpoints, openApiScopeGroups, openApiBase}
