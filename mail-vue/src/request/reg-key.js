import http from '@/axios/index.js';

/**
 * 列表与使用记录多带一个 `config`：管理页把失败画进 DataTable 的 error 态，
 * 需要 `noMsg: true` 让拦截器别再弹一次 toast（见 `axios/index.js`）。
 */
export function regKeyList(params, config = {}) {
    return http.get('/regKey/list', {params: {...params}, ...config})
}

export function regKeyAdd(form) {
    return http.post('/regKey/add',form)
}

export function regKeyDelete(regKeyIds) {
    return http.delete('/regKey/delete?regKeyIds='+ regKeyIds)
}

export function regKeyClearNotUse() {
    return http.delete('/regKey/clearNotUse')
}

export function regKeyHistory(regKeyId, config = {}) {
    return http.get('/regKey/history', {params: {regKeyId}, ...config})
}
