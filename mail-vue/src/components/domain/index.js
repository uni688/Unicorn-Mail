/**
 * L3 业务组件的总出口（§10.2 `components/domain/`）
 *
 * 与 L2（`components/composite`）的分界：L2 只认识布局与页面结构，L3 认识**业务字段**
 * —— 权限键、角色额度、邮件状态。所以 MiniQuota 在这里而不是 composite 里：
 * 它读 `userStore.user.role` 和 `hasPerm()`。
 *
 * 用法：`import {MiniQuota} from '@/components/domain'`
 */

export {default as MiniQuota} from './MiniQuota.vue'

/* 邮件区（§7.4）：列表是虚拟化的，行只读邮件对象，两者都不认路由 */
export {default as MailList} from './MailList.vue'
export {default as MailRow} from './MailRow.vue'

/* 阅读窗格（§7.5 / §7.6）：正文先净化再进 Shadow DOM，默认屏蔽远程图片 */
export {default as MailReader} from './MailReader.vue'
export {default as MailBody} from './MailBody.vue'

/* 列表 + 阅读窗格的双栏工作区（§7.5）：四个邮件视图的共同形状 */
export {default as MailWorkspace} from './MailWorkspace.vue'
