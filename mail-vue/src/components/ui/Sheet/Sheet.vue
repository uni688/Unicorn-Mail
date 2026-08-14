<script setup>
/**
 * Sheet — L1 原语（`vaul-vue`，§6.1 / §5.4 / §8.1）
 *
 * 移动端承载文件夹、筛选、邮箱切换、批量操作、更多菜单（§5.4）。替换现状
 * `main/index.vue` 里那套 `translateX(-100%)` 手写抽屉 —— 它没有手势、没有
 * 焦点陷阱，而且左滑抽屉与系统返回手势打架（§5.4 明确改成底部升起）。
 *
 * vaul 只管手势与位移，位置/圆角/配色全由这里给：
 * - `side="bottom"` 时顶部圆角 `2xl(20)`（§4.7 给移动端 Sheet 的专属半径）
 * - 拖拽把手只在 bottom/top 出现；左右抽屉拖的是整个面板
 * - 时长与把手配色的第三方覆盖在 `design/compat-vaul.css`（vaul 写死 .5s + #e2e2e4）
 *
 * 玻璃材质（§4.12 允许 Sheet 用）留到 L2 的 GlassCard 再叠：§5.1 规定只有
 * GlassCard/Overlay/ParticleField 三个组件可以读 --um-glass-*，原语不越线。
 *
 * 叠层：§5.4 要求邮箱列表在同一个 Sheet 内二级推入，不要叠第二层 Sheet，
 * 所以这里不暴露 nested，需要嵌套时由调用方自己上 DrawerRootNested。
 *
 * 两个继承来的坑（vaul 的底子是 reka 的 Dialog，所以 Dialog 那边的问题这里都有）：
 * - 那句 `v-bind` 和 Dialog 同因：reka 无条件写 `aria-describedby`，而
 *   DrawerDescription 只在有 description 时渲染，剩一个悬空引用（axe
 *   aria-valid-attr-value，serious）。attrs 落在 DialogContentImpl 自己那串属性
 *   后面，所以外面传同名属性能盖掉它。
 * - vaul 自己 `watch(isOpen, …, {immediate: true})` 再发 `update:open`，
 *   受控打开时会回声一次 `update:open(true)`（值没变，v-model 无害）。
 */
import {
    DrawerClose, DrawerContent, DrawerDescription, DrawerHandle,
    DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger,
} from 'vaul-vue'
import {VisuallyHidden} from 'reka-ui'
import IconX from '~icons/lucide/x'
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'
import {OVERLAY_BASE} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    open: {type: Boolean, default: undefined},
    /** 从哪一边升起 @type {'bottom'|'top'|'left'|'right'} */
    side: {type: String, default: 'bottom'},
    title: {type: String, default: ''},
    /** 没有可见标题时的读屏名称 */
    ariaLabel: {type: String, default: ''},
    description: {type: String, default: ''},
    /** 拖拽把手（默认只在上下方向出现） */
    handle: {type: Boolean, default: undefined},
    /** 右上角关闭按钮（bottom 方向默认交给把手，不再加 X） */
    closable: {type: Boolean, default: undefined},
    /** 拖拽 / 点遮罩 / Esc 是否关闭 */
    dismissible: {type: Boolean, default: true},
    /** false 时可以继续操作 Sheet 外面的东西 */
    modal: {type: Boolean, default: true},
    /** 吸附点，如 [0.4, 1]；给了就出现多档高度 */
    snapPoints: {type: Array, default: undefined},
    activeSnapPoint: {type: [String, Number], default: undefined},
    /** 只允许拖把手（内容里有横向滚动/滑块时打开，避免误拖） */
    handleOnly: {type: Boolean, default: false},
    /** 左右抽屉的宽度 / 上下 Sheet 的最大高度 */
    size: {type: String, default: undefined},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open', 'update:activeSnapPoint', 'close'])
const t = useUiText()

const isVertical = computed(() => props.side === 'bottom' || props.side === 'top')
const showHandle = computed(() => props.handle ?? isVertical.value)
// 上下方向有把手当关闭线索，左右抽屉没有，所以给个 X
const showClose = computed(() => props.closable ?? !isVertical.value)

/** 位置 + 圆角 + 边框：只有贴屏那一边不要圆角和边框 */
const SIDE = {
    bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t',
    top: 'inset-x-0 top-0 max-h-[85vh] rounded-b-2xl border-b',
    left: 'inset-y-0 left-0 w-[85vw] max-w-sm rounded-r-2xl border-r',
    right: 'inset-y-0 right-0 w-[85vw] max-w-sm rounded-l-2xl border-l',
}
</script>

<template>
  <DrawerRoot
    :open="open"
    :direction="side"
    :dismissible="dismissible"
    :modal="modal"
    :snap-points="snapPoints"
    :active-snap-point="activeSnapPoint"
    :handle-only="handleOnly"
    @update:open="emit('update:open', $event)"
    @update:active-snap-point="emit('update:activeSnapPoint', $event)"
    @close="emit('close')"
  >
    <DrawerTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DrawerTrigger>

    <DrawerPortal>
      <DrawerOverlay :class="OVERLAY_BASE" />
      <DrawerContent
        :class="cn(
          'fixed z-50 flex flex-col border-line bg-raised shadow-lg outline-none',
          SIDE[side],
          size,
          props.contentClass,
        )"
        v-bind="description ? {} : {'aria-describedby': undefined}"
      >
        <!-- 把手是纯指针 affordance（点击会切吸附档），键盘/读屏走 Esc 与关闭按钮，
             所以对辅助技术隐藏，避免读出一个按不动的「按钮」 -->
        <DrawerHandle
          v-if="showHandle"
          class="my-3 shrink-0"
          aria-hidden="true"
        />

        <div
          v-if="title || description || $slots.header || showClose"
          class="flex shrink-0 items-start gap-3 px-4 pt-1 pb-3"
          :class="{'pt-4': !showHandle}"
        >
          <div class="min-w-0 flex-1">
            <DrawerTitle v-if="title" class="text-title text-fg">{{ title }}</DrawerTitle>
            <VisuallyHidden v-else as-child>
              <DrawerTitle>{{ ariaLabel || t('dialog') }}</DrawerTitle>
            </VisuallyHidden>
            <DrawerDescription v-if="description" class="mt-1 text-label text-fg-muted">
              {{ description }}
            </DrawerDescription>
            <slot name="header" />
          </div>
          <DrawerClose
            v-if="showClose"
            :aria-label="t('close')"
            class="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <IconX class="size-4" aria-hidden="true" />
          </DrawerClose>
        </div>
        <VisuallyHidden v-else as-child>
          <DrawerTitle>{{ ariaLabel || title || t('dialog') }}</DrawerTitle>
        </VisuallyHidden>

        <!-- 内容自己滚：vaul 在滚动容器里会暂停拖拽（scrollLockTimeout），两者不打架 -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-body text-fg">
          <slot />
        </div>

        <div
          v-if="$slots.footer"
          class="shrink-0 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <slot name="footer" />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
