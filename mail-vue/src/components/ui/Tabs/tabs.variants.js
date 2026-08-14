import {cva} from 'class-variance-authority'

/**
 * Tabs 的两种形态（§4.11：`line` / `segmented` × `sm` / `md`）
 *
 * `line` 用于「页面级分区」（设置页的三级 section、邮件详情的正文/原文/附件），
 * `segmented` 用于「同一份数据的不同视图」（列表密度、图表粒度）——后者看起来像
 * 一个控件，前者看起来像导航。这个区分决定了用哪一个，而不是靠哪个好看。
 *
 * 不用 `TabsIndicator`（那个滑动指示条）：它要求额外一层绝对定位元素，并且
 * `line` 与 `segmented` 的定位逻辑完全不同（一条底边 vs 一整块底色）。这里改成
 * 「选中项自己画边框 / 自己给底色」，零额外元素、零布局抖动，切换只动颜色（§8.3）。
 */
export const tabsListVariants = cva('flex', {
    variants: {
        variant: {
            /** 整条边框是未选中项的「轨道」，选中项用负 margin 把自己的边框压在上面 */
            line: 'border-line',
            segmented: 'rounded-md bg-inset p-0.5',
        },
        orientation: {
            horizontal: 'items-center',
            vertical: 'flex-col items-stretch',
        },
    },
    compoundVariants: [
        {variant: 'line', orientation: 'horizontal', class: 'gap-4 border-b'},
        {variant: 'line', orientation: 'vertical', class: 'gap-1 border-l'},
        {variant: 'segmented', orientation: 'horizontal', class: 'gap-1'},
        {variant: 'segmented', orientation: 'vertical', class: 'gap-0.5'},
    ],
    defaultVariants: {variant: 'line', orientation: 'horizontal'},
})

export const tabsTriggerVariants = cva(
    [
        'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap',
        'text-fg-muted transition-colors',
        'hover:text-fg',
        'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:text-fg-disabled',
    ],
    {
        variants: {
            variant: {
                line: 'border-transparent data-[state=active]:border-accent data-[state=active]:text-fg',
                segmented: 'rounded-sm data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-xs',
            },
            size: {
                sm: 'text-label',
                md: 'text-body',
            },
            orientation: {
                horizontal: 'justify-center',
                vertical: 'justify-start',
            },
        },
        compoundVariants: [
            // line 的高度由 padding 给（边框要贴着文字）；segmented 由 h-* 给（与 Input 同高）
            {variant: 'line', orientation: 'horizontal', size: 'sm', class: '-mb-px border-b-2 px-0.5 pb-1.5'},
            {variant: 'line', orientation: 'horizontal', size: 'md', class: '-mb-px border-b-2 px-0.5 pb-2'},
            {variant: 'line', orientation: 'vertical', size: 'sm', class: '-ml-px border-l-2 py-1 pl-2.5'},
            {variant: 'line', orientation: 'vertical', size: 'md', class: '-ml-px border-l-2 py-1.5 pl-3'},
            {variant: 'segmented', size: 'sm', class: 'h-6 px-2'},
            {variant: 'segmented', size: 'md', class: 'h-7 px-2.5'},
        ],
        defaultVariants: {variant: 'line', size: 'md', orientation: 'horizontal'},
    },
)
