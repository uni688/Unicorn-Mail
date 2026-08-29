<template>
  <div class="email-container">
    <div class="header-actions">
      <Checkbox
          :model-value="isIndeterminate ? 'indeterminate' : checkAll"
          :disabled="!emailList.length || loading"
          :aria-label="t('shell.selectAll')"
          @update:model-value="handleCheckAllChange"
      />
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <Icon class="icon reload" icon="ion:reload" width="18" height="18" @click="refresh"/>
        <Icon v-perm="'email:delete'" class="icon delete" icon="uiw:delete" width="16" height="16"
              v-if="getSelectedMailsIds().length > 0"
              @click="handleDelete"/>
        <Icon v-perm="'email:delete'" class="icon delete" icon="fluent:mail-read-20-regular" width="21" height="21"
              v-if="getSelectedMailsIds().length > 0 && showUnread"
              @click="handleRead"/>
      </div>

      <div class="header-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
        <!-- P3：旧账号浮层删了，这个「展开浮层」按钮没有落点，于是不再渲染 -->
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <!-- P4\uFF1A\u53F3\u952E\u83DC\u5355\u4ECE\u300C\u4E00\u4E2A\u5168\u5C40 el-dropdown + \u865A\u62DF ref \u8DDF\u7740\u5149\u6807\u8DD1\u300D\u6539\u6210\u6BCF\u884C\u4E00\u4E2A
                 L1 ContextMenu\u3002reka \u7684 Trigger \u662F as-child\uFF0C\u4E0D\u4F1A\u591A\u5305\u5143\u7D20\uFF0C\u865A\u62DF\u5217\u8868\u5E03\u5C40\u4E0D\u53D8\u3002 -->
            <ContextMenu
                v-if="!item.expand"
                :key="item.emailId"
                :disabled="props.type === 'draft'"
                @update:open="onContextOpen(item, $event)"
            >
              <template #trigger>
                <div :class="['email-row', props.type, {'email-row-context': item.rightChecked}]"
                     :data-checked="item.checked"
                     @click="jumpDetails(item)"
                >
                  <Checkbox :class="props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                            :model-value="item.checked"
                            :aria-label="t('shell.selectOne')"
                            @update:model-value="item.checked = $event"
                            @click.stop/>
                  <div @click.stop="starChange(item)" class="pc-star" v-if="showStar">
                    <Icon v-if="item.isStar" icon="fluent-color:star-16" width="20" height="20"/>
                    <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
                  </div>
                  <div v-if="!showStar"></div>
                  <div class="title title-column">

                    <div class="email-sender" :style=" (showStatus ? 'gap: 10px;' : '') + ((item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : '')">
                      <div class="email-status" v-if="showStatus">
                        <Tooltip :text="item.statusIcon.content">
                          <Icon :icon="item.statusIcon.icon" :style="{color: item.statusIcon.color}" width="20" height="20"/>
                        </Tooltip>
                        <div class="del-status" v-if="item.isDel">
                          <Tooltip :text="item.isDelContent">
                            <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                          </Tooltip>
                        </div>
                      </div>
                      <div v-else></div>
                      <span class="name">
                        <span>
                          <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                          <slot name="name" :email="item"> {{ item.name }}</slot>
                        </span>
                        <span>
                          <Icon v-if="item.isStar" icon="fluent-color:star-16" width="18" height="18"/>
                        </span>
                      </span>
                      <span class="phone-time">{{ item.formatCreateTime }}</span>
                    </div>
                    <div>
                      <div class="email-text">
                        <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                          <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                          <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                          <span class="subject-text">
                            <slot name="subject" :email="item" >
                              {{ item.subject || '\u200B' }}
                            </slot>
                          </span>
                        </span>
                        <span class="email-content">{{ item.formatText || '\u200B' }}</span>
                      </div>
                      <div class="user-info" v-if="showUserInfo">
                        <div class="user">
                          <span>
                            <Icon icon="mynaui:user" width="20" height="20"/>
                          </span>
                          <span>{{ item.userEmail }}</span>
                        </div>
                        <div class="account">
                          <span>
                            <Icon icon="mdi-light:email" width="20" height="20"/>
                          </span>
                          <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                    <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
                  </div>
                </div>
              </template>

              <!-- \u00A74.10\uFF1A\u6BCF\u4E00\u9879\u5728\u522B\u5904\u90FD\u6709\u7B49\u4EF7\u5165\u53E3\uFF08\u5DE5\u5177\u6761 / \u8BE6\u60C5\u9875 / \u641C\u7D22\u6846\uFF09\uFF0C\u53F3\u952E\u53EA\u662F\u52A0\u901F\u5668 -->
              <MenuItem v-if="item.code" @select="copyCode(item.code)">
                <template #icon><Icon icon="fluent-color:clipboard-24" width="20" height="20"/></template>
                {{ t('copyCode') }}
              </MenuItem>
              <MenuItem v-if="props.type === 'email'" @select="emailRead(item.emailId)">
                <template #icon><Icon icon="fluent:mail-read-20-regular" width="20" height="20"/></template>
                {{ t('markAsRead') }}
              </MenuItem>
              <MenuItem v-if="['email','star'].includes(props.type)" @select="openReply(item)">
                <template #icon><Icon icon="la:reply" width="20" height="20"/></template>
                {{ t('reply') }}
              </MenuItem>
              <MenuItem v-if="['email','send','star'].includes(props.type)" @select="openForward(item)">
                <template #icon><Icon icon="iconoir:arrow-up-right" width="19" height="19"/></template>
                {{ t('forward') }}
              </MenuItem>
              <MenuItem v-if="['email','send','star'].includes(props.type)" @select="starChange(item)">
                <template #icon><Icon icon="solar:star-line-duotone" width="19" height="19"/></template>
                {{ t('star') }}
              </MenuItem>
              <template v-if="props.type === 'all-email'">
                <MenuItem @select="handleSearch('user', item.userEmail)">
                  <template #icon><Icon icon="iconoir:search" width="20" height="20"/></template>
                  {{ t('searchUser') }}
                </MenuItem>
                <MenuItem @select="handleSearch('account', item.toEmail)">
                  <template #icon><Icon icon="iconoir:search" width="20" height="20"/></template>
                  {{ t('searchEmail') }}
                </MenuItem>
                <MenuItem @select="handleSearch('name', item.name)">
                  <template #icon><Icon icon="iconoir:search" width="20" height="20"/></template>
                  {{ t('searchSender') }}
                </MenuItem>
              </template>
              <MenuSeparator />
              <MenuItem tone="danger" @select="rightDelete(item.emailId)">
                <template #icon><Icon icon="uiw:delete" width="16" height="20"/></template>
                {{ t('delete') }}
              </MenuItem>
            </ContextMenu>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <EmptyState icon="iconoir:mail-out" :title="$t('noMessagesFound')"/>
      </div>
    </div>
    <AlertDialog
        v-model:open="confirmOpen"
        :title="confirmTitle"
        :confirm-text="t('confirm')"
        :cancel-text="t('cancel')"
        tone="danger"
        @confirm="confirmAccept"
    />
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {AlertDialog, Checkbox, ContextMenu, MenuItem, MenuSeparator, Tooltip} from "@/components/ui";
import {EmptyState} from "@/components/composite";
import {toast} from "@/components/ui/Toast/toast.js";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {openCompose} from "@/composables/useComposer.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search'])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
let isMobile = ref(innerWidth < 1367)
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
/** 右键菜单是否开着 —— 只用来阻止「关菜单的那一下」被当成点开邮件 */
const dropdownShow = ref(false);
const checkedEmailCount = ref(0);
let timer = null

