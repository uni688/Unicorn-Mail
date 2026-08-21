import http from '@/axios/index.js'

export function accountList(accountId, size, lastSort) {
    return http.get('/account/list', {params: {accountId, size, lastSort}});
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

export function accountSetAllReceive(accountId) {
    return http.put('/account/setAllReceive', {accountId})
}

export function accountSetAsTop(accountId) {
    return http.put('/account/setAsTop', {accountId})
}

/**
 * P3 增量 6（§10.5）：MailboxPicker 的服务端搜索。/account/list 是纯游标分页没有 keyword，
 * 200+ 邮箱时不可能全量拉下来在前端 filter。
 *
 * signal 走 AbortController —— Picker 输入框 120ms 防抖后仍可能连发，旧请求必须能取消；
 * 因此这里必须 noMsg，否则取消产生的 CanceledError 会被 axios 拦截器当成网络错误弹提示。
 */
export function accountSearch(keyword, size, signal) {
    return http.get('/account/search', {params: {keyword, size}, signal, noMsg: true})
}