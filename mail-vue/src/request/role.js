import http from '@/axios/index.js';

export function roleAdd(params) {
    return http.post('/role/add',params)
}

/**
 * 权限树与身份列表多带一个 `config`：管理页把失败画进 DataTable 的 error 态，
 * 需要 `noMsg: true` 让拦截器别再弹一次 toast（见 `axios/index.js`）。
 */
export function rolePermTree(config = {}) {
    return http.get('/role/tree', config)
}

export function roleRoleList(config = {}) {
    return http.get('/role/list', config)
}

export function roleSet(params) {
    return http.put('/role/set',params)
}

export function roleDelete(roleId) {
    return http.delete('/role/delete',{params:{roleId}})
}

export function roleSetDef(roleId) {
    return http.put('/role/setDefault',{roleId})
}


export function roleSelectUse() {
    return http.get('/role/selectUse')
}
