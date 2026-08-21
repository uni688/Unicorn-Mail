<template>
  <!--
    P3 起这里只剩路由视图：旧的账号浮层（`layout/account`，677 行）连同 `uiStore.accountShow`
    一起退场，邮箱切换改由侧栏的 `MailboxPicker` 与命令面板的 `@` 模式承担（§7.2 / §10.7）。
    `keep-alive` 的名单里加了 trash —— 回收站也是「回来时应该还在原处」的列表。
  -->
  <router-view class="main-view" v-slot="{ Component,route }">
    <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','draft','trash']">
      <component :is="Component" :key="route.name"/>
    </keep-alive>
  </router-view>
</template>
<script setup>
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {watch} from "vue";

const settingStore = useSettingStore()
const uiStore = useUiStore();

let elNotification = null

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

</script>
<style lang="scss" scoped>
.main-view {
  background: var(--el-bg-color);
}
</style>
