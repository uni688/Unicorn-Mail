import {cva} from 'class-variance-authority'

/**
 * Badge 变体（§4.11）：6 个色调 × 3 种实心程度 × 2 个尺寸。
 *
 * solid 的底色用 `-strong` 而不是 `-solid`：白字压在 500 档上只有 3.4~4.4:1。
 * subtle / outline 用 `-subtle-*` 与 `-solid`，这两组 P0 已经过了对比度测试。
 */
export const badgeVariants = cva(
    [
        'inline-flex shrink-0 select-none items-center gap-1 whitespace-nowrap',
        'rounded-sm border align-middle transition-colors',
    ],
    {
        variants: {
            tone: {
                neutral: '',
                accent: '',
                success: '',
                warning: '',
                danger: '',
                info: '',
            },
            /** @type {'solid'|'subtle'|'outline'} */
            appearance: {
                solid: 'border-transparent text-on-strong',
                subtle: 'border-transparent',
                outline: 'bg-transparent',
            },
            size: {
                sm: 'h-4.5 px-1.5 text-micro',
                md: 'h-5.5 px-2 text-caption',
            },
        },
        compoundVariants: [
            // --- solid：实底 + 白字 ---
            {appearance: 'solid', tone: 'neutral', class: 'bg-neutral-strong'},
            {appearance: 'solid', tone: 'accent', class: 'bg-accent text-on-accent'},
            {appearance: 'solid', tone: 'success', class: 'bg-success-strong'},
            {appearance: 'solid', tone: 'warning', class: 'bg-warning-strong'},
            {appearance: 'solid', tone: 'danger', class: 'bg-danger-strong'},
            {appearance: 'solid', tone: 'info', class: 'bg-info-strong'},
            // --- subtle：淡底 + 同色深字 ---
            {appearance: 'subtle', tone: 'neutral', class: 'bg-inset text-fg-muted'},
            {appearance: 'subtle', tone: 'accent', class: 'bg-accent-subtle text-accent-subtle-fg'},
            {appearance: 'subtle', tone: 'success', class: 'bg-success-subtle text-success-fg'},
            {appearance: 'subtle', tone: 'warning', class: 'bg-warning-subtle text-warning-fg'},
            {appearance: 'subtle', tone: 'danger', class: 'bg-danger-subtle text-danger-fg'},
            {appearance: 'subtle', tone: 'info', class: 'bg-info-subtle text-info-fg'},
            // --- outline：描边 + 同色字 ---
            {appearance: 'outline', tone: 'neutral', class: 'border-line-strong text-fg-muted'},
            {appearance: 'outline', tone: 'accent', class: 'border-accent-line text-accent-fg'},
            {appearance: 'outline', tone: 'success', class: 'border-success text-success-fg'},
            {appearance: 'outline', tone: 'warning', class: 'border-warning text-warning-fg'},
            {appearance: 'outline', tone: 'danger', class: 'border-danger text-danger-fg'},
            {appearance: 'outline', tone: 'info', class: 'border-info text-info-fg'},
        ],
        defaultVariants: {
            tone: 'neutral',
            appearance: 'subtle',
            size: 'md',
        },
    },
)
