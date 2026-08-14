<script setup>
/**
 * Toaster — L1 原语（`vue-sonner`，§6.1 / §4.11 的 Toast 规格在 §「Toast」一节）
 *
 * 全局只挂一个，位置按 §Toast 规格走：桌面右下、移动端顶部（避开底部 Tab）。
 * 最多同时 3 条，其余排队。
 *
 * 走 `unstyled` + `toastOptions.classes`：sonner 自带皮肤是写死的灰阶 + 13px 字号 +
 * 自己的圆角/阴影，和 token 体系没有交集，改 CSS 变量只能改一部分（描述色、
 * 按钮色都是硬编码）。unstyled 之后保留的是它真正值钱的部分 —— 定位、堆叠、
 * 手势滑走、hover 暂停计时、`aria-live` 播报。剩下三处第三方样式在
 * `design/compat-sonner.css` 里压掉（400ms 时长、box-shadow 焦点环、字体栈）。
 *
 * 图标必须由这里的插槽提供：unstyled 下 sonner 不渲染自带图标，
 * 而 `[data-icon]` 容器一直在，缺插槽就是一个空盒子。
 *
 * 不传 `theme`：sonner 有一条**没有** data-styled 门禁的暗色规则会把关闭按钮
 * 刷成它自己的灰，让它一直以为是 light，暗色由我们的 token 负责。
 */
import {computed} from 'vue'
import {Toaster as SonnerToaster} from 'vue-sonner'
// sonner 的 lib 入口不带 CSS 副作用，必须显式引；定位/堆叠/手势全靠它
import 'vue-sonner/style.css'
import {useMediaQuery} from '@vueuse/core'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconCircleX from '~icons/lucide/circle-x'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconInfo from '~icons/lucide/info'
import IconX from '~icons/lucide/x'
import Spinner from '../Spinner/Spinner.vue'
import {useUiText} from '../_shared/useUiText.js'
import {setToastText} from './toast.js'

const props = defineProps({
    /** 覆盖自适应位置（默认桌面 bottom-right / 移动 top-center） */
    position: {type: String, default: undefined},
    /** 同时可见的条数，多的排队（§Toast：最多 3 条） */
    visibleToasts: {type: Number, default: 3},
    /** true = 所有条目展开排列；false = 收起成叠，hover 才展开 */
    expand: {type: Boolean, default: false},
    offset: {type: [String, Number, Object], default: undefined},
})

const t = useUiText()
// toast() 在模块作用域被调用，拿不到组件实例 → 把带 i18n 的解析器交给它
setToastText(t)

const isDesktop = useMediaQuery('(min-width: 768px)')
const position = computed(() => props.position ?? (isDesktop.value ? 'bottom-right' : 'top-center'))

/**
 * unstyled 下的完整外观。DOM 顺序是
 * [关闭按钮] [data-icon] [data-content[data-title][data-description]] [cancel] [action]，
 * 关闭按钮在最前面，所以用 `order-last` 把它推到视觉末尾（Tab 顺序仍然先到它，
 * 对一条马上要消失的通知来说这反而是对的）。
 */
const TOAST_CLASSES = {
    toast: [
        'pointer-events-auto flex w-full items-start gap-3 overflow-hidden',
        'rounded-lg border border-line bg-raised p-3 text-fg shadow-lg',
    ].join(' '),
    icon: 'mt-px flex size-4 shrink-0 items-center justify-center',
    content: 'min-w-0 flex-1',
    title: 'text-body-strong text-fg',
    description: 'mt-0.5 text-caption text-fg-muted',
    // 撤销这类动作按钮：次要样式，别抢邮件列表的注意力
    actionButton: [
        'order-last shrink-0 self-center rounded-md border border-line bg-surface px-2 py-1',
        'text-label text-fg transition-colors hover:bg-hover',
    ].join(' '),
    cancelButton: 'order-last shrink-0 self-center rounded-md px-2 py-1 text-label text-fg-muted transition-colors hover:bg-hover hover:text-fg',
    closeButton: 'order-last -mt-0.5 -mr-0.5 shrink-0 self-start rounded-sm p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg',
    // 图标颜色按类型给，只作用到 [data-icon]，不染标题正文
    success: '[&_[data-icon]]:text-success-fg',
    error: '[&_[data-icon]]:text-danger-fg',
    warning: '[&_[data-icon]]:text-warning-fg',
    info: '[&_[data-icon]]:text-info-fg',
    loading: '[&_[data-icon]]:text-fg-muted',
}

const toastOptions = computed(() => ({
    unstyled: true,
    classes: TOAST_CLASSES,
    closeButtonAriaLabel: t('close'),
}))
</script>

<template>
  <SonnerToaster
    :position="position"
    :visible-toasts="visibleToasts"
    :expand="expand"
    :offset="offset"
    :toast-options="toastOptions"
    :container-aria-label="t('notifications')"
    :gap="10"
  >
    <template #success-icon>
      <IconCircleCheck class="size-4" aria-hidden="true" />
    </template>
    <template #error-icon>
      <IconCircleX class="size-4" aria-hidden="true" />
    </template>
    <template #warning-icon>
      <IconTriangleAlert class="size-4" aria-hidden="true" />
    </template>
    <template #info-icon>
      <IconInfo class="size-4" aria-hidden="true" />
    </template>
    <template #loading-icon>
      <Spinner size="xs" />
    </template>
    <template #close-icon>
      <IconX class="size-3.5" aria-hidden="true" />
    </template>
  </SonnerToaster>
</template>
