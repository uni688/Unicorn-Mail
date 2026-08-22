import axios from "axios";
import router from "@/router";
import i18n from "@/i18n/index.js";
import {useSettingStore} from "@/store/setting.js";

/**
 * 掉线（401）。`@/utils/session.js` 会拉到 `useCounts` → `@/request/email.js`
 * → 又回到本文件，静态 import 会形成环；所以这里用**动态** import，
 * 只在真的 401 时才把那条链加载进来。
 *
 * token 先同步删掉：动态 import 落地要等一个 microtask，这期间发出去的请求不该再带上它。
 */
function dropSession() {
    try {
        localStorage.removeItem('token')
    } catch { /* 隐私模式 */ }
    import('@/utils/session.js')
        .then(({endSession}) => endSession({keepToken: true}))
        .catch(() => {
            router.replace('/login')
        })
}

/**
 * HTTP 层 403（不是业务 code 403）：Cloudflare 的 WAF / Access 挡下来的请求。
 *
 * 从前这里 `location.reload(); return;` 有两个问题：
 * 1. `return undefined` 让**被拒绝的请求变成 resolved undefined**，
 *    调用方的 `.then(data => data.list)` 会以 TypeError 收场，而不是走 `.catch`；
 * 2. 如果 403 是稳定的（比如 IP 被规则挡住），reload 之后首屏请求再 403 → 再 reload，
 *    页面进入无限刷新，用户连报错都看不见。
 *
 * 现在：一次会话最多自动刷一次（`sessionStorage` 哨兵），并且**永远**把 error 抛回去。
 */
const RELOAD_KEY = 'um-403-reloaded'

function reloadOnceFor403() {
    try {
        if (sessionStorage.getItem(RELOAD_KEY)) return false
        sessionStorage.setItem(RELOAD_KEY, '1')
    } catch {
        return false
    }
    location.reload()
    return true
}

let http = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL
});

http.interceptors.request.use(config => {
    const { lang } = useSettingStore();
    config.headers.Authorization = `${localStorage.getItem('token')}`
    config.headers['accept-language'] = lang
    return config
})

http.interceptors.response.use((res) => {

        // 请求通了就把「已自动刷新过」的哨兵撤掉：下一次真 403 还允许刷一次
        try {
            sessionStorage.removeItem(RELOAD_KEY)
        } catch { /* 同上 */ }

        return new Promise((resolve, reject) => {

            const noMsg = res.config.noMsg;
            const data = res.data

            if (noMsg) {

                data.code === 200 ? resolve(data.data) : reject(data)

            } else if (data.code === 401) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                dropSession()
                reject(data)
            } else if (data.code === 403) {
                ElMessage({
                    message: data.message,
                    type: 'warning',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)

            } else if (data.code === 502) {
                ElMessage({
                    dangerouslyUseHTMLString: true,
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            } else if (data.code !== 200) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            }
            resolve(data.data)
        })
    },
    (error) => {

        if (error.status === 403 || error.response?.status === 403) {
            // 刷新已经发起时不必再弹提示（页面马上就没了），但 reject 一定要给出去
            if (reloadOnceFor403()) return Promise.reject(error)
        }

        const noMsg = error.config?.noMsg;

        if (noMsg) {
            return Promise.reject(error)
        } else if (error.message.includes('Network Error')) {
            ElMessage({
                message: i18n.global.t('networkErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.code === 'ECONNABORTED') {
            ElMessage({
                message: i18n.global.t('timeoutErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true
            })
            ElMessage.error('')
        } else if (error.response) {
            ElMessage({
                message: i18n.global.t('serverBusyErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else {
            ElMessage({
                message: i18n.global.t('reqFailErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        }
        return Promise.reject(error)
    })

export default http


