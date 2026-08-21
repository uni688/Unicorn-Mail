/**
 * useMailList — 邮件列表的全部逻辑（§10.4：「迁移策略是**先抽逻辑再换视图**：第一步把它拆成
 * `useMailList()` composable（纯逻辑，不动模板），跑通后再替换模板」）。
 *
 * 来源是 `components/email-scroll/index.vue`（1367 行）里的数据部分，逐条对照搬运：
 *
 * | 旧实现                              | 这里                            |
 * |-------------------------------------|---------------------------------|
 * | `getEmailList(refresh)` :810        | `load({refresh})`               |
 * | `handleList(list)` :873             | `decorate(list)`                |
 * | `addItem(email)` :726               | `addItem(email)`                |
 * | `deleteEmail(ids)` :713             | `removeIds(ids)`                |
 * | `starChange(email)` :585            | `toggleStar(email)`             |
 * | `localRead(ids)` :627               | `localUnread(ids, value)`       |
 * | `onMounted` 60s 相对时间刷新 :365   | 同（在这里 onUnmounted 清掉）   |
 * | `watch(emailStore.deleteIds …)` :461| `syncStore` 开关下的三个 watch  |
 *
 * 与旧实现的差异（都是修 bug / 补 §10.4 验收，不是改行为）：
 *   1. 加了请求代号 `seq`：切邮箱或刷新后，旧请求的响应不再回填到新列表（旧实现只有
 *      `reqLock`，`views/email/index.vue:102` 得在外面自己比对 accountId）。
 *   2. 删除后 `total` 递减（旧实现不减，头部「共 N 封」会一直偏大到下次刷新）。
 *   3. 请求失败落到 `error`，交给 ErrorState 渲染；旧实现没有 catch，靠 axios 拦截器弹提示。
 *   4. 丢掉了旧实现里写了但没人读的 `email.test = t('received')`。
 *   5. `refresh()` 能抢占在飞的请求（旧实现的 `reqLock` 会把它整个丢掉，于是「切邮箱没反应、
 *      过一会儿旧邮箱的数据反而填进来」）；`reqLock` 的释放也按请求代号判定归属。
 *
 * 选中态不在这里 —— §7.4 要求「与路由无关的本地 Set」，见 `useSelection()`。
 * 虚拟滚动也不在这里，见 `useVirtualRows()`。
 */
import {computed, onMounted, onUnmounted, reactive, ref, toValue, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useEmailStore} from '@/store/email.js'
import {fromNow} from '@/utils/day.js'
import {dateGroupOf, htmlToText} from '@/utils/mail-format.js'
import {EmailUnreadEnum} from '@/enums/email-enum.js'
import {sleep} from '@/utils/time-utils.js'

/** 虚拟列表里的行类型（§7.4：分组头是一种行，不是 sticky） */
export const ROW = {GROUP: 'group', MAIL: 'mail', LOADING: 'loading', END: 'end'}

