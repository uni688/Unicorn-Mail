import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

/* ------------------------------------------------------------------ P3 增量（§10.5）
 * 对应后端 mail-worker/src/api/email-api.js 里新增的五条路由。上面既有的五个函数一个没动，
 * 参数顺序也保持「位置参数」的老风格，方便和 emailList 混用。
 */

/**
 * 侧栏 / Picker 角标。三种互斥模式：
 *   emailCounts({accountId})   单邮箱（后端会按 allReceive 自动放开范围）
 *   emailCounts({all: 1})      全部邮箱聚合
 *   emailCounts({accountIds})  '1,2,3' 批量未读数，只回 {unreadMap}
 * 角标是「顺带信息」，请求失败不该弹提示，所以统一 noMsg。
 */
export function emailCounts(params) {
    return http.get('/email/counts', {params, noMsg: true})
}

/** 回收站列表。游标分页与 /email/list 同构（emailId 为上一页最后一条的 id） */
export function emailTrashList(accountId, allReceive, emailId, size, type) {
    return http.get('/email/trash', {params: {accountId, allReceive, emailId, size, type}})
}

/** 回收站还原（逻辑删除回滚），也是删除 Toast 里「撤销」按钮走的接口 */
export function emailRestore(emailIds) {
    return http.put('/email/restore', {emailIds})
}

/**
 * 物理删除指定的邮件。
 *
 * 空 id **不会**变成「清空回收站」：`String([]) === ''`，从前这里发出去的是
 * `?emailIds=`，后端当作「没传 id」→ 清空整个回收站（含 R2 附件，不可恢复）。
 * 现在传不出合法 id 就直接不发请求，「清空回收站」由 `emailPurgeAll()` 显式表达。
 */
export function emailPurge(emailIds) {
    const ids = [...new Set((Array.isArray(emailIds) ? emailIds : [emailIds])
        .map(Number)
        .filter(id => Number.isInteger(id) && id > 0))]
    if (ids.length === 0) return Promise.resolve()
    return http.delete('/email/purge', {params: {emailIds: ids.join(',')}})
}

/** 清空整个回收站。`all=1` 是唯一能触发全量物理删除的写法，必须由调用方显式说出口 */
export function emailPurgeAll() {
    return http.delete('/email/purge', {params: {all: 1}})
}

/** 标记未读（既有的 /email/read 是单向的） */
export function emailUnread(emailIds) {
    return http.put('/email/unread', {emailIds})
}