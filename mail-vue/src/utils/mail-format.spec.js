/**
 * mail-format 单测。`cleanSpace` / `htmlToText` 是从 `email-scroll:554-583` 原样搬来的，
 * 所以这里测的是「搬家没搬错」；`dateGroupOf` 是新写的，测分组 key 与标签种类。
 *
 * 动态 import 的原因同 useSearchQuery.spec：`utils/day.js` 顶层就 `useSettingStore()`。
 */
import {describe, it, expect} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

setActivePinia(createPinia())

const {cleanSpace, htmlToText, dateGroupOf} = await import('@/utils/mail-format.js')
const {tzDayjs} = await import('@/utils/day.js')

describe('cleanSpace', () => {

    it('压缩连续空白并去首尾', () => {
        expect(cleanSpace('  a \n\t b  ')).toBe('a b')
    })

    it('删掉零宽 / 不可见字符（用码点构造，源码里不留隐形字符）', () => {
        const zw = ['200B', '200C', '200D', 'FEFF', '034F', '00AD']
            .map(hex => String.fromCharCode(parseInt(hex, 16))).join('')
        expect(cleanSpace(`a${zw}b`)).toBe('ab')
    })

    it('U+00A0 / U+3000 也在删除表里（沿用旧实现的字符表，不是当空白压缩）', () => {
        const nbsp = String.fromCharCode(0xA0)
        const ideographic = String.fromCharCode(0x3000)
        expect(cleanSpace(`a${nbsp}${ideographic}b`)).toBe('ab')
    })
})

describe('htmlToText', () => {

    it('优先用 content，剥掉 script/style/title 的内容', () => {
        const email = {content: '<style>.a{color:red}</style><p>正文</p><script>x=1</script>'}
        expect(htmlToText(email)).toBe('正文')
    })

    it('媒体标签不出现在摘要里', () => {
        const email = {content: '<p>看图</p><img src="https://evil.example/a.png">'}
        expect(htmlToText(email)).toBe('看图')
    })

    /**
     * P4 验收时在真浏览器里实测的存储型 XSS：旧实现把正文写进 `document.createElement('div')`
     * 的 innerHTML，游离节点照样加载 `<img>` 并执行 onerror —— 收件箱一刷新就跑。
     * jsdom 不加载资源，没法让 onerror 真的触发，所以这里钉的是「不变量」：
     * 不可信的正文**永远不会**被写进活文档里任何元素的 innerHTML。
     */
    it('不可信正文绝不写进活文档的 innerHTML（只进 DOMParser 的惰性文档）', () => {
        const payload = '<im<img>g src=x onerror="alert(1)"><details open ontoggle="alert(2)"></details><p>摘要</p>'
        const original = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
        const writes = []
        Object.defineProperty(Element.prototype, 'innerHTML', {
            ...original,
            set(value) {
                if (this.ownerDocument === document) writes.push(String(value))
                original.set.call(this, value)
            },
        })
        try {
            expect(htmlToText({content: payload})).toContain('摘要')
        } finally {
            Object.defineProperty(Element.prototype, 'innerHTML', original)
        }
        expect(writes.filter(v => v.includes('onerror') || v.includes('ontoggle'))).toEqual([])
    })

    it('没有 content 才退回 text；两者都没有返回空串', () => {
        expect(htmlToText({text: '  纯文本  '})).toBe('纯文本')
        expect(htmlToText({content: '<p>H</p>', text: 'T'})).toBe('H')
        expect(htmlToText({})).toBe('')
    })
})

describe('dateGroupOf', () => {

    /** 用「相对今天」的时间造样本，避免固定日期在某天变成昨天 */
    const iso = offsetDays => tzDayjs(new Date().toISOString())
        .subtract(offsetDays, 'day').utc().format('YYYY-MM-DD HH:mm:ss')

    it('今天 / 昨天有专门的 kind，label 交给调用方翻译', () => {
        expect(dateGroupOf(iso(0)).kind).toBe('today')
        expect(dateGroupOf(iso(1)).kind).toBe('yesterday')
        expect(dateGroupOf(iso(0)).label).toBe('')
    })

    it('更早的日期 kind=date，label 按语言给出（同年不带年份）', () => {
        const zh = dateGroupOf(iso(10), 'zh')
        const en = dateGroupOf(iso(10), 'en')
        expect(zh.kind).toBe('date')
        expect(zh.label).toMatch(/^\d{1,2}月\d{1,2}日$/)
        expect(en.label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
    })

    it('key 是稳定的本地日历日，同一天的两封归一组', () => {
        const a = dateGroupOf(iso(3))
        const b = dateGroupOf(iso(3))
        expect(a.key).toBe(b.key)
        expect(a.key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(dateGroupOf(iso(4)).key).not.toBe(a.key)
    })

    it('时间不可用时给 unknown，不抛错（旧列表见过 createTime 缺失）', () => {
        expect(dateGroupOf(undefined).key).toBe('unknown')
        expect(dateGroupOf('not-a-date').key).toBe('unknown')
    })
})
