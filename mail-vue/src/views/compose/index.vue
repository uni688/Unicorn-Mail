<script setup>
/**
 * 写信页（§7.7 / §1030「写信：全屏页而不是弹窗」）
 *
 * 视图本身只有一件事：把 `MailComposer` 铺满整页。预填（回复 / 转发 / 打开草稿）通过
 * `useComposer()` 的交接台传进来 —— URL 里塞不进一封邮件，而 `/mail/compose?emailId=` 这种
 * 写法会逼着页面再发一次请求去取那封邮件，后端也没有「取单封」的接口。
 */
import {MailComposer} from '@/components/domain'

defineOptions({name: 'compose'})
</script>

<template>
  <MailComposer />
</template>
