import {clsx} from 'clsx'
import {extendTailwindMerge} from 'tailwind-merge'

/**
 * 类名合并（§6.3：变体用 cva 声明，外部传入的 class 用 tailwind-merge 合并）
 *
 * 为什么要 extend 而不是直接用 twMerge：
 * tokens.css 用 `@theme` 重写了 text-* 与 radius-* 的阶梯（text-body / text-title /
 * text-micro / text-mono / rounded-xs…）。tailwind-merge 内置的类组表只认默认阶梯，
 * 遇到 `text-body` 会归类成 font-size，遇到 `text-fg-muted` 归类成 color——两者
 * 恰好互斥，于是 `class="text-body text-fg-muted"` 会被误判为冲突并丢掉前一个。
 * 这里显式把自定义字阶登记进 font-size 组，颜色则交给默认的 text-color 组。
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [
                {
                    text: [
                        'display', 'title-lg', 'title', 'body-lg', 'body', 'body-strong',
                        'label', 'caption', 'micro', 'mono',
                    ],
                },
            ],
        },
    },
})

/**
 * @param {...any} inputs clsx 接受的任意形态（字符串 / 数组 / 条件对象）
 * @returns {string} 去重后的类名
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs))
}
