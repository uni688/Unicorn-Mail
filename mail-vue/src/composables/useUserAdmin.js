/**
 * useUserAdmin — 用户管理页的数据与动作（§10.4 / p4 §5 步骤 4）
 *
 * 旧 `views/user/index.vue` 是 1294 行的单文件：模板里塞了 5 个弹窗 + 右键菜单，
 * script 里 60 多个 ref 和 20 个函数混在一起，`adjustWidth()` 还在用
 * `window.onresize` 猜列宽。先把「取数 / 参数 / 动作」搬出来，视图只留模板 ——
 * 这样两边都能单独读懂，动作也终于能被单元测试直接调用。
 *
 * 三个和旧版有意不同的地方：
 *
 * 1. **列的显示不再由 JS 算宽度决定**。旧代码在 5 个断点上逐列开关
 *    （`statusShow` / `createTimeShow` / …），窄屏时把字段藏进「详情」弹窗。
 *    `DataTable` 在 `<md` 已经整表退化成卡片列表，字段一个都不少，所以这套
 *    开关连同 `window.onresize` 一起删掉；详情弹窗改成永远显示全部字段。
 * 2. **排序走表头**。旧版是工具条上一个沙漏图标，点一下翻方向，没有任何
 *    「现在按什么排」的可见状态。现在挂在「注册时间」列上，方向由 `aria-sort` 表达。
 *    服务端只认 `timeSort`（0 = 新的在前，1 = 旧的在前），所以只有这一列可排。
 * 3. **收信 / 发信 / 邮箱数的「含已删除」筛选**从 `el-table` 的列筛选器换成表头里的
 *    多选菜单。语义完全照搬：两个都勾 = 正常 + 已删除相加，只勾一个 = 只看那一份。
 */
