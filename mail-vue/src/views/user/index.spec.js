/**
 * 用户管理页单测（P4 回归）。
 *
 * 只钉一件事：**请求成功时表格必须是数据态**。`17429f6` 迁到 DataTable 时这页写的是
 * `:error="errorDetail"`，而 DataTable 的 `error` 是 `[Boolean, String, Object]` ——
 * Boolean 排在 String 前面，Vue 会把空字符串强转成 `true`。于是没出错时 `errorDetail`
 * 为 `''`，整张表永远卡在「数据没能加载出来」，用户邮箱弹窗里那张小表也一样。
 * `useUserAdmin` 的单测是绿的（它只管数据），坏在视图到 DataTable 的那一根线上。
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {nextTick, ref} from 'vue'

vi.mock('vue-i18n', async (importOriginal) => ({
    ...(await importOriginal()),
    useI18n: () => ({t: (key) => key, locale: ref('zh')}),
}))

vi.mock('@/components/ui/Toast/toast.js', () => ({
    toast: {error: vi.fn(), success: vi.fn()},
}))

vi.mock('@/perm/perm.js', () => ({
    hasPerm: () => true,
    default: {mounted() {}},
}))

const api = {list: vi.fn(), accounts: vi.fn()}
vi.mock('@/request/user.js', () => ({
    userList: (...a) => api.list(...a),
    userAllAccount: (...a) => api.accounts(...a),
    userAdd: vi.fn(), userDelete: vi.fn(), userDeleteAccount: vi.fn(), userRestSendCount: vi.fn(),
    userRestore: vi.fn(), userSetPwd: vi.fn(), userSetStatus: vi.fn(), userSetType: vi.fn(),
}))

vi.mock('@/request/role.js', () => ({
    roleSelectUse: () => Promise.resolve([{roleId: 1, name: '普通用户'}]),
}))

const pinia = createPinia()
setActivePinia(pinia)

const UserView = (await import('./index.vue')).default

const USERS = [
    {userId: 1, email: 'admin@x.dev', type: 0, status: 0, isDel: 0, createTime: '2026-08-11 11:22:36', receiveEmailCount: 3, sendEmailCount: 1, accountCount: 2},
    {userId: 2, email: 'b@x.dev', type: 1, status: 1, isDel: 0, createTime: '2026-10-10 12:43:42', receiveEmailCount: 0, sendEmailCount: 0, accountCount: 1},
]

async function flush() {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve()
        await nextTick()
    }
}

async function render() {
    const wrapper = mount(UserView, {global: {plugins: [pinia], directives: {perm: {}}}, attachTo: document.body})
    await flush()
    return wrapper
}

const mainTable = (wrapper) => wrapper.get('table[aria-label="allUsers"]')

beforeEach(() => {
    localStorage.clear()
    api.list.mockReset()
    api.accounts.mockReset()
    document.body.innerHTML = ''
})

describe('用户管理页 · DataTable 四态', () => {
    it('请求成功：渲染数据行，不是错误态', async () => {
        api.list.mockResolvedValue({list: USERS, total: 2})
        const wrapper = await render()

        const table = mainTable(wrapper)
        expect(table.text()).not.toContain('adminTable.loadFailed')
        expect(table.findAll('tbody tr').map((tr) => tr.text())).toEqual([
            expect.stringContaining('admin@x.dev'),
            expect.stringContaining('b@x.dev'),
        ])
        wrapper.unmount()
    })

    it('请求失败：才是错误态，且带技术细节', async () => {
        api.list.mockRejectedValue(new Error('boom'))
        const wrapper = await render()

        const table = mainTable(wrapper)
        expect(table.text()).toContain('adminTable.loadFailed')
        expect(table.findAll('tbody tr').some((tr) => tr.text().includes('admin@x.dev'))).toBe(false)
        wrapper.unmount()
    })

    it('列表为空：是空态，不是错误态', async () => {
        api.list.mockResolvedValue({list: [], total: 0})
        const wrapper = await render()

        const table = mainTable(wrapper)
        expect(table.text()).toContain('adminTable.emptyUser')
        expect(table.text()).not.toContain('adminTable.loadFailed')
        wrapper.unmount()
    })

    it('表头全选不会把超级管理员带进批量删除（后端不拦 type=0）', async () => {
        api.list.mockResolvedValue({list: USERS, total: 2})
        const wrapper = await render()

        const head = mainTable(wrapper).get('thead button[aria-label="全选本页"], thead [role="checkbox"]')
        await head.trigger('click')
        await flush()

        expect(wrapper.vm.selection.ids.value).toEqual([2])
        expect(head.attributes('data-state')).toBe('checked')
        const boxes = mainTable(wrapper).findAll('tbody button[aria-label="选择此行"], tbody [role="checkbox"]')
        expect(boxes[0].attributes('disabled')).toBeDefined()
        wrapper.unmount()
    })

    it('用户邮箱弹窗里的那张表同样是数据态', async () => {
        api.list.mockResolvedValue({list: USERS, total: 2})
        api.accounts.mockResolvedValue({list: [{accountId: 9, email: 'box@x.dev', createTime: '2026-10-10 12:43:42'}], total: 1})
        const wrapper = await render()

        wrapper.vm.openAccounts(USERS[1])
        await flush()

        const table = document.querySelector('table[aria-label="userEmail"]')
        expect(api.accounts).toHaveBeenCalledWith(2, 1, 10, {noMsg: true})
        expect(table).not.toBeNull()
        expect(table.textContent).toContain('box@x.dev')
        expect(table.textContent).not.toContain('adminTable.loadFailed')
        wrapper.unmount()
    })
})