/** 发信状态图标表，原样搬自 `email-scroll` :878-887 */
function statusIconMap(t) {
    return {
        0: {icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received')},
        1: {icon: 'bi:send-arrow-up-fill', color: '#51C76B', content: t('sent')},
        2: {icon: 'bi:send-check-fill', color: '#51C76B', content: t('delivered')},
        3: {icon: 'bi:send-x-fill', color: '#F56C6C', content: t('bounced')},
        4: {icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained')},
        5: {icon: 'bi:send-arrow-up-fill', color: '#FBBD08', content: t('delayed')},
        7: {icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient')},
        8: {icon: 'bi:send-x-fill', color: '#F56C6C', content: t('bounced')},
    }
}

export function useMailList(options = {}) {

    const {
        fetch,
        size = 50,
        /** 时间排序：0 = 新的在上（默认），1 = 旧的在上。可以传 ref / getter */
        sort = 0,
        grouped = true,
        syncStore = true,
        starAdd,
        starCancel,
        onStarAdd,
        onStarCancel,
        minLatency = 300,
    } = options

    const {t, locale} = useI18n()
    const emailStore = useEmailStore()

    /** 已加载的邮件（保持后端返回顺序，游标分页只会往后追加） */
    const mails = reactive([])
    const total = ref(0)
    /** 首屏或刷新：整块骨架 */
    const loading = ref(false)
    /** 翻页：列表尾部一行骨架 */
    const followLoading = ref(false)
    /** 没有更多了：列表尾部「没有更多」 */
    const noLoading = ref(false)
    const firstLoad = ref(true)
    const latestEmail = ref(null)
    const error = ref(null)

    let reqLock = false
    let seq = 0
    let timer = null

    /* ---------------------------------------------------------------- 装饰 */

    function decorate(list) {
        const icons = statusIconMap(t)
        list.forEach(email => {
            email.formatText = htmlToText(email)
            email.formatCreateTime = fromNow(email.createTime)
            const group = dateGroupOf(email.createTime, locale.value)
            email.groupKey = group.key
            email.groupKind = group.kind
            email.groupLabel = group.label
            if (email.isDel) {
                email.isDelContent = t('selectDeleted')
            }
            email.statusIcon = icons[email.status]
        })
        return list
    }

    /** 分组头文案在渲染期算，切语言才能跟着变 */
    function groupTitle(email) {
        if (email.groupKind === 'today') return t('mail.today')
        if (email.groupKind === 'yesterday') return t('mail.yesterday')
        return email.groupLabel
    }

    /**
     * 展平成虚拟列表的行。分组头与哨兵行都是行，`useVirtualRows()` 按 kind 取高度。
     */
    const rows = computed(() => {
        const out = []
        let lastKey = null

        for (const email of mails) {
            if (grouped && email.groupKey !== lastKey) {
                lastKey = email.groupKey
                out.push({kind: ROW.GROUP, key: `g:${email.groupKey}`, title: groupTitle(email)})
            }
            out.push({kind: ROW.MAIL, key: `m:${email.emailId}`, email})
        }

        if (followLoading.value) {
            out.push({kind: ROW.LOADING, key: 'sentinel:loading'})
        } else if (noLoading.value && mails.length > 0) {
            out.push({kind: ROW.END, key: 'sentinel:end'})
        }

        return out
    })

    /* ---------------------------------------------------------------- 取数 */

    /**
     * 游标分页。cursor 用「已加载的最后一条 emailId」，refresh 时归 0。
     *
     * 首屏若快于 minLatency 就补齐到 300ms —— 旧实现 :842 就这么做的，为的是骨架不闪一下
     * 就消失（比闪一下更难看的是没有骨架直接跳内容）。
     */
    async function load({refresh = false} = {}) {

        // refresh 必须能抢占：切邮箱 / 改排序时上一页可能还在飞，挡掉它就等于「切了没反应」，
        // 而那个在飞的请求属于旧上下文，它的响应会被下面的 seq 判定作废。
        if (reqLock && !refresh) return null

        if (!refresh && (loading.value || noLoading.value)) return null

        reqLock = true

        const cursor = refresh || mails.length === 0 ? 0 : mails.at(-1).emailId

        if (refresh || mails.length === 0) {
            loading.value = true
        } else {
            followLoading.value = true
        }

        const mySeq = ++seq
        const start = Date.now()

        try {
            const data = await fetch(cursor, size) ?? {}

            if (mySeq !== seq) return null

            const spent = Date.now() - start
            if (!cursor && spent < minLatency) {
                await sleep(minLatency - spent)
                if (mySeq !== seq) return null
            }

            const list = decorate([...(data.list ?? [])])

            if (refresh) {
                mails.length = 0
            }

            if ('latestEmail' in data) {
                latestEmail.value = data.latestEmail
            }

            mails.push(...list)
            noLoading.value = list.length < size
            followLoading.value = list.length >= size
            total.value = Number.isFinite(Number(data.total)) ? Number(data.total) : mails.length
            error.value = null
            return list

        } catch (e) {
            if (mySeq === seq) {
                error.value = e
                followLoading.value = false
            }
            return null
        } finally {
            // 被抢占的旧请求不能解锁新请求的门，所以 reqLock 也按 seq 判定归属
            if (mySeq === seq) {
                loading.value = false
                firstLoad.value = false
                reqLock = false
            }
        }
    }

    /** 头部刷新按钮 / 切邮箱 / 改排序都走这里 */
    function refresh() {
        noLoading.value = false
        return load({refresh: true})
    }

    /** 滚到底触发 */
    function loadMore() {
        return load()
    }

    /* ------------------------------------------------------------ 局部改动 */

    /**
     * 长轮询 `/email/latest` 拿到的新邮件插进列表（旧实现 :726）。
     * 返回 false 表示这封已经在列表里，调用方据此跳过动画与计数。
     *
     * 旧实现这里传的是 `fromNow(email.formatCreateTime)` —— 那个字段此刻还不存在，dayjs 拿
     * undefined 当「现在」，新邮件恰好显示「几秒前」所以没人发现。这里改成走 decorate()。
     */
    function addItem(email) {

        if (mails.some(item => item.emailId === email.emailId)) return false

        decorate([email])

        const appendOnly = Number(toValue(sort)) === 1
        const insertAt = appendOnly ? -1 : mails.findIndex(item => item.emailId < email.emailId)

        if (insertAt > -1) {
            mails.splice(insertAt, 0, email)
        } else if (noLoading.value) {
            // 尾部这一页已经加载完，直接追加；否则等翻页时后端自然会带出来
            mails.push(email)
        }

        if (email.emailId > (latestEmail.value?.emailId ?? 0)) {
            latestEmail.value = email
        }

        total.value++
        return true
    }

    /** 删除 / 还原后从列表里摘掉；摘完不足一页且还有后续，顺手补一页（旧实现 :721） */
    function removeIds(emailIds) {

        const ids = new Set((Array.isArray(emailIds) ? emailIds : [emailIds]).map(Number))
        let removed = 0

        for (let i = mails.length - 1; i >= 0; i--) {
            if (ids.has(mails[i].emailId)) {
                mails.splice(i, 1)
                removed++
            }
        }

        if (removed) {
            total.value = Math.max(0, total.value - removed)
        }

        if (mails.length < size && !noLoading.value) {
            load()
        }

        return removed
    }

    /** 星标乐观切换：先翻界面，失败翻回来（旧实现 :585） */
    async function toggleStar(email) {

        const next = email.isStar ? 0 : 1
        email.isStar = next

        try {
            if (next) {
                await starAdd?.(email.emailId)
                onStarAdd?.(email)
            } else {
                await starCancel?.(email.emailId)
                onStarCancel?.(email)
            }
            return true
        } catch (e) {
            console.error(e)
            email.isStar = next ? 0 : 1
            return false
        }
    }

    /** 本地已读 / 未读翻转，请求由调用方（useOptimistic）负责 */
    function localUnread(emailIds, unread = EmailUnreadEnum.READ) {
        const ids = new Set((Array.isArray(emailIds) ? emailIds : [emailIds]).map(Number))
        mails.forEach(email => {
            if (ids.has(email.emailId)) email.unread = unread
        })
    }

    /** 星标状态跨视图同步用 */
    function localStar(emailId, isStar) {
        mails.forEach(email => {
            if (email.emailId === Number(emailId)) email.isStar = isStar
        })
    }

    /* ------------------------------------------------------- 跨视图同步 / 计时 */

    if (syncStore) {
        // 阅读窗格删除、其它列表删除，都通过 emailStore 广播（旧实现 :461-481）
        watch(() => emailStore.deleteIds, ids => {
            if (ids) removeIds(ids)
        })
        watch(() => emailStore.cancelStarEmailId, id => {
            if (id) localStar(id, 0)
        })
        watch(() => emailStore.addStarEmailId, id => {
            if (id) localStar(id, 1)
        })
    }

    onMounted(() => {
        // 相对时间每分钟走一格（旧实现 :365）
        timer = setInterval(() => {
            mails.forEach(email => {
                email.formatCreateTime = fromNow(email.createTime)
            })
        }, 60 * 1000)
    })

    onUnmounted(() => {
        clearInterval(timer)
        timer = null
        // 卸载后仍在飞的请求不再回填
        seq++
    })

    return {
        mails, total, loading, followLoading, noLoading, firstLoad, latestEmail, error, rows,
        load, refresh, loadMore,
        addItem, removeIds, toggleStar, localUnread, localStar,
        decorate, groupTitle,
    }
}
