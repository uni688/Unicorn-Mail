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
