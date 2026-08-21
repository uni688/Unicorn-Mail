/**
 * MailList 单测（§7.4）。
 *
 * 关注三件只有在「装起来」之后才能验证的事：
 *   1. 虚拟化真的生效（500 封邮件不会渲染 500 行）；
 *   2. 表头三态勾选与批量动作的目标集合（勾了作用于勾选，没勾作用于光标行）；
 *   3. 空 / 错 / 首屏三态按 §7.8 出现（骨架而不是转圈）。
 *
 * `offsetHeight` 的桩同 MailboxPicker.spec：jsdom 没有布局，不给高度就一行都不渲染。
 */
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

setActivePinia(createPinia())

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key), locale: ref('zh')}),
}))

const MailList = (await import('./MailList.vue')).default
const {useMailPrefs} = await import('@/composables/useMailPrefs.js')

const mail = (emailId) => ({
    emailId,
    name: `发件人${emailId}`,
    sendEmail: `s${emailId}@x.dev`,
    subject: `主题 ${emailId}`,
    text: `正文 ${emailId}`,
    createTime: '2026-08-20 03:00:00',
    unread: 1,
    isStar: 0,
    status: 0,
    attList: [],
})

const page = (from, count, total = 999) => ({
    list: Array.from({length: count}, (_, i) => mail(from - i)),
    total,
})

const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

let wrapper

beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useMailPrefs().resetPrefs()
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            return 560
        },
    })
})

afterEach(() => {
    if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor)
    wrapper?.unmount()
    wrapper = null
})

/** 挂上并等首屏取数落地（`minLatency` 默认 300ms，这里用真实定时器等一小会） */
async function mountList(props = {}) {
    wrapper = mount(MailList, {
        props: {fetch: () => Promise.resolve(page(500, 50)), ...props},
        attachTo: document.body,
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    return wrapper
}

const rows = () => wrapper.findAll('[role="option"]')

describe('MailList · 虚拟化与三态', () => {

    it('50 封只渲染视口内的十几行（虚拟化生效）', async () => {
        await mountList()
        expect(rows().length).toBeGreaterThan(0)
        expect(rows().length).toBeLessThan(30)
        expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    })

    it('首屏是骨架而不是转圈（§7.8）', async () => {
        wrapper = mount(MailList, {
            props: {fetch: () => new Promise(() => {})},
            attachTo: document.body,
        })
        await nextTick()
        expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
        expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    })

    it('空列表画 EmptyState，不画列表容器', async () => {
        await mountList({fetch: () => Promise.resolve({list: [], total: 0}), emptyTitle: '空空如也'})
        expect(wrapper.text()).toContain('空空如也')
        expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    })

    it('首屏失败画 ErrorState，点重试会重新取', async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('boom')))
            .mockImplementationOnce(() => Promise.resolve(page(10, 2)))
        await mountList({fetch})
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)

        await wrapper.find('[role="alert"] button').trigger('click')
        await new Promise((resolve) => setTimeout(resolve, 350))
        await nextTick()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(rows().length).toBe(2)
    })
})

describe('MailList · 选择与批量动作', () => {

    it('表头勾选切换全选/清空，三态跟着变', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 5, 5))})
        const header = wrapper.find('button[role="checkbox"]')

        await header.trigger('click')
        expect(wrapper.vm.selection.count.value).toBe(5)
        expect(header.attributes('data-state')).toBe('checked')

        await header.trigger('click')
        expect(wrapper.vm.selection.count.value).toBe(0)
    })

    it('勾一封之后表头是 indeterminate', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 5, 5))})
        await rows()[0].find('button[role="checkbox"]').trigger('click')
        expect(wrapper.vm.selection.count.value).toBe(1)
        expect(wrapper.find('button[role="checkbox"]').attributes('data-state')).toBe('indeterminate')
    })

    it('批量删除作用于勾选集合，抛出 id 数组并清空选择', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 3, 3))})
        await rows()[0].find('button[role="checkbox"]').trigger('click')
        await rows()[1].find('button[role="checkbox"]').trigger('click')

        const trash = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.moveToTrash')
        await trash.trigger('click')

        expect(wrapper.emitted('delete')[0][0].sort((a, b) => b - a)).toEqual([10, 9])
        expect(wrapper.vm.selection.count.value).toBe(0)
    })

    it('一封都没勾时批量按钮不出现（空手点删除不该有任何事发生）', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 3, 3))})
        const trash = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.moveToTrash')
        expect(trash).toBeUndefined()
    })

    it('回收站模式下换成「还原 / 彻底删除」', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 3, 3)), trashMode: true})
        await rows()[0].find('button[role="checkbox"]').trigger('click')
        const labels = wrapper.findAll('button').map((b) => b.text())
        expect(labels).toContain('mail.restore')
        expect(labels).toContain('mail.purge')
    })
})

describe('MailList · 键盘与密度', () => {

    it('↓ 建立光标，Enter 打开当前行', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 4, 4))})
        const listbox = wrapper.find('[role="listbox"]')

        await listbox.trigger('keydown', {key: 'ArrowDown'})
        await listbox.trigger('keydown', {key: 'Enter'})
        expect(wrapper.emitted('open')[0][0].emailId).toBe(10)

        await listbox.trigger('keydown', {key: 'ArrowDown'})
        await listbox.trigger('keydown', {key: 'Enter'})
        expect(wrapper.emitted('open')[1][0].emailId).toBe(9)
    })

    it('x 勾选光标行，a 全选已加载，Esc 清空', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 4, 4))})
        const listbox = wrapper.find('[role="listbox"]')

        await listbox.trigger('keydown', {key: 'ArrowDown'})
        await listbox.trigger('keydown', {key: 'x'})
        expect(wrapper.vm.selection.count.value).toBe(1)

        await listbox.trigger('keydown', {key: 'a'})
        expect(wrapper.vm.selection.count.value).toBe(4)

        await listbox.trigger('keydown', {key: 'Escape'})
        expect(wrapper.vm.selection.count.value).toBe(0)
    })

    it('Ctrl/Cmd+A 不拦（那是浏览器的全选文本）', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 4, 4))})
        await wrapper.find('[role="listbox"]').trigger('keydown', {key: 'a', ctrlKey: true})
        expect(wrapper.vm.selection.count.value).toBe(0)
    })

    it('切密度改行高，并记到 localStorage', async () => {
        await mountList({fetch: () => Promise.resolve(page(10, 4, 4))})
        const compact = wrapper.findAll('button').find((b) => b.text() === 'mail.density.compact')
        await compact.trigger('click')
        await nextTick()

        expect(JSON.parse(localStorage.getItem('um-mail-prefs')).density).toBe('compact')
        expect(rows()[0].attributes('style')).toContain('height: 44px')
    })

    it('刷新按钮清空选择并重新取数', async () => {
        const fetch = vi.fn(() => Promise.resolve(page(10, 4, 4)))
        await mountList({fetch})
        await rows()[0].find('button[role="checkbox"]').trigger('click')

        const refresh = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'mail.refresh')
        await refresh.trigger('click')
        await new Promise((resolve) => setTimeout(resolve, 350))

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(wrapper.vm.selection.count.value).toBe(0)
        expect(wrapper.emitted('refresh')).toHaveLength(1)
    })
})
