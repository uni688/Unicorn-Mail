<script setup>
/**
 * ScrollArea — L1 原语（§6.1：**原生滚动 + 自定义滚动条**，替换 `el-scrollbar` ×9）
 *
 * 为什么不用 Reka 的 `ScrollArea`（它确实在依赖里）：那套是「隐藏原生滚动条 +
 * JS 画一根 thumb」，代价是滚动位置要过一遍 JS、虚拟列表要多穿一层 viewport、
 * 移动端要额外处理惯性。我们的滚动条外观在 base.css 里已经用 `::-webkit-scrollbar`
 * + `scrollbar-color` 统一过了（§9.1），原生滚动已经足够好看，而且：
 * - 邮件列表要虚拟滚动 + 60fps（§10.4 P3 验收），少一层 JS 就是少一层风险；
 * - 键盘 PageUp/PageDown、触控板惯性、`scroll-behavior: smooth` 全部免费；
 * - `scrollIntoView()` 在原生容器里行为可预期。
 * 所以这个组件负责的是**容器语义**：溢出轴、滚动条粗细、边缘渐隐，以及
 * 「可滚动区域必须能被键盘滚动」这条 a11y 硬要求。
 *
 * a11y：一个只靠滚动查看的区域，如果里面没有可聚焦元素，键盘用户根本到不了它。
 * 因此默认 `focusable`：给 `tabindex="0"` + `role="region"` + 名称。里面本来就有
 * 一串按钮/链接（侧栏、邮件列表）时传 `:focusable="false"`，避免多一个空 Tab 停留点。
 */
import {computed, onMounted, ref, watch} from 'vue'
import {useEventListener, useResizeObserver} from '@vueuse/core'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'vertical'|'horizontal'|'both'} */
    orientation: {type: String, default: 'vertical'},
    /** @type {'auto'|'thin'|'hidden'} `hidden` 给横向 chips 这类「靠手势滚」的条 */
    scrollbar: {type: String, default: 'auto'},
    /** 内容溢出时在边缘做渐隐，提示「还有更多」 */
    fade: {type: Boolean, default: false},
    /** 给容器 `tabindex="0"`，让键盘能滚它 */
    focusable: {type: Boolean, default: true},
    /** `role="region"` 的可访问名称；`focusable` 时强烈建议给 */
    ariaLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const viewport = ref(null)

/** 亚像素的 scrollTop（缩放、rem 取整、粘性表头）不该让渐隐一直挂着 */
const TOLERANCE = 2

const atStart = ref(true)
const atEnd = ref(true)
const isHorizontal = computed(() => props.orientation === 'horizontal')

/**
 * 自己算而不用 `useScroll().arrivedState`：那个的初值是「顶部已到、底部未到」，
 * 在内容不溢出时会挂着一条永远不消失的底部渐隐（它只在 scroll 事件里更新）。
 */
function measure() {
    const el = viewport.value
    if (!el) {
        return
    }
    const pos = isHorizontal.value ? el.scrollLeft : el.scrollTop
    const size = isHorizontal.value ? el.clientWidth : el.clientHeight
    const total = isHorizontal.value ? el.scrollWidth : el.scrollHeight
    atStart.value = pos <= TOLERANCE
    atEnd.value = pos + size >= total - TOLERANCE
}

useEventListener(viewport, 'scroll', () => props.fade && measure(), {passive: true})
// 容器尺寸变了要重算；内容自己变多（追加邮件、图片加载完）请调用暴露出去的 measure()
useResizeObserver(viewport, () => props.fade && measure())
onMounted(measure)
watch(() => [props.fade, props.orientation], measure)

/**
 * 渐隐用 mask 而不是叠一层渐变色块：mask 让内容本身淡出到透明，因此不必知道
 * 容器背景色（ScrollArea 会出现在 canvas / surface / raised 三种底上）。
 */
const fadeStyle = computed(() => {
    if (!props.fade || (atStart.value && atEnd.value)) {
        return undefined
    }
    const dir = isHorizontal.value ? 'to right' : 'to bottom'
    const head = atStart.value ? '#000 0' : 'transparent 0, #000 24px'
    const tail = atEnd.value ? '#000 100%' : '#000 calc(100% - 24px), transparent 100%'
    return {maskImage: `linear-gradient(${dir}, ${head}, ${tail})`}
})

const OVERFLOW = {
    vertical: 'overflow-y-auto overflow-x-hidden',
    horizontal: 'overflow-x-auto overflow-y-hidden',
    both: 'overflow-auto',
}

const SCROLLBAR = {
    auto: '',
    // 6px 细条：抽屉、卡片内的小块滚动区，10px 会显得笨重
    thin: '[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:border-0',
    hidden: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

defineExpose({
    /** 原生滚动容器：`scrollTo` / `scrollIntoView` / 挂虚拟列表都用它 */
    viewport,
    /** 内容量变化后重算渐隐（追加列表项、图片加载完成） */
    measure,
})
</script>

<template>
  <div
    ref="viewport"
    :role="focusable ? 'region' : undefined"
    :tabindex="focusable ? 0 : undefined"
    :aria-label="ariaLabel || undefined"
    :class="cn(
      'min-h-0 min-w-0 overscroll-contain',
      OVERFLOW[orientation] ?? OVERFLOW.vertical,
      SCROLLBAR[scrollbar] ?? '',
      props.class,
    )"
    :style="fadeStyle"
  >
    <slot />
  </div>
</template>
