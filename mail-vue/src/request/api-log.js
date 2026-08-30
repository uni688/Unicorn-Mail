import http from '@/axios/index.js';

/**
 * P4（§4.3）：开放 API 的请求日志。
 *
 * 分页是**游标**（`logId` = 上一页最后一条），不是页码：日志表在持续写入，
 * offset 分页翻页期间头部插了新行就会漏行/重行。第一页额外带回 `stats`
 * （当前筛选条件下的 2xx/4xx/5xx），后续页 `stats` 为 null。
 */

export function apiLogList(params, config = {}) {
    return http.get('/apiLog/list', {params: {...params}, ...config})
}

/** Key 名称字典（含已软删的 Key，否则历史日志会显示成孤儿 id） */
export function apiLogKeys(config = {}) {
    return http.get('/apiLog/keys', {...config})
}