import {computed, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {toast} from '@/components/ui/Toast/toast.js'
import {useSelection} from '@/composables/useSelection.js'
import {
    userAdd, userAllAccount, userDelete, userDeleteAccount, userList,
    userRestSendCount, userRestore, userSetPwd, userSetStatus, userSetType,
} from '@/request/user.js'
import {roleSelectUse} from '@/request/role.js'
import {useRoleStore} from '@/store/role.js'
import {useSettingStore} from '@/store/setting.js'
import {useUserStore} from '@/store/user.js'
import {tzDayjs} from '@/utils/day.js'
import {isEmail} from '@/utils/verify-utils.js'

/** 状态下拉：-2 是「已删除」，它在后端不是 status 而是 isDel=1（见 getList） */
export const USER_STATUS = {ALL: -1, ACTIVE: 0, BANNED: 1, DELETED: -2}

const PARAMS_KEY = 'user-params'

/** 能不能被勾进批量选择：type=0 是超级管理员 */
export const isSelectableUser = (user) => user?.type !== 0

export function useUserAdmin() {

    const {t} = useI18n()
    const roleStore = useRoleStore()
    const userStore = useUserStore()
    const settingStore = useSettingStore()

    /* ---------------------------------------------------------------- 列表 */

    const rows = ref([])
    const total = ref(0)
    const loading = ref(true)
    const error = ref(null)

    const params = reactive({
        email: '',
        num: 1,
        size: 15,
        timeSort: 0,
        status: USER_STATUS.ALL,
    })

    // 记住分页与筛选：管理员经常在「封号 → 看邮箱 → 回列表」之间来回
    const saved = localStorage.getItem(PARAMS_KEY)
    if (saved) {
        try {
            const local = JSON.parse(saved)
            if (Number.isFinite(local?.num)) params.num = local.num
            if (Number.isFinite(local?.size)) params.size = local.size
            if (Number.isFinite(local?.timeSort)) params.timeSort = local.timeSort
            if (Number.isFinite(local?.status)) params.status = local.status
        } catch {
            // 存坏了就当没存过，不值得为此拦住整页
        }
    }

    watch(params, () => {
        localStorage.setItem(PARAMS_KEY, JSON.stringify(params))
    }, {deep: true})

    // 超级管理员不进批量选择（旧版 `el-table` 的 `:selectable`）。后端 `/user/delete` 不拦 type=0，
    // 全选 + 批量删除会把站长账号连同邮件一起物理删掉，所以这一条只能在这里守住
    const selection = useSelection(() => rows.value.filter(isSelectableUser), {idKey: 'userId'})

    async function getList({keepSelection = false} = {}) {
        loading.value = true
        error.value = null
        const query = {...params}
        // 「已删除」不是一个 status 值：后端按 isDel 过滤，status 得整个拿掉
        if (query.status === USER_STATUS.DELETED) {
            delete query.status
            query.isDel = 1
        }
        try {
            const data = await userList(query, {noMsg: true})
            rows.value = Array.isArray(data?.list) ? data.list : []
            total.value = Number(data?.total ?? 0)
            if (!keepSelection) selection.clear()
        } catch (e) {
            error.value = e
            rows.value = []
            total.value = 0
        } finally {
            loading.value = false
        }
    }

    const errorDetail = computed(() => String(error.value?.message ?? ''))

    /* ------------------------------------------------------------ 身份字典 */

    const roleList = ref([])

    function loadRoles() {
        return roleSelectUse().then((list) => {
            roleList.value = Array.isArray(list) ? list : []
        })
    }

    /** type=0 是超级管理员，它不在 role 表里 */
    function roleName(type) {
        if (type === 0) return t('admin')
        return roleList.value.find(role => role.roleId === type)?.name ?? ''
    }

    const roleOptions = computed(() => roleList.value.map(role => ({label: role.name, value: role.roleId})))

    loadRoles()
    watch(() => roleStore.refresh, loadRoles)
    watch(() => userStore.refreshList, () => getList({keepSelection: true}))

    /* ------------------------------------------------- 排序 / 搜索 / 分页 */

    /** 服务端只支持按注册时间（userId）排，所以排序模型固定挂在这一列上 */
    const sort = computed(() => ({key: 'createTime', order: params.timeSort ? 'asc' : 'desc'}))

    function setSort(next) {
        if (next?.key !== 'createTime') return
        params.timeSort = next.order === 'asc' ? 1 : 0
        params.num = 1
        getList()
    }

    function search() {
        params.num = 1
        getList()
    }

    function setPage(num) {
        params.num = num
        getList()
    }

    function setStatus(status) {
        params.status = status
        params.num = 1
        getList()
    }

    function refresh() {
        params.email = ''
        params.num = 1
        params.status = USER_STATUS.ALL
        params.timeSort = 0
        loadRoles()
        return getList()
    }

    /* ------------------------------------------------------ 计数列的筛选 */

    /** 每列各自记「看正常的 / 看已删除的」，两个都勾就是相加（照搬旧语义） */
    const countMode = reactive({
        receive: ['normal', 'del'],
        send: ['normal', 'del'],
        account: ['normal', 'del'],
    })

    /** 列 → 后端字段名（正常 / 已删除各一个，见 user-service.list()） */
    const COUNT_FIELDS = {
        receive: ['receiveEmailCount', 'delReceiveEmailCount'],
        send: ['sendEmailCount', 'delSendEmailCount'],
        account: ['accountCount', 'delAccountCount'],
    }

    function countOf(row, field) {
        const mode = countMode[field]
        const [normalKey, delKey] = COUNT_FIELDS[field]
        const normal = Number(row?.[normalKey] ?? 0)
        const deleted = Number(row?.[delKey] ?? 0)
        if (mode.length === 2) return normal + deleted
        if (mode.includes('normal')) return normal
        if (mode.includes('del')) return deleted
        return 0
    }

    /** 一列至少要留一个勾：全不勾时整列显示 0，等于把信息藏了 */
    function toggleCountMode(field, value) {
        const mode = countMode[field]
        const index = mode.indexOf(value)
        if (index > -1) {
            if (mode.length === 1) return
            mode.splice(index, 1)
        } else {
            mode.push(value)
        }
    }

    /* -------------------------------------------------------------- 新增 */

    const addForm = reactive({
        email: '',
        suffix: settingStore.domainList?.[0] ?? '',
        password: '',
        type: null,
    })
    const addLoading = ref(false)

    const domainOptions = computed(() => (settingStore.domainList ?? []).map(d => ({label: d, value: d})))

    function resetAddForm() {
        addForm.email = ''
        addForm.suffix = settingStore.domainList?.[0] ?? ''
        addForm.password = ''
        addForm.type = null
    }

    /** @returns {boolean} 真 = 已提交成功 */
    async function submitAdd() {
        if (!addForm.email) {
            toast.error(t('emptyEmailMsg'))
            return false
        }
        if (!isEmail(addForm.email + addForm.suffix)) {
            toast.error(t('notEmailMsg'))
            return false
        }
        if (!addForm.password) {
            toast.error(t('emptyPwdMsg'))
            return false
        }
        if (addForm.password.length < 6) {
            toast.error(t('pwdLengthMsg'))
            return false
        }
        if (!addForm.type) {
            toast.error(t('emptyRole'))
            return false
        }
        addLoading.value = true
        try {
            await userAdd({...addForm, email: addForm.email + addForm.suffix})
            toast.success(t('addSuccessMsg'))
            addForm.email = ''
            addForm.password = ''
            await getList({keepSelection: true})
            return true
        } finally {
            addLoading.value = false
        }
    }

    /* --------------------------------------------------- 改密码 / 改身份 */

    const userForm = reactive({userId: 0, password: '', type: -1})
    const formLoading = ref(false)
    /** 改身份成功后要就地更新这一行，省一次整表刷新 */
    let editingRow = null

    function openForm(user) {
        editingRow = user
        userForm.userId = user.userId
        userForm.type = user.type
        userForm.password = ''
    }

    function resetUserForm() {
        userForm.userId = 0
        userForm.password = ''
        userForm.type = -1
        editingRow = null
    }

    async function submitPwd() {
        if (!userForm.password) {
            toast.error(t('emptyPwdMsg'))
            return false
        }
        if (userForm.password.length < 6) {
            toast.error(t('pwdLengthMsg'))
            return false
        }
        formLoading.value = true
        try {
            await userSetPwd({password: userForm.password, userId: userForm.userId})
            toast.success(t('saveSuccessMsg'))
            return true
        } finally {
            formLoading.value = false
        }
    }

    async function submitType() {
        formLoading.value = true
        try {
            await userSetType({type: userForm.type, userId: userForm.userId})
            if (editingRow) editingRow.type = userForm.type
            toast.success(t('saveSuccessMsg'))
            return true
        } finally {
            formLoading.value = false
        }
    }

    /* ------------------------------------------------ 封禁 / 恢复 / 删除 */

    /** 行内动作文案：已删除的行只能「恢复」 */
    function statusActionLabel(user) {
        if (user.isDel === 1) return t('restore')
        return user.status === 0 ? t('btnBan') : t('enable')
    }

    /** 右键菜单里的同一动作要说全（「封禁用户」而不是「封禁」） */
    function statusActionLongLabel(user) {
        if (user.isDel === 1) return t('restoreUser')
        return user.status === 0 ? t('banUser') : t('enableUser')
    }

    async function toggleStatus(user) {
        const status = user.status ? 0 : 1
        await userSetStatus({status, userId: user.userId})
        user.status = status
        toast.success(t('saveSuccessMsg'))
    }

    async function restore(user) {
        await userRestore(user.userId, 0)
        user.isDel = 0
        toast.success(t('restoreSuccessMsg'))
    }

    async function removeUsers(userIds) {
        await userDelete(userIds)
        toast.success(t('delSuccessMsg'))
        selection.clear()
        await getList()
    }

    async function resetSendCount(user) {
        await userRestSendCount(user.userId)
        user.sendCount = 0
        toast.success(t('reSuccessMsg'))
    }

    /* ------------------------------------------------------ 用户的邮箱表 */

    const accountRows = ref([])
    const accountLoading = ref(false)
    const accountError = ref(null)
    const accountParams = reactive({userId: 0, num: 1, size: 10, total: 0})

    async function getAccountList() {
        accountLoading.value = true
        accountError.value = null
        try {
            const data = await userAllAccount(
                accountParams.userId, accountParams.num, accountParams.size, {noMsg: true},
            )
            accountRows.value = Array.isArray(data?.list) ? data.list : []
            accountParams.total = Number(data?.total ?? 0)
        } catch (e) {
            accountError.value = e
            accountRows.value = []
            accountParams.total = 0
        } finally {
            accountLoading.value = false
        }
    }

    function openAccountList(userId) {
        accountParams.userId = userId
        accountParams.num = 1
        accountParams.total = 0
        accountRows.value = []
        return getAccountList()
    }

    function setAccountPage(num) {
        accountParams.num = num
        return getAccountList()
    }

    async function removeAccount(account) {
        await userDeleteAccount(account.accountId)
        toast.success(t('delSuccessMsg'))
        await getAccountList()
    }

    const accountErrorDetail = computed(() => String(accountError.value?.message ?? ''))

    /* ---------------------------------------------------------------- 详情 */

    /** 发信额度：没权限 / 不限量 / 已用 n 共 m */
    function sendCountText(user) {
        const action = user?.sendAction
        if (!action?.hasPerm) return t('unauthorized')
        if (!action.sendCount) return t('unlimited')
        return `${user.sendCount ?? 0}/${action.sendCount}`
    }

    function sendTypeText(user) {
        const type = user?.sendAction?.sendType
        if (type === 'day') return t('daily')
        if (type === 'count') return t('total')
        if (type === 'ban') return t('sendBanned')
        if (type === 'internal') return t('sendInternal')
        return ''
    }

    const formatTime = (value, pattern = 'YYYY-MM-DD HH:mm') => (
        value ? tzDayjs(value).format(pattern) : ''
    )

    /**
     * 超级管理员这一行，非管理员看不了也改不动 —— 旧版是画一个点不动的按钮，
     * 这里直接不给菜单（`el-button` 那个假按钮键盘能聚焦，但按下去什么都不发生）。
     */
    function canManage(user) {
        return !(user?.type === 0 && userStore.user?.type !== 0)
    }

    return {
        // 列表
        rows, total, loading, error, errorDetail, params, selection, getList,
        // 身份
        roleList, roleOptions, roleName, loadRoles,
        // 排序 / 搜索 / 分页
        sort, setSort, search, setPage, setStatus, refresh,
        // 计数列
        countMode, countOf, toggleCountMode,
        // 新增
        addForm, addLoading, domainOptions, resetAddForm, submitAdd,
        // 改密码 / 改身份
        userForm, formLoading, openForm, resetUserForm, submitPwd, submitType,
        // 状态
        statusActionLabel, statusActionLongLabel, toggleStatus, restore, removeUsers, resetSendCount,
        // 邮箱表
        accountRows, accountLoading, accountError, accountErrorDetail, accountParams,
        openAccountList, setAccountPage, removeAccount,
        // 详情
        sendCountText, sendTypeText, formatTime, canManage,
    }
}
