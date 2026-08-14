import {cva} from 'class-variance-authority'

/**
 * 浮层（Popover / DropdownMenu / ContextMenu / Select / Combobox / HoverCard / Command）的共用外观
 *
 * 抽公用的理由和 control.variants 一样：这些面板必须长得一模一样，
 * 否则「下拉的圆角比右键菜单大 2px」这种漂移一定会发生。
 *
 * 进出场动画走 tokens.css 的 --animate-popover-in/out（§8.1：进 160ms ease-out /
 * 出 120ms ease-in）。方向感来自 reka 注入的 --reka-popper-transform-origin，
 * 所以 transform-origin 挂在这里，而不是按 side 写四组关键帧。
 */
export const popoverPanelVariants = cva(
    [
        'z-50 rounded-lg border border-line bg-raised text-fg shadow-lg',
        'origin-(--reka-popper-transform-origin)',
        'data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out',
        // 菜单类浮层由 reka 接管键盘焦点，面板本身不需要再显示焦点环
        'focus:outline-none',
    ],
    {
        variants: {
            padding: {
                /** 菜单：列表项自己带 padding，面板只留 4px 让首末项不贴边 */
                menu: 'p-1',
                /** 内容型浮层（Popover / HoverCard） */
                content: 'p-3',
                none: 'p-0',
            },
        },
        defaultVariants: {padding: 'menu'},
    },
)

/**
 * 菜单项（DropdownMenu / ContextMenu / Select / Combobox / Command 共用）
 *
 * 高亮状态用 data-highlighted（reka 在键盘/指针移动时给），不用 :hover ——
 * 键盘上下移动时必须有同一套高亮，:hover 做不到。
 */
export const menuItemVariants = cva(
    [
        'relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5',
        'text-body text-fg outline-none select-none',
        'data-highlighted:bg-hover',
        'data-[state=checked]:text-accent-fg',
        'data-disabled:cursor-not-allowed data-disabled:text-fg-disabled data-disabled:bg-transparent',
        'aria-selected:bg-selected',
    ],
    {
        variants: {
            tone: {
                default: '',
                /** 破坏性操作（删除、清空回收站…） */
                danger: 'text-danger-fg data-highlighted:bg-danger-subtle',
            },
            /** 左侧留出勾选指示器/图标的槽位 */
            inset: {
                true: 'pl-7',
                false: '',
            },
        },
        defaultVariants: {tone: 'default', inset: false},
    },
)

/** 菜单里的分组标题 */
export const MENU_LABEL = 'px-2 py-1.5 text-caption text-fg-muted'

/** 菜单里的分隔线 */
export const MENU_SEPARATOR = '-mx-1 my-1 h-px bg-line'

/** 右侧的快捷键提示 */
export const MENU_SHORTCUT = 'ml-auto text-caption text-fg-muted'

/**
 * 模态遮罩（Dialog / AlertDialog / Sheet）
 *
 * backdrop-blur 是 §4.12 点名允许的 4 个玻璃面之一（浮层 + 其遮罩算一对）。
 */
export const OVERLAY_BASE = 'fixed inset-0 z-50 bg-overlay backdrop-blur-sm'

export const OVERLAY_CLASS = [
    OVERLAY_BASE,
    'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
].join(' ')
