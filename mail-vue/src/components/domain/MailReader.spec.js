/**
 * MailReader 单测（§7.5 / §7.6）。
 *
 * 重点是安全那一半：正文必须**先净化**（内联事件处理器不能留）、远程图片默认屏蔽并给出
 * 「已屏蔽 N 张」的出口、本站 R2 域名的内嵌图不算远程。`sanitizeEmailHtml` 自己有单测，
 * 这里测的是「窗格有没有正确地用它」。
 *
 * Shadow DOM 里的内容用 `shadowRoot.innerHTML` 断言：`wrapper.html()` 看不进影子树。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

setActivePinia(createPinia())

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${params.n}` : key), locale: ref('zh')}),
}))

const MailReader = (await import('./MailReader.vue')).default
const {useSettingStore} = await import('@/store/setting.js')
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')

const mail = (extra = {}) => ({
    emailId: 7,
    name: 'Stripe',
    sendEmail: 'billing@stripe.com',
    toEmail: 'me@uni.dev',
    subject: '8 月发票',
    text: '纯文本兜底',
    createTime: '2026-08-20 03:00:00',
    unread: 0,
    isStar: 0,
    status: 0,
    attList: [],
    ...extra,
})

let wrapper

beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useMailPrefs().resetPrefs()
    useSettingStore().settings = {r2Domain: 'cdn.uni.dev'}
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

const mountReader = (props = {}) => {
    wrapper = mount(MailReader, {props: {email: mail(), ...props}, attachTo: document.body})
    return wrapper
}

/** 正文在 shadow root 里，`wrapper.html()` 看不进去；找挂了影子树的那个宿主 */
const bodyHtml = () => {
    const host = [...wrapper.element.querySelectorAll('*')].find((el) => el.shadowRoot)
    return host?.shadowRoot?.innerHTML ?? ''
}

describe('MailReader · 空态与信头', () => {

    it('没选邮件时画空状态', () => {
        mountReader({email: null})
        expect(wrapper.text()).toContain('mail.noSelection')
    })

    it('主题 / 发件人 / 收件人 / 绝对时间都在', () => {
        mountReader()
        const text = wrapper.text()
        expect(text).toContain('8 月发票')
        expect(text).toContain('billing@stripe.com')
        expect(text).toContain('me@uni.dev')
        expect(wrapper.find('time').text()).toBeTruthy()
    })

    it('recipient 是 JSON 数组时解析出地址；坏数据原样显示', () => {
        mountReader({email: mail({recipient: '[{"address":"a@b.com"},{"address":"c@d.com"}]'})})
        expect(wrapper.text()).toContain('a@b.com, c@d.com')

        wrapper.unmount()
        mountReader({email: mail({recipient: '不是 JSON'})})
        expect(wrapper.text()).toContain('不是 JSON')
    })

    it('发信失败 / 投诉 / 延迟各有一条提示', () => {
        mountReader({email: mail({status: 3, message: '收件人不存在'})})
        expect(wrapper.text()).toContain('收件人不存在')

        wrapper.unmount()
        mountReader({email: mail({status: 4})})
        expect(wrapper.text()).toContain('complained')
    })

    it('没有 HTML 正文时退回纯文本（pre 保留换行）', () => {
        mountReader()
        expect(wrapper.find('pre').text()).toBe('纯文本兜底')
    })
})

