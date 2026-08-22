import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {mount} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {nextTick, ref} from 'vue'

/**
 * MailComposer 的三条不变量（§7.7）：
 *   1. 预填：回复带上 `Re:` 与引用原文、转发带 `Fwd:` 且收件人留空；
 *   2. 收件人：非邮箱被挡掉、重复被去掉；
 *   3. 存草稿是串行的 —— 两次 ⌘S 只该有**一行**草稿（`draftId` 落库后第二次走 update）。
 *
 * 发送本身不在这里测：`emailSend` 的参数拼装与旧实现逐字一致，而进度/错误处理是 toast 的事。
 */

const draftTable = {
    rows: [],
    nextId: 1,
    add: vi.fn(async (record) => {
        const draftId = draftTable.nextId++
        draftTable.rows.push({draftId, ...record})
        return draftId
    }),
    update: vi.fn(async (draftId, record) => {
        const row = draftTable.rows.find((r) => r.draftId === draftId)
        Object.assign(row, record)
        return 1
    }),
    delete: vi.fn(async (draftId) => {
        draftTable.rows = draftTable.rows.filter((r) => r.draftId !== draftId)
    }),
}

const attTable = {
    rows: [],
    add: vi.fn(async (row) => { attTable.rows.push(row) }),
    where: vi.fn(() => ({delete: vi.fn(async () => {})})),
}

const sendMock = vi.fn(async () => [{subject: 'ok'}])
const prefill = ref(null)
const routerPush = vi.fn()
const routerBack = vi.fn()

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

vi.mock('@/db/db.js', () => ({
    default: {value: {draft: draftTable, att: attTable}},
}))

vi.mock('@/request/email.js', () => ({
    emailSend: (...args) => sendMock(...args),
}))

vi.mock('@/composables/useComposer.js', () => ({
    useComposer: () => ({takePrefill: () => { const v = prefill.value; prefill.value = null; return v }}),
    openCompose: vi.fn(),
}))

vi.mock('@/composables/useCounts.js', () => ({
    useCounts: () => ({refresh: vi.fn()}),
}))

vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal()),
    useRouter: () => ({push: routerPush, back: routerBack}),
}))

vi.mock('@/components/tiny-editor/index.vue', () => ({
    default: {
        name: 'TinyEditor',
        props: ['defValue'],
        setup(props, {expose}) {
            const content = ref(props.defValue ?? '')
            expose({getContent: () => content.value, clearEditor: () => { content.value = '' }, focus: () => {}})
            return () => null
        },
    },
}))

// `utils/day.js` 在模块作用域里就 `useSettingStore()`，所以 pinia 必须先于 import 存在
setActivePinia(createPinia())

const {default: MailComposer} = await import('@/components/domain/MailComposer.vue')

function factory() {
    return mount(MailComposer, {
        global: {stubs: {TinyEditor: true}},
    })
}

beforeEach(() => {
    setActivePinia(createPinia())
    draftTable.rows = []
    draftTable.nextId = 1
    attTable.rows = []
    prefill.value = null
    vi.clearAllMocks()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('MailComposer · 预填（§7.7）', () => {

    it('回复：收件人 = 原发件人，主题加 Re:，正文引用原文', async () => {
        prefill.value = {
            mode: 'reply',
            email: {emailId: 7, sendEmail: 'a@b.com', subject: 'Hello', content: '<p>hi</p>', createTime: '2026-01-01 00:00:00'},
        }
        const wrapper = factory()
        await nextTick()
        const vm = wrapper.vm
        expect(vm.form.receiveEmail).toEqual(['a@b.com'])
        expect(vm.form.subject).toBe('Re: Hello')
        expect(vm.form.sendType).toBe('reply')
        expect(vm.form.emailId).toBe(7)
        expect(vm.defValue).toContain('blockquote')
    })

    it('回复已经带 Re: 的主题不再叠一层', async () => {
        prefill.value = {mode: 'reply', email: {emailId: 1, sendEmail: 'a@b.com', subject: 'Re: Hello'}}
        const wrapper = factory()
        await nextTick()
        expect(wrapper.vm.form.subject).toBe('Re: Hello')
    })

    it('转发：主题加 Fwd:，收件人留空', async () => {
        prefill.value = {mode: 'forward', email: {emailId: 2, sendEmail: 'a@b.com', subject: 'Hello', text: 'plain'}}
        const wrapper = factory()
        await nextTick()
        expect(wrapper.vm.form.subject).toBe('Fwd: Hello')
        expect(wrapper.vm.form.receiveEmail).toEqual([])
        expect(wrapper.vm.form.sendType).toBe('forward')
    })

    it('草稿：整份铺开，draftId 跟着回来', async () => {
        prefill.value = {mode: 'draft', draft: {draftId: 9, subject: 'S', receiveEmail: ['x@y.com'], content: '<p>c</p>'}}
        const wrapper = factory()
        await nextTick()
        expect(wrapper.vm.form.draftId).toBe(9)
        expect(wrapper.vm.form.subject).toBe('S')
    })
})

describe('MailComposer · 收件人', () => {

    it('非邮箱与重复地址都进不来', async () => {
        const wrapper = factory()
        await nextTick()
        wrapper.vm.onRecipients(['a@b.com', 'not-an-email', 'a@b.com', 'c@d.com'])
        expect(wrapper.vm.form.receiveEmail).toEqual(['a@b.com', 'c@d.com'])
    })
})

describe('MailComposer · 存草稿是串行的', () => {

    it('两次 ⌘S 只写一行草稿', async () => {
        const wrapper = factory()
        await nextTick()
        wrapper.vm.form.subject = '两次保存'
        wrapper.vm.form.receiveEmail = ['a@b.com']

        // 不 await 第一次：模拟「挨着按两下」
        const first = wrapper.vm.saveDraft({silent: true})
        const second = wrapper.vm.saveDraft({silent: true})
        await Promise.all([first, second])

        expect(draftTable.rows).toHaveLength(1)
        expect(draftTable.add).toHaveBeenCalledTimes(1)
        expect(draftTable.update).toHaveBeenCalledTimes(1)
    })

    it('空表单不落库', async () => {
        const wrapper = factory()
        await nextTick()
        await wrapper.vm.saveDraft({silent: true})
        expect(draftTable.rows).toHaveLength(0)
    })
})
