<script setup>
/**
 * AlertDialog — L1 原语（Reka `AlertDialog`，§4.11）
 *
 * 替换 `ElMessageBox.confirm`。和 Dialog 的差别不只是长相：
 * - role="alertdialog"，初始焦点落在「取消」而不是「确定」（防手滑删邮件）
 * - 没有关闭 X，也不能点遮罩关闭 —— 必须显式选一边，这是 reka 的默认行为
 *   （Esc 仍然能关：那是键盘用户的退路，reka 只拦了 pointerDownOutside）
 * - `tone="danger"` 时确认按钮走 danger 变体；破坏性操作的文案必须动词化
 *   （「删除」而不是「确定」），由调用方传 `confirmText`
 *
 * 确认按钮**故意不套** `AlertDialogAction`：那个的底子是 `DialogClose`，onClick 里
 * 无条件 `onOpenChange(false)` 且不看 defaultPrevented —— 套上就等于「点了必关」，
 * 异步删除的结果还没回来面板就没了。所以这里只发 `confirm`，关不关由调用方决定。
 * 取消按钮相反，必须留着 `AlertDialogCancel`：reka 的初始焦点就是靠它拿到元素的。
 *
 * `loading` 期间：确认按钮由 Button 自己吞掉点击（防重复提交，不加原生 disabled 好让
 * 读屏焦点留在原地），取消按钮走原生 disabled。
 *
 * 那句 `v-bind` 和 Dialog 同因：reka 无条件写 aria-describedby，没 description 时
 * 会剩一个指向不存在 id 的悬空引用（axe aria-valid-attr-value，serious）。
 */
import {
    AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle, AlertDialogTrigger,
} from 'reka-ui'
import Button from '../Button/Button.vue'
import {cn} from '@/utils/cn.js'
import {OVERLAY_CLASS} from '../_shared/overlay.variants.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    open: {type: Boolean, default: undefined},
    title: {type: String, required: true},
    description: {type: String, default: ''},
    confirmText: {type: String, default: ''},
    cancelText: {type: String, default: ''},
    /** @type {'default'|'danger'} */
    tone: {type: String, default: 'default'},
    /** 确认动作进行中 */
    loading: {type: Boolean, default: false},
    contentClass: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open', 'confirm', 'cancel'])
const t = useUiText()

function onConfirm() {
    // 关不关由调用方决定：异步操作要等结果，所以这里只报事件（Button 在 loading 期间
    // 自己就不会派 click，不用再挡一次）
    emit('confirm')
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>

    <AlertDialogPortal>
      <AlertDialogOverlay :class="OVERLAY_CLASS" />
      <AlertDialogContent
        :class="cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-line bg-raised p-5 shadow-xl',
          'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
          props.contentClass,
        )"
        v-bind="description ? {} : {'aria-describedby': undefined}"
      >
        <AlertDialogTitle class="text-title text-fg">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="description" class="mt-2 text-body text-fg-muted">
          {{ description }}
        </AlertDialogDescription>
        <div v-if="$slots.default" class="mt-3 text-body text-fg">
          <slot />
        </div>

        <div class="mt-5 flex items-center justify-end gap-2">
          <AlertDialogCancel as-child>
            <Button variant="secondary" :disabled="loading" @click="emit('cancel')">
              {{ cancelText || t('cancel') }}
            </Button>
          </AlertDialogCancel>
          <Button
            :variant="tone === 'danger' ? 'danger' : 'primary'"
            :loading="loading"
            @click="onConfirm"
          >
            {{ confirmText || t('confirm') }}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
