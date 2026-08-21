/**
 * useSearchQuery 的解析器单测（§7.5 语法糖）。
 *
 * 只测四个纯函数。`useSearchQuery()` 本体是 route 的薄包装（读 `?q=`、写 `router.replace`），
 * 值全来自这里测过的函数，再挂个 router 只是重测 vue-router。
 *
 * 为什么用动态 import：`toListParams` 要 `utils/day.js`，而那个文件在**模块顶层**
 * `useSettingStore()`（`day.js:6`）。静态 import 会被提升到 `setActivePinia` 之前，
 * 于是 import 阶段就抛 "no active Pinia"。
 */
import {describe, it, expect} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

setActivePinia(createPinia())

const {
    parseQuery, stringifyQuery, toListParams, isEmptyQuery, matchesQuery, EMPTY_QUERY,
} = await import('@/composables/useSearchQuery.js')
const {EmailUnreadEnum} = await import('@/enums/email-enum.js')
const {tzDayjs} = await import('@/utils/day.js')

describe('parseQuery', () => {

    it('纯文本全部进 keyword', () => {
        expect(parseQuery('发票 stripe')).toEqual({...EMPTY_QUERY, keyword: '发票 stripe'})
    })

    it('识别 from/to/subject，剩下的仍是 keyword', () => {
        const q = parseQuery('from:stripe to:a@b.com subject:"8 月 发票" 尾巴')
        expect(q.from).toBe('stripe')
        expect(q.to).toBe('a@b.com')
        expect(q.subject).toBe('8 月 发票')
        expect(q.keyword).toBe('尾巴')
    })

    it('is:/has:/in: 三组开关', () => {
        const q = parseQuery('is:unread is:star has:att has:code in:trash')
        expect(q).toMatchObject({
            unread: true, star: true, hasAtt: true, hasCode: true, folder: 'trash',
        })
    })

    it('is:read 是「已读」而不是「未设置」', () => {
        expect(parseQuery('is:read').unread).toBe(false)
        expect(parseQuery('').unread).toBe(null)
    })

    it('不认识的 key / value 原样退回 keyword，不被吞掉', () => {
        expect(parseQuery('https://a.com/x').keyword).toBe('https://a.com/x')
        expect(parseQuery('is:pinned').keyword).toBe('is:pinned')
        expect(parseQuery('in:archive').keyword).toBe('in:archive')
    })

    it('日期打一半也吃掉，但不生效（边打边解析不能红一片）', () => {
        expect(parseQuery('after:2026-0').after).toBe('')
        expect(parseQuery('after:2026-0').keyword).toBe('')
        expect(parseQuery('after:2026-08-01').after).toBe('2026-08-01')
    })
})

describe('stringifyQuery', () => {

    it('往返收敛：再解析结果一致（漏斗与输入框双向同步靠这条）', () => {
        const src = 'in:trash from:stripe subject:"8 月 发票" has:att is:unread after:2026-08-01 尾巴'
        const once = parseQuery(src)
        expect(parseQuery(stringifyQuery(once))).toEqual(once)
    })

    it('带空格的值补引号，否则再解析会断成两截', () => {
        expect(stringifyQuery({...EMPTY_QUERY, subject: '8 月'})).toBe('subject:"8 月"')
        expect(parseQuery('subject:"8 月"').subject).toBe('8 月')
    })

    it('未设置的条件不出现在结果里', () => {
        expect(stringifyQuery(EMPTY_QUERY)).toBe('')
        expect(stringifyQuery({...EMPTY_QUERY, unread: false})).toBe('is:read')
    })
})

describe('toListParams / isEmptyQuery', () => {

    it('unread 传列值（UNREAD=0 / READ=1），两侧都不做取反', () => {
        expect(toListParams(parseQuery('is:unread')).unread).toBe(EmailUnreadEnum.UNREAD)
        expect(toListParams(parseQuery('is:read')).unread).toBe(EmailUnreadEnum.READ)
        expect('unread' in toListParams(parseQuery('发票'))).toBe(false)
    })

    it('日期转成 UTC 的 YYYY-MM-DD HH:mm:ss，after 取 00:00:00、before 取 23:59:59', () => {
        const p = toListParams(parseQuery('after:2026-08-01 before:2026-08-31'))
        expect(p.startTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
        expect(p.endTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
        expect(p.startTime < p.endTime).toBe(true)
    })

    it('folder 不进 list 参数（它走路由，不是筛选条件）', () => {
        expect(toListParams(parseQuery('in:trash'))).toEqual({})
    })

    it('只有 in: 时算「没在搜」，切文件夹不该进搜索结果视图', () => {
        expect(isEmptyQuery(parseQuery('in:trash'))).toBe(true)
        expect(isEmptyQuery(parseQuery('in:trash 发票'))).toBe(false)
        expect(isEmptyQuery(parseQuery('is:read'))).toBe(false)
    })
})

describe('matchesQuery（本地兜底谓词）', () => {

    const mail = {
        emailId: 1,
        sendEmail: 'billing@stripe.com',
        name: 'Stripe',
        toEmail: 'me@uni.dev',
        subject: '8 月发票',
        text: '本月共计 42 元',
        unread: EmailUnreadEnum.UNREAD,
        isStar: 0,
        attList: [],
        createTime: '2026-08-10 03:00:00',
    }

    it('from 同时看地址和显示名', () => {
        expect(matchesQuery(mail, parseQuery('from:stripe.com'))).toBe(true)
        expect(matchesQuery(mail, parseQuery('from:Stripe'))).toBe(true)
        expect(matchesQuery(mail, parseQuery('from:paypal'))).toBe(false)
    })

    it('关键词覆盖主题 / 发件人 / 收件人 / 正文，大小写无关', () => {
        expect(matchesQuery(mail, parseQuery('BILLING'))).toBe(true)
        expect(matchesQuery(mail, parseQuery('42 元'))).toBe(true)
        expect(matchesQuery(mail, parseQuery('退款'))).toBe(false)
    })

    it('条件之间是 AND', () => {
        expect(matchesQuery(mail, parseQuery('is:unread 发票'))).toBe(true)
        expect(matchesQuery(mail, parseQuery('is:star 发票'))).toBe(false)
        expect(matchesQuery(mail, parseQuery('has:att 发票'))).toBe(false)
    })

    it('日期区间按本地日历日比较，含端点', () => {
        const local = tzDayjs(mail.createTime).format('YYYY-MM-DD')
        expect(matchesQuery(mail, {...EMPTY_QUERY, after: local, before: local})).toBe(true)
        expect(matchesQuery(mail, {...EMPTY_QUERY, after: '2026-09-01'})).toBe(false)
        expect(matchesQuery(mail, {...EMPTY_QUERY, before: '2026-07-01'})).toBe(false)
    })

    it('空查询匹配一切；undefined 邮件不匹配', () => {
        expect(matchesQuery(mail, EMPTY_QUERY)).toBe(true)
        expect(matchesQuery(undefined, parseQuery('发票'))).toBe(false)
    })
})
