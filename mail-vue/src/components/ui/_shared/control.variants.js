import {cva} from 'class-variance-authority'

/**
 * 表单控件的共用外观（Input / Textarea / NumberInput / Select 触发器 / Combobox 输入框）
 *
 * 单独抽一份是因为「输入类控件必须长得一模一样」——一旦各自写一套，
 * 高度、圆角、描边就会慢慢漂移。变体轴与 Button 的 size 对齐（sm/md/lg 同高）。
 *
 * 焦点环不在这里：base.css 的全局 `:focus-visible` 已经统一提供（§4.7）。
 * 文本输入框在浏览器里聚焦即匹配 :focus-visible，所以键盘/鼠标都会看到环。
 */
export const controlVariants = cva(
    [
        'w-full min-w-0 rounded-md border bg-surface text-fg',
        'placeholder:text-fg-muted',
        'transition-[color,background-color,border-color,box-shadow]',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-inset disabled:text-fg-disabled',
        'aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-inset aria-disabled:text-fg-disabled',
    ],
    {
        variants: {
            size: {
                sm: 'h-7 px-2 text-label',
                md: 'h-8 px-2.5 text-body',
                lg: 'h-[38px] px-3 text-body',
            },
            invalid: {
                // 边框换色只是冗余提示，真正的信息在 aria-invalid + 错误文案里（§4.2）
                true: 'border-danger outline-danger',
                false: 'border-line-strong',
            },
            /** 自动高度的多行控件不能吃固定 h-* */
            auto: {
                true: 'h-auto',
                false: '',
            },
        },
        defaultVariants: {size: 'md', invalid: false, auto: false},
    },
)

/** 控件内嵌图标（前缀/后缀）的槽位尺寸，配合 controlVariants 的 padding 使用 */
export const CONTROL_ICON_SIZE = {
    sm: 'size-3.5',
    md: 'size-4',
    lg: 'size-4',
}

/** 有前缀/后缀图标时，输入框需要让出的内边距 */
export const CONTROL_PAD = {
    sm: {prefix: 'pl-7', suffix: 'pr-7'},
    md: {prefix: 'pl-8', suffix: 'pr-8'},
    lg: {prefix: 'pl-9', suffix: 'pr-9'},
}
