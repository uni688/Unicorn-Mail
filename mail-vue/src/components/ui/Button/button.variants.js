import {cva} from 'class-variance-authority'

/**
 * Button 变体（§4.11 矩阵 / §6.2 规格）
 *
 * 硬规则：
 * - 过渡只动颜色，不做位移、不做缩放（§6.2）
 * - danger 的底色用 `-strong` 而不是 `-solid`：白字压在 danger-solid 上只有
 *   4.38:1（深色 2.92:1），过不了 AA；hover/active 按 §6.2 用 brightness ±8%
 * - 焦点环由 base.css 的全局 :focus-visible 提供，这里只在 danger 上换环色
 */
export const buttonVariants = cva(
    [
        'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5',
        'whitespace-nowrap rounded-md align-middle',
        'transition-[color,background-color,border-color,box-shadow,filter]',
        'aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed',
        'data-loading:cursor-progress',
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
                    'aria-disabled:bg-inset aria-disabled:text-fg-disabled',
                ],
                secondary: [
                    'border border-line-strong bg-surface text-fg shadow-xs',
                    'hover:bg-hover active:bg-active',
                    'aria-disabled:border-line aria-disabled:bg-inset aria-disabled:text-fg-disabled aria-disabled:shadow-none',
                ],
                ghost: [
                    'text-fg-muted hover:bg-hover hover:text-fg active:bg-active',
                    'aria-disabled:bg-transparent aria-disabled:text-fg-disabled',
                ],
                danger: [
                    'bg-danger-strong text-on-strong outline-danger-strong',
                    'hover:brightness-[1.08] active:brightness-[0.92]',
                    'aria-disabled:bg-inset aria-disabled:text-fg-disabled aria-disabled:brightness-100',
                ],
                link: [
                    'text-accent-fg underline-offset-4 hover:underline',
                    'aria-disabled:text-fg-disabled aria-disabled:no-underline',
                ],
            },
            size: {
                sm: 'h-7 gap-1 px-2.5 text-label',
                md: 'h-8 px-3 text-label',
                lg: 'h-[38px] px-4 text-body',
                icon: 'size-8 gap-0 p-0',
                'icon-sm': 'size-7 gap-0 p-0',
            },
            block: {
                true: 'w-full',
                false: '',
            },
        },
        compoundVariants: [
            // 链接态没有可点的方块，去掉高度与内边距，行内跟随文字
            {variant: 'link', class: 'h-auto rounded-xs px-0 py-0'},
        ],
        defaultVariants: {
            variant: 'secondary',
            size: 'md',
            block: false,
        },
    },
)
