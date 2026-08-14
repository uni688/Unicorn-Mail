/**
 * L1 原语的总出口
 *
 * 按「用途」分组而不是按字母排，找组件时更接近人的思路。日常用法：
 * `import {Button, Input, Field} from '@/components/ui'`；只要一个组件时也可以
 * 直接进子目录（`@/components/ui/Button`），两种写法都受支持。
 *
 * `_shared/` 里只导出宿主真的会用到的两个 hook（i18n / 语言），
 * 变体函数属于内部实现，要用就自己进 `_shared`，免得 API 面越滚越大。
 */

/* -------------------------------------------------------------- 基础与展示 */
export * from './Avatar/index.js'
export * from './Badge/index.js'
export * from './Code/index.js'
export * from './Kbd/index.js'
export * from './Separator/index.js'
export * from './Skeleton/index.js'
export * from './Spinner/index.js'
export * from './VisuallyHidden/index.js'

/* ------------------------------------------------------------------ 动作 */
export * from './Button/index.js'
export * from './CopyButton/index.js'

/* ------------------------------------------------------------ 表单与输入 */
export * from './Checkbox/index.js'
export * from './Combobox/index.js'
export * from './DatePicker/index.js'
export * from './Field/index.js'
export * from './Input/index.js'
export * from './NumberInput/index.js'
export * from './Radio/index.js'
export * from './Segmented/index.js'
export * from './Select/index.js'
export * from './Switch/index.js'
export * from './TagsInput/index.js'
export * from './Textarea/index.js'

/* ------------------------------------------------------------ 浮层与菜单 */
export * from './AlertDialog/index.js'
export * from './Command/index.js'
export * from './ContextMenu/index.js'
export * from './Dialog/index.js'
export * from './DropdownMenu/index.js'
export * from './HoverCard/index.js'
export * from './Menu/index.js'
export * from './Popover/index.js'
export * from './Sheet/index.js'
export * from './Toast/index.js'
export * from './Tooltip/index.js'

/* ------------------------------------------------------ 布局、导航与数据 */
export * from './Collapsible/index.js'
export * from './Pagination/index.js'
export * from './ScrollArea/index.js'
export * from './Tabs/index.js'
export * from './Tree/index.js'

/* ------------------------------------------------------------------ 反馈 */
export * from './Meter/index.js'
export * from './Progress/index.js'

/* -------------------------------------------------------------- 宿主接线 */
export {UI_TEXT_FALLBACK, resolveUiText, useUiText} from './_shared/useUiText.js'
export {UI_LOCALE_FALLBACK, useUiLocale} from './_shared/useUiLocale.js'
