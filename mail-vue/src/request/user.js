import http from '@/axios/index.js'


/**
 * 列表与邮箱列表多带一个 `config`：管理页把失败画进 DataTable 的 error 态，
 * 需要 `noMsg: true` 让拦截器别再弹一次 toast（见 `axios/index.js`）。
 */
export function userList(params, config = {}) {
    return http.get('/user/list', {...config, params: {...params}})
}

export function userSetPwd(params) {
    return http.put('/user/setPwd', params)
}

export function userSetStatus(params) {
    return http.put('/user/setStatus', params)
}

export function userSetType(params) {
    return http.put('/user/setType', params)
}


export function userDelete(userIds) {
    return http.delete('/user/delete', {params:{userIds: userIds + ''}})
}

export function userAdd(form) {
    return http.post('/user/add', form)
}

export function userRestSendCount(userId) {
    return http.put('/user/resetSendCount', {userId})
}

export function userRestore(userId,type) {
    return http.put('/user/restore', {userId,type})
}

export function userAllAccount(userId, num, size, config = {}) {
    return http.get('/user/allAccount', {...config, params: {userId, num, size}})
}

export function userDeleteAccount(accountId) {
    return http.delete('/user/deleteAccount', {params:{accountId}})
}
