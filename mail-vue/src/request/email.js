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
 * 物理删除。不传 emailIds = 清空整个回收站，后端会重新按 userId + is_del 取一遍 id，
 * 前端传什么都越不出自己的回收站。
 */
export function emailPurge(emailIds) {
    return http.delete('/email/purge', {params: emailIds ? {emailIds: String(emailIds)} : {}})
}

/** 标记未读（既有的 /email/read 是单向的） */
export function emailUnread(emailIds) {
    return http.put('/email/unread', {emailIds})
}