/**
 * L2 复合组件的总出口（§10.2 `components/composite/`）
 *
 * 与 L1（`components/ui`）的分界：L1 是无业务语义的原语，L2 认识布局与页面结构
 * （AppShell / Topbar / CommandBar / Sidebar…），也包含材质背板这类布局级构件。
 *
 * 用法：`import {AppShell, GlassCard} from '@/components/composite'`
 */

/* ------------------------------------------------------------------ 材质 */
export {default as GlassCard} from './GlassCard.vue'
export {default as ParticleField} from './ParticleField.vue'

/* ------------------------------------------------------------------ 外壳 */
export {default as AppShell} from './AppShell.vue'
export {default as BrandMark} from './BrandMark.vue'
export {default as Topbar} from './Topbar.vue'
export {default as CommandBar} from './CommandBar.vue'
export {default as Sidebar} from './Sidebar.vue'
export {default as SidebarGroup} from './SidebarGroup.vue'
export {default as SidebarItem} from './SidebarItem.vue'
export {default as TabBar} from './TabBar.vue'

/* ------------------------------------------------------------------ 表单 */
/* 由 L1 拼出来的联体控件：本身不认业务字段，所以不进 L3（§5.3.1 的邮箱与密码行） */
export {default as EmailInput} from './EmailInput.vue'
export {default as PasswordInput} from './PasswordInput.vue'

/* ------------------------------------------------------------------ 浮层 */
export {default as CommandPalette} from './CommandPalette.vue'
export {default as ShortcutsDialog} from './ShortcutsDialog.vue'