describe('MailReader · 正文安全（§7.6）', () => {

    it('内联事件处理器与 script 不会进 shadow root', async () => {
        mountReader({
            email: mail({content: '<p onclick="alert(1)">正文</p><script>alert(2)</script>'}),
        })
        await nextTick()
        const html = bodyHtml()
        expect(html).toContain('正文')
        expect(html.toLowerCase()).not.toContain('onclick')
        expect(html).not.toContain('<script')
    })

    it('远程图片默认屏蔽，横幅给出「已屏蔽 N 张」与两个出口', async () => {
        mountReader({email: mail({content: '<img src="https://track.example/a.gif"><img src="https://track.example/b.gif">'})})
        await nextTick()
        expect(wrapper.text()).toContain('mail.imagesBlocked:2')
        expect(wrapper.text()).toContain('mail.showImagesOnce')
        expect(wrapper.text()).toContain('mail.showImagesAlways')
        expect(bodyHtml()).toContain('data-blocked-src')
    })

    it('点「这封显示」后放行，横幅消失', async () => {
        mountReader({email: mail({content: '<img src="https://track.example/a.gif">'})})
        await nextTick()
        const once = wrapper.findAll('button').find((b) => b.text() === 'mail.showImagesOnce')
        await once.trigger('click')
        await nextTick()
        expect(wrapper.text()).not.toContain('mail.imagesBlocked')
        expect(bodyHtml()).toContain('src="https://track.example/a.gif"')
    })

    it('「以后都显示」落到 prefs，下一封也放行', async () => {
        mountReader({email: mail({content: '<img src="https://track.example/a.gif">'})})
        await nextTick()
        await wrapper.findAll('button').find((b) => b.text() === 'mail.showImagesAlways').trigger('click')
        await nextTick()
        expect(JSON.parse(localStorage.getItem('um-mail-prefs')).showImages).toBe(true)
        expect(wrapper.text()).not.toContain('mail.imagesBlocked')
    })

    it('换邮件时「这封显示」归零（不继承上一封的决定）', async () => {
        mountReader({email: mail({content: '<img src="https://track.example/a.gif">'})})
        await nextTick()
        await wrapper.findAll('button').find((b) => b.text() === 'mail.showImagesOnce').trigger('click')
        await nextTick()

        await wrapper.setProps({email: mail({emailId: 8, content: '<img src="https://track.example/c.gif">'})})
        await nextTick()
        expect(wrapper.text()).toContain('mail.imagesBlocked:1')
    })

    it('{{domain}} 换成 R2 域名，且本站图片不算远程', async () => {
        mountReader({email: mail({content: '<img src="{{domain}}mail/1.png">'})})
        await nextTick()
        expect(wrapper.text()).not.toContain('mail.imagesBlocked')
        expect(bodyHtml()).toContain('https://cdn.uni.dev/mail/1.png')
    })
})

describe('MailReader · 动作与附件', () => {

    it('星标 / 未读 / 删除 / 回复 / 转发各抛一个事件', async () => {
        mountReader()
        const click = async (label) => {
            const btn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === label)
            expect(btn, label).toBeTruthy()
            await btn.trigger('click')
        }

        await click('mail.star')
        await click('mail.markRead')
        await click('mail.moveToTrash')
        await click('mail.reply')
        await click('mail.forward')

        expect(wrapper.emitted('star')).toHaveLength(1)
        expect(wrapper.emitted('unread')).toHaveLength(1)
        expect(wrapper.emitted('delete')).toHaveLength(1)
        expect(wrapper.emitted('reply')).toHaveLength(1)
        expect(wrapper.emitted('forward')).toHaveLength(1)
    })

    it('已加星标时按钮变成「取消星标」并抛 unstar', async () => {
        mountReader({email: mail({isStar: 1})})
        const btn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.unstar')
        await btn.trigger('click')
        expect(wrapper.emitted('unstar')).toHaveLength(1)
    })

    it('回收站模式：删除换成还原 / 彻底删除', async () => {
        mountReader({trashMode: true})
        const labels = wrapper.findAll('button').map((b) => b.text())
        expect(labels).toContain('mail.restore')
        expect(labels).toContain('mail.purge')
        expect(wrapper.findAll('button').some((b) => b.attributes('aria-label') === 'mail.moveToTrash')).toBe(false)
    })

    it('无删除权限 / 不给回复时相应按钮不出现', () => {
        mountReader({canDelete: false, showReply: false})
        const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'))
        expect(labels).not.toContain('mail.moveToTrash')
        expect(labels).not.toContain('mail.reply')
    })

    it('窄屏整页阅读时显示返回箭头', async () => {
        mountReader({showBack: true})
        const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.back')
        await back.trigger('click')
        expect(wrapper.emitted('back')).toHaveLength(1)
    })

    it('附件列出名字 / 大小 / 下载链接', () => {
        mountReader({
            email: mail({attList: [{attId: 1, filename: '发票.pdf', size: 2048, key: 'k/1.pdf'}]}),
        })
        expect(wrapper.text()).toContain('发票.pdf')
        expect(wrapper.text()).toContain('2.00 KB')
        expect(wrapper.findAll('a[download]')).toHaveLength(1)
    })
})
