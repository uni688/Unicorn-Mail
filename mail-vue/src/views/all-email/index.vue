<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 :type="'all-email'"

    >
      <template #first>
        <!-- P4：旧实现把一个透明的 el-select 藏在 el-input 的 #prefix 里，靠
             `mySelect.toggleMenu()` 假装成「输入框里的下拉」。L1 Input 的 #prefix 是
             pointer-events-none + aria-hidden 的装饰位（放进去点不动、读屏也读不到），
             所以搜索范围改成输入框旁边一个真正的 Select —— 键盘能到、读屏能念。 -->
        <div class="search-group">
          <Select
              v-model="params.searchType"
              :options="searchTypeOptions"
              :aria-label="t('adminTable.searchScope')"
              size="sm"
              class="scope-select"
              @update:model-value="onScopeChange"
          />
          <Input
              v-model="searchValue"
              type="search"
              size="sm"
              clearable
              class="search-input"
              :placeholder="t('searchByContent')"
              :aria-label="t('searchByContent')"
              @enter="search"
              @clear="search"
          />
        </div>
        <Select
            v-model="params.type"
            :options="mailTypeOptions"
            :aria-label="t('adminTable.mailTypeFilter')"
            size="sm"
            class="status-select"
            @update:model-value="typeSelectChange"
        />
        <Button variant="ghost" size="icon-sm" :label="t('ui.search')" @click="search">
          <Icon icon="iconoir:search" width="20" height="20"/>
        </Button>
        <Button variant="ghost"
                size="icon-sm"
                :label="params.timeSort === 0 ? t('mail.oldestFirst') : t('mail.newestFirst')"
                @click="changeTimeSort">
          <Icon v-if="params.timeSort === 0" icon="material-symbols-light:timer-arrow-down-outline" width="24" height="24"/>
          <Icon v-else icon="material-symbols-light:timer-arrow-up-outline" width="24" height="24"/>
        </Button>
        <Button variant="ghost" size="icon-sm" class="clear" :label="t('clearEmail')" @click="openBathDelete">
          <Icon icon="fluent:broom-sparkle-16-regular" width="22" height="22"/>
        </Button>
      </template>
    </emailScroll>

    <Dialog v-model:open="showBathDelete"
            :title="t('clearEmail')"
            :description="t('adminTable.clearEmailHint')"
            size="sm"
            @update:open="onClearDialogToggle">
      <div class="grid gap-3">
        <Field :label="t('sender')">
          <template #default="{id}">
            <Input :id="id" v-model="clearParams.sendName" :placeholder="t('sender')"/>
          </template>
        </Field>
        <Field :label="t('subject')">
          <template #default="{id}">
            <Input :id="id" v-model="clearParams.subject" :placeholder="t('subject')"/>
          </template>
        </Field>
        <Field :label="t('sendEmailAddress')">
          <template #default="{id}">
            <Input :id="id" v-model="clearParams.sendEmail" :placeholder="t('sendEmailAddress')"/>
          </template>
        </Field>
        <Field :label="t('toEmail')">
          <template #default="{id}">
            <Input :id="id" v-model="clearParams.toEmail" :placeholder="t('toEmail')"/>
          </template>
        </Field>
        <Field :label="t('adminTable.dateRange')">
          <template #default="{id}">
            <DatePicker :id="id" v-model="clearTime" range :placeholder="t('adminTable.dateRange')"/>
          </template>
        </Field>
        <Field :label="t('adminTable.matchMode')">
          <template #default="{id}">
            <Select :id="id" v-model="clearParams.type" :options="matchModeOptions"/>
          </template>
        </Field>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showBathDelete = false">{{ t('cancel') }}</Button>
        <Button variant="danger" :loading="clearLoading" @click="batchDelete">{{ t('clear') }}</Button>
      </template>
    </Dialog>

    <!-- 批量清除是物理删除且条件可能命中很多邮件，所以二次确认单独一层 -->
    <AlertDialog
        v-model:open="confirmClearOpen"
        :title="t('clearEmail')"
        :description="t('delAllConfirm')"
        :confirm-text="t('clear')"
        :cancel-text="t('cancel')"
        tone="danger"
        :loading="clearLoading"
        @confirm="doBatchDelete"
    />
  </div>