/* P4：AlertDialog 是受控的、一次只开一个，所以用一组 ref 承载「标题 + 确认后干什么」，
   代替 ElMessageBox.confirm().then() 那种即时 promise 写法。 */
const confirmOpen = ref(false)
const confirmTitle = ref('')
let confirmAction = null

function askConfirm(title, action) {
  confirmTitle.value = title
  confirmAction = action
  confirmOpen.value = true
}

function confirmAccept() {
  confirmOpen.value = false
  const action = confirmAction
  confirmAction = null
  action?.()
}

const queryParam = reactive({
  size: 50
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total
})

onActivated(() => {
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

onMounted(() => {
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = fromNow(email.createTime);
    })
  }, 1000 * 60);
})

onUnmounted(() => {
  clearInterval(timer)
})

getEmailList()

window.onresize = () => {
  isMobile.value = innerWidth < 1367
}

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: 1200 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    } else  {
      return isMobile.value ? 83 : 48;
    }
})

watch(emailList, () => {
  updateHasScrollbar();
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, () => {
  keyCount.value ++
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      checkedEmailCount.value = emailList.length
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

function openReply(email) {
  openCompose('reply', {email})
}

function openForward(email) {
  openCompose('forward', {email})
}

/**
 * P4：reka 的 ContextMenu 自己管光标定位与滚轮关闭，所以旧的
 * `position` / `triggerRef` / `DOMRect.fromRect` / 全局 wheel 监听 / `handleContextmenu`
 * 全部退场，这里只留下两件旧实现里真的有用的事：
 *   1. 高亮当前右键的那一行（`rightChecked`）；
 *   2. 记住菜单开着，好让紧接着的 click 不被当成「点开邮件」。
 */
function onContextOpen(email, open) {
  dropdownShow.value = open
  emailList.forEach(item => {
    if (item.rightChecked && item !== email) item.rightChecked = false
  })
  email.rightChecked = open
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

/**
 * P3：旧账号浮层（`layout/account`）与 `uiStore.accountShow` 一起退场了，
 * 这个组件只剩草稿箱与管理端「全部邮件」在用（P4 一起换掉），所以这里退化成常量 —— 
 * 它原本只影响标题是否分两列。
 */
const accountShow = computed(() => false)

function htmlToText(email) {
  if (email.content) {

    const tempDiv = document.createElement('div');

    tempDiv.innerHTML = email.content.replace(
        /<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, ''
    );

    const scriptsAndStyles = tempDiv.querySelectorAll('script, style, title');
    scriptsAndStyles.forEach(el => el.remove());
    let text = tempDiv.textContent || tempDiv.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();
    return cleanSpace(text)
  }

  if (email.text) {
    return cleanSpace(email.text)
  } else {
    return ''
  }

}

function cleanSpace(text) {
  return text
      .replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')// 移除零宽空格
      .replace(/\s+/g, ' ')                   // 多空白合并成一个空格
      .trim();
}

function starChange(email) {

  if (!email.isStar) {

    if (!props.allowStar) return;

    email.isStar = 1;
    props.starAdd(email.emailId).then(() => {
      email.isStar = 1;
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 0
    })
  } else {

    email.isStar = 0;
    props.starCancel(email.emailId).then(() => {
      email.isStar = 0;
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 1;
    })
  }
}

const handleRead = () => {
  const emailIds = getSelectedMailsIds();
  props.emailRead(emailIds);
  localRead(emailIds);
}

function emailRead(emailId) {
  props.emailRead([emailId])
  localRead([emailId]);
}

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      emailList[index].unread = EmailUnreadEnum.READ;
      emailList[index].checked = false;
    }
  })
}

