import http from "@/axios/index.js";

export function starAdd(emailId) {
    return http.post('/star/add', {emailId})
}

export function starCancel(emailId) {
    return http.delete('/star/cancel', {params: {emailId}})
}

/** 星标列表。`search` 是 `useSearchQuery().listParams`，与 `/email/list` 同一套过滤参数 */
export function starList(emailId, size, search = {}) {
    return http.get('/star/list', {params: {emailId, size, ...search}})
}