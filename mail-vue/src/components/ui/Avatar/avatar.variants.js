import {cva} from 'class-variance-authority'

/**
 * Avatar 变体（§4.11）
 *
 * fallback 的配色直接复用 Badge 的 subtle 组合（`-subtle-bg` + `-subtle-fg`），
 * 这一组 P0 的对比度测试已经覆盖到 ≥4.5:1——首字母是要读的文字，不能按 3:1 收。
 * 反过来「白字压在 chart-N 上」只有 3.4:1 左右，所以这里不做彩色随机头像。
 */
export const avatarVariants = cva('relative inline-flex shrink-0 select-none align-middle', {
    variants: {
        size: {
            xs: 'size-5',
            sm: 'size-6',
            md: 'size-8',
            lg: 'size-10',
            xl: 'size-14',
        },
        shape: {
            circle: 'rounded-full',
            rounded: 'rounded-md',
        },
    },
    defaultVariants: {size: 'md', shape: 'circle'},
})

export const avatarFallbackVariants = cva(
    'flex size-full items-center justify-center overflow-hidden uppercase',
    {
        variants: {
            tone: {
                neutral: 'bg-inset text-fg-muted',
                accent: 'bg-accent-subtle text-accent-subtle-fg',
                success: 'bg-success-subtle text-success-fg',
                warning: 'bg-warning-subtle text-warning-fg',
                danger: 'bg-danger-subtle text-danger-fg',
                info: 'bg-info-subtle text-info-fg',
            },
            size: {
                xs: 'text-[9px] leading-none font-semibold',
                sm: 'text-micro',
                md: 'text-caption',
                lg: 'text-label',
                xl: 'text-title',
            },
            shape: {
                circle: 'rounded-full',
                rounded: 'rounded-md',
            },
        },
        defaultVariants: {tone: 'neutral', size: 'md', shape: 'circle'},
    },
)
