<script setup>
/**
 * Dialog — L1 原语（Reka `Dialog`，§4.11 / §8.1）
 *
 * 替换 el-dialog ×30。相对 EP 的关键改进：
 * - 标题强制存在（DialogTitle 是 aria-labelledby 的来源，缺了读屏只念「对话框」）；
 *   没有可见标题时用 `ariaLabel`，内部塞进 VisuallyHidden，语义不打折
 * - 焦点陷阱、Esc、滚动锁定、返回焦点到触发器全由 reka 负责（EP 的实现漏了返回焦点）
 * - `dismissible=false` 时点遮罩/按 Esc 都不关闭，用于「提交中别手滑」的场景
 *
 * 那句 `v-bind` 是在补 reka 的一个洞：`DialogContentImpl` 无条件写
 * `aria-describedby="reka-dialog-description-x"`，而 `DialogDescription` 只在有
 * description 时才渲染 —— 没描述时就剩一个指向不存在 id 的引用（axe
 * aria-valid-attr-value，serious）。它把 `$attrs` 合在自己那串属性后面，
 * 所以外面传同名属性能盖掉它。
 *
 * 布局是 flex 三段：头固定、身体滚动、脚固定，避免长表单把按钮推到屏幕外。
 */
import {
    DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal,
    DialogRoot, DialogTitle, DialogTrigger, VisuallyHidden,
} from 'reka-ui'
import IconX from '~icons/lucide/x'
import {cn} from '@/utils/cn.js'
import {OVERLAY_CLASS} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    open: {type: Boolean, default: undefined},
    title: {type: String, default: ''},
    /** 没有可见标题时的读屏名称 */
    ariaLabel: {type: String, default: ''},
    description: {type: String, default: ''},
    /** @type {'sm'|'md'|'lg'|'xl'|'full'} */
    size: {type: String, default: 'md'},
    /** 右上角关闭按钮 */
    closable: {type: Boolean, default: true},
    /** 点遮罩 / Esc 是否关闭 */
    dismissible: {type: Boolean, default: true},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])
const t = useUiText()

const SIZE = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-[calc(100vw-2rem)]',
}

function guard(event) {
    if (!props.dismissible) event.preventDefault()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogTrigger v-if="$slots.trigger" as-child :class="props.class">
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay :class="OVERLAY_CLASS" />
      <DialogContent
        :class="cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-xl border border-line bg-raised shadow-xl',
          'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
          SIZE[size],
          props.contentClass,
        )"
        v-bind="description ? {} : {'aria-describedby': undefined}"
        @escape-key-down="guard"
        @pointer-down-outside="guard"
        @interact-outside="guard"
      >
        <div class="flex items-start gap-3 px-5 pt-4 pb-3">
          <div class="min-w-0 flex-1">
            <DialogTitle v-if="title" class="text-title text-fg">{{ title }}</DialogTitle>
            <VisuallyHidden v-else as-child>
              <DialogTitle>{{ ariaLabel || t('dialog') }}</DialogTitle>
            </VisuallyHidden>
            <DialogDescription v-if="description" class="mt-1 text-label text-fg-muted">
              {{ description }}
            </DialogDescription>
            <slot name="header" />
          </div>
          <DialogClose
            v-if="closable"
            :aria-label="t('close')"
            class="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <IconX class="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-1 text-body text-fg">
          <slot />
        </div>

        <div v-if="$slots.footer" class="flex items-center justify-end gap-2 px-5 pt-3 pb-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