</template>

<script setup>
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import {AlertDialog, Button, DatePicker, Dialog, Field, Input, Select} from "@/components/ui";
import {toast} from "@/components/ui/Toast/toast.js";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
/** DatePicker 的区间值是 `{start, end}`，两端都是 `'YYYY-MM-DD'` */
const clearTime = ref(null)
const sysEmailScroll = ref({})
const searchValue = ref('')
const showBathDelete = ref(false)
const confirmClearOpen = ref(false)
const clearLoading = ref(false)

onMounted(() => {
  latest();
})

const params = reactive({
  timeSort: 0,
  type: 'receive',
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

const searchTypeOptions = computed(() => [
  {label: t('sender'), value: 'name'},
  {label: t('subject'), value: 'subject'},
  {label: t('user'), value: 'user'},
  {label: t('selectEmail'), value: 'account'},
])

const mailTypeOptions = computed(() => [
  {label: t('all'), value: 'all'},
  {label: t('received'), value: 'receive'},
  {label: t('sent'), value: 'send'},
  {label: t('selectDeleted'), value: 'delete'},
  {label: t('noRecipientTitle'), value: 'noone'},
])

const matchModeOptions = computed(() => [
  {label: t('equal'), value: 'eq'},
  {label: t('leading'), value: 'left'},
  {label: t('include'), value: 'include'},
])

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

/** 旧实现挂在 el-dialog 的 `@closed` 上；L1 Dialog 只给 open 的变化 */
function onClearDialogToggle(open) {
  if (open) return
  resetClearParams()
  clearParams.type = 'eq'
  clearTime.value = null
}

/** 换搜索范围时不自动查 —— 输入框里的词可能不适用于新范围，等用户按回车/点放大镜 */
function onScopeChange() {
}

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearTime.value?.start && clearTime.value?.end) {
    clearParams.startTime = toUtc(clearTime.value.start).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value.end).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  const hasCondition = clearParams.sendEmail || clearParams.sendName || clearParams.subject
      || clearParams.toEmail || clearParams.startTime

  // 一个条件都没填就等于「清空全部」，旧实现在这里静默关窗，保持一致
  if (!hasCondition) {
    showBathDelete.value = false
    return
  }

  confirmClearOpen.value = true
}

function doBatchDelete() {
  clearLoading.value = true

  allEmailBatchDelete(clearParams).then(() => {
    toast.success(t('clearSuccess'))
    confirmClearOpen.value = false
    showBathDelete.value = false
    resetClearParams()
    sysEmailScroll.value.refreshList();
  }).finally(() => {
    clearLoading.value = false
  })
}

function rightSearch(type, value) {
  params.searchType = type;
  searchValue.value = value;
  search();
}

function refreshBefore() {
  searchValue.value = ''
  params.timeSort = 0
  params.type = 'receive'
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null
  params.searchType = 'name'
}

function search() {

  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') {
    params.userEmail = searchValue.value
  }

  if (params.searchType === 'account') {
    params.accountEmail = searchValue.value
  }

  if (params.searchType === 'name') {
    params.name = searchValue.value
  }

  if (params.searchType === 'subject') {
    params.subject = searchValue.value
  }

  sysEmailScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function typeSelectChange() {
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}


function getEmailList(emailId, size) {
  return allEmailList({emailId, size, ...params})
}

async function latest() {

  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (params.type !== 'receive') {
      continue
    }

    try {

      const curTimeSort = params.timeSort
      let list = await allEmailLatest(latestId)

      if (list.length === 0) {
        continue
      }

      if (params.type !== 'receive') {
        continue
      }

      // 确保回来之后条件没变
      if (params.timeSort !== curTimeSort) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
}

/* 搜索范围 + 关键词是一组，视觉上贴在一起（旧实现是把 select 藏进 input 里） */
.search-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  max-width: 360px;
}

.scope-select {
  width: 88px;
  flex: 0 0 auto;
}

.search-input {
  min-width: 0;
  flex: 1 1 auto;
}

.status-select {
  width: 102px;
  flex: 0 0 auto;
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
