<script setup>
/**
 * App —— 根组件
 *
 * 只做三件事：Element Plus 的 locale 桥接（旧页面还在用 el-* 组件，P3~P5 逐步拆掉）、
 * i18n locale 同步、以及**全站唯一的 Toast 容器**。
 *
 * `Toaster` 挂在这里而不是 `AppShell`：登录/注册/404 都在 shell 外面，
 * 而 `toast.error()` 在这些页面上同样要能弹出来（§6.1 Toast「全局只挂一个」）。
 */
import {watch} from 'vue'
import {useI18n} from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {Toaster} from '@/components/ui'
import {useSettingStore} from '@/store/setting.js'

const settingStore = useSettingStore()
import('@/icons/index.js')
const {locale} = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => (locale.value = settingStore.lang))
</script>

<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <router-view />
    <Toaster />
  </el-config-provider>
</template>
