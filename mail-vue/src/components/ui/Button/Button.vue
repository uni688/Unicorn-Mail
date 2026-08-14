<script setup>
/**
 * Button — L1 原语（§4.11 / §6.2）
 *
 * - 5 变体 × 5 尺寸 × loading/disabled，过渡只动颜色
 * - loading：图标位换成 12px spinner，文案保留，`aria-busy`，点击被吞掉（防重复提交）；
 *   为了让读屏在 loading 期间还能停在按钮上，这里不加原生 disabled，只拦事件
 * - icon-only（size=icon / icon-sm）必须给 `label`，它同时是 aria-label（§4.10）
 *
 * 模板里 asChild 单独走一支：reka 的 Slot 把样式合并到「第一个非注释子节点」上，这一支
 * 若还塞 spinner/icon，loading 时样式就会落到 svg 而不是宿主节点。所以它只透传默认插槽，
 * 图标由调用方自己排（渲染权已经交给它了）。
 */
import {computed} from 'vue'
import {Primitive} from 'reka-ui'
import IconLoader from '~icons/lucide/loader-circle'
import {cn} from '@/utils/cn.js'
import {buttonVariants} from './button.variants.js'

const props = defineProps({
    /** @type {'primary'|'secondary'|'ghost'|'danger'|'link'} */
    variant: {type: String, default: 'secondary'},
    /** @type {'sm'|'md'|'lg'|'icon'|'icon-sm'} */
    size: {type: String, default: 'md'},
    /** 撑满父容器宽度 */
    block: {type: Boolean, default: false},
    /** 进行中：吞掉点击并显示 spinner */
    loading: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** 无可见文字时的无障碍名称；icon-only 必填 */
    label: {type: String, default: ''},
    /** 渲染成别的标签（如 'a'）；配合 asChild 时由子节点决定 */
    as: {type: String, default: 'button'},
    asChild: {type: Boolean, default: false},
    /** @type {'button'|'submit'|'reset'} */
    type: {type: String, default: 'button'},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['click'])

const isNativeButton = computed(() => !props.asChild && props.as === 'button')
const isIconOnly = computed(() => props.size === 'icon' || props.size === 'icon-sm')

if (import.meta.env.DEV) {
    // 运行期兜底：JS 里没法像 TS 那样强制，只能在开发时喊一声（§4.10）
    if (isIconOnly.value && !props.label) {
        console.warn('[ui/Button] size="%s" 是 icon-only，必须传 label 作为 aria-label', props.size)
    }
}

const rootClass = computed(() =>
    cn(buttonVariants({variant: props.variant, size: props.size, block: props.block}), props.class),
)

function onClick(event) {
    if (props.disabled || props.loading) {
        event.preventDefault()
        event.stopPropagation()
        return
    }
    emit('click', event)
}
</script>

<template>
  <Primitive
    v-if="asChild"
    as-child
    :aria-disabled="disabled || undefined"
    :aria-busy="loading || undefined"
    :aria-label="label || undefined"
    :data-loading="loading ? '' : undefined"
    :data-variant="variant"
    :class="rootClass"
    @click="onClick"
  >
    <slot />
  </Primitive>
  <Primitive
    v-else
    :as="as"
    :type="isNativeButton ? type : undefined"
    :disabled="isNativeButton && disabled ? true : undefined"
    :aria-disabled="disabled || undefined"
    :aria-busy="loading || undefined"
    :aria-label="label || undefined"
    :data-loading="loading ? '' : undefined"
    :data-variant="variant"
    :class="rootClass"
    @click="onClick"
  >
    <IconLoader v-if="loading" class="size-3 shrink-0 animate-spin" aria-hidden="true" />
    <slot v-else name="icon" />
    <slot />
    <slot v-if="!isIconOnly" name="suffix" />
  </Primitive>
</template>
