import http from '@/axios/index.js';

/**
 * P4（§5.3.5）：开放 API 的 Key 管理。
 *
 * 路径是动词式（`/apiKey/add|list|setStatus|delete|usage|scopes`）而不是 §10.5 表格里的
 * RESTful 形状 —— 服务端的权限校验是路径前缀匹配，`/apiKey/:id` 那种形状里
 * 「查看」和「删除」分不开。理由写在 `mail-worker/src/api/api-key-api.js` 顶部。
 *
 * 列表/用量带 `config`：页面把失败画进 DataTable 的 error 态，需要 `noMsg: true`
 * 让拦截器别再弹一次 toast（同 `reg-key.js`）。
 */

export function apiKeyList(config = {}) {
    return http.get('/apiKey/list', {...config})
}

/** 返回值里的 `key` 是**唯一一次**能拿到明文的机会（§5.3.5） */
export function apiKeyAdd(form) {
    return http.post('/apiKey/add', form)
}

export function apiKeySetStatus(keyId, status) {
    return http.put('/apiKey/setStatus', {keyId, status})
}

export function apiKeyDelete(keyIds) {
    return http.delete('/apiKey/delete', {params: {keyIds: [].concat(keyIds).join(',')}})
}

export function apiKeyUsage(keyId, config = {}) {
    return http.get('/apiKey/usage', {params: {keyId}, ...config})
}

/**
 * 可选 scope 清单。硬编码在前端等于同一份映射维护两遍 —— 服务端加一个 scope、
 * 前端忘了加，用户就永远勾不到那一项。
 */
export function apiKeyScopes(config = {}) {
    return http.get('/apiKey/scopes', {...config})
}
