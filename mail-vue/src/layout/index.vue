<script setup>
/**
 * layout —— 登录后的框架路由组件
 *
 * P2 把这里从 `el-container` 三段式换成 `AppShell`（§10.4）：顶栏、侧栏、命令条、
 * 底部 Tab、命令面板、`?` 面板全都在 AppShell 里，这一层只剩两件事 ——
 * 把旧的 `Main`（账号浮层 + keep-alive 的 router-view）塞进 shell 的插槽，
 * 以及把写信面板的 ref 交给 store（`uiStore.writerRef`，全站的「新邮件 / 回复 /
 * 转发」都调它，见 `email-scroll`、`views/content`、`CommandBar`）。
 *
 * 旧的 `layout/aside/index.vue` 与 `layout/header/index.vue` 由 `Sidebar` / `Topbar`
 * 取代，已删除；`layout/main/index.vue` 与 `layout/account/index.vue` 按 §10.7
 * 「在此之前保留旧 `account/index.vue` 作为过渡入口」保留，等 P3 的三栏邮件视图与
 * MailboxPicker 上线再拆。
 *
 * 侧栏的显示/折叠不再由 `uiStore.asideShow` 驱动（那是旧左滑抽屉的开关），
 * AppShell 自己按断点 + 用户偏好决定。
 *
 * `writer` 是 `position: fixed` + `v-show`，放在 shell 外面是故意的：shell 根节点是
 * `overflow-hidden` 的 flex 列，写信面板不该参与它的布局计算。
 */
import {onMounted, ref} from 'vue'
import {AppShell} from '@/components/composite'
import Main from '@/layout/main/index.vue'
import writer from '@/layout/write/index.vue'
import {useUiStore} from '@/store/ui.js'

const uiStore = useUiStore()
/** 初值 `null` 而不是 `{}`：`{}` 是真值，会让「新邮件」在挂载前就被认为可用 */
const writerRef = ref(null)

onMounted(() => {
    uiStore.writerRef = writerRef
})
</script>

<template>
  <AppShell>
    <Main />
  </AppShell>
  <writer ref="writerRef" />
</template>