function rightDelete(emailId) {

  // 管理端「全部邮件」是物理删除，删不回来，所以多问一句；用户侧是移到回收站，直接删
  if (props.type === 'all-email') {
    askConfirm(t('delOneEmailConfirm'), () => doDelete([emailId]))
    return;
  }
  doDelete([emailId])
}

function doDelete(emailIds) {
  props.emailDelete(emailIds).then(() => {
    toast.success(t('delSuccessMsg'))
    emailStore.deleteIds = emailIds;
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(t('copySuccessMsg'))
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    toast.error(t('copyFailMsg'))
  }
}

function handleDelete() {
  askConfirm(t('delEmailsConfirm'), () => {
    if (props.type === 'draft') {
      emit('delete-draft', getSelectedDraftsIds());
      return;
    }
    doDelete(getSelectedMailsIds())
  })
}

function deleteEmail(emailIds) {
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
      }
    })
  })
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatText = htmlToText(email);
  email.formatCreateTime = fromNow(email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

/** L1 Checkbox 的三态 payload 可能是 `'indeterminate'`，这里归一成布尔再往下发 */
function handleCheckAllChange(val) {
  const checked = val === 'indeterminate' ? true : !!val;
  emailList.forEach(item => item.checked = checked);
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  checkAll.value = checkedCount === emailList.length;
  isIndeterminate.value = checkedCount > 0 && checkedCount < emailList.length;
}

function jumpDetails(email) {

  // 右键菜单开着时，这一下 click 是「关菜单」，不是「点开邮件」
  if (dropdownShow.value) {
    return;
  }

  // 拖选文字后松手也会触发 click，有选区就不跳转
  const sel = window.getSelection();
  if (sel?.toString().trim()) {
    return
  }
  emit('jump', email)
}


function getEmailList(refresh = false) {

  if (reqLock) return;

  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;

  reqLock = true

  if (!refresh) {

    if (loading.value || noLoading.value) {
      reqLock = false
      return
    }

  } else {
    getSkeletonRows()
    emailId = 0
    loading.value = true
    scrollTop = 0
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }
  let start = Date.now();

  props.getEmailList(emailId, queryParam.size).then(async data => {
    let end = Date.now();
    let duration = end - start;
    if (duration < 300 && !emailId) {
        await sleep(300 - duration)
    }
    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail

    handleList(list);
    emailList.push(...list);
    if (refresh) scrollbarRef.value?.setScrollTop(0);

    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;

    total.value = data.total;
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

function handleList(list) {
  // P4：状态图标表原来在这里抄了一份，P3 的 useMailList 又抄了一份。
  // 现在只留 useMailList 那一份（颜色已换成语义 token），这里直接引用。
  const icons = statusIconMap(t)
  list.forEach(email => {
    email.formatText = htmlToText(email)
    email.formatCreateTime = fromNow(email.createTime);

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = icons[email.status];
  })
}

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  refreshList()
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

.email-container {
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0;
  font-size: 14px;
  color: var(--color-fg);
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

:deep(.email-row) {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  height: 48px;
  @media (max-width: 1366px) {
    height: 83px;
  }

  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
  &.all-email {
    height: 65px;
    @media (max-width: 1366px) {
      height: 132px;
    }
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @media (max-width: 1366px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  .checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
    @media (min-width: 1367px) {
      justify-content: start;
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @media (max-width: 1366px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr;
    @media (max-width: 1366px) {
      padding-right: 15px;
    }
    @media (max-width: 1366px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--color-fg);
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @media (max-width: 1366px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @media (min-width: 1366px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 130px;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @media (min-width: 1367px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @media (max-width: 1366px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @media (min-width: 1367px) {
          display: none;
        }
        @media (max-width: 1366px) {
          width: 100%;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto 1fr;
      @media (max-width: 1366px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @media (min-width: 1367px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--color-fg);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--email-scroll-content-color);
        @media (max-width: 1366px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    @media (max-width: 1366px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @media (max-width: 1366px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--color-hover);
    z-index: 0;
  }

  /* 右键菜单指向的那一行。旧实现把 #FDF6EC 直接写进 style，暗色下白得刺眼；
     现在与 `MailRow` 的 `bg-hover + ring-line-strong` 口径一致（§7.4）。 */
  &.email-row-context {
    background-color: var(--color-hover);
    box-shadow: inset 0 0 0 1px var(--color-line-strong);
    z-index: 0;
  }
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 15px;
  padding: 3px 15px;
  box-shadow: var(--header-actions-border);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 20px;
    row-gap: 8px;
    padding-left: 2px;
    color: var(--color-fg);
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: start;
    height: 100%;
    color: var(--color-fg);

    .email-count {
      white-space: nowrap;
      margin-top: 6px;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

.del-status {
  color: var(--color-fg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.unread {
  height: 6px;
  width: 6px;
  background: var(--color-accent);
  margin-bottom: 2px;
  margin-right: 5px;
  border-radius: 50%;
  display: inline-block;
  justify-content: center;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

</style>
