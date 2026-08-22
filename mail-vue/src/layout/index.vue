<script setup>
/**
 * layout —— 登录后的框架路由组件
 *
 * P2 把这里从 `el-container` 三段式换成 `AppShell`（§10.4）：顶栏、侧栏、命令条、
 * 底部 Tab、命令面板、`?` 面板全都在 AppShell 里。
 *
 * P3 之后这一层只剩一件事：把 `Main`（keep-alive 的 router-view）塞进 shell 的插槽。
 * 旧的写信浮层（`layout/write`）与账号浮层（`layout/account`）都退场了 ——
 * 写信是 `/mail/compose` 整页（§7.7），邮箱切换是侧栏的 `MailboxPicker`（§7.2），
 * 于是 `uiStore.writerRef` 这个「谁都能在任何时候打开写信面板」的全局 ref 也一起删掉。
 *
 * 侧栏的显示/折叠不由 `uiStore.asideShow` 驱动（那是旧左滑抽屉的开关），
 * AppShell 自己按断点 + 用户偏好决定。
 */
import {AppShell} from '@/components/composite'
import Main from '@/layout/main/index.vue'
</script>

<template>
  <AppShell>
    <Main />
  </AppShell>
</template>
