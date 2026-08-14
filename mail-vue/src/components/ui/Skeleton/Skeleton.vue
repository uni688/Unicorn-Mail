<script setup>
/**
 * Skeleton — L1 原语（§6.2）
 *
 * 硬规则：形状必须与真实内容同尺寸同位置，否则数据到位时会抖（CLS）。
 * 所以这里不提供「万能骨架」，只提供三种几何 + 可控行数，尺寸由调用方按真实内容给。
 *
 * - 动画是 1600ms 的 background-position 微光（token `--animate-skeleton`），
 *   `prefers-reduced-motion` 下由 base.css 统一冻结成静态底色
 * - 整块骨架应由容器统一挂 `aria-busy="true"`，骨架自身对读屏隐身
 */
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** @type {'text'|'rect'|'circle'} */
    variant: {type: String, default: 'text'},
    /** variant=text 时的行数；最后一行会短一截，模拟自然段落 */
    lines: {type: Number, default: 1},
    /** 任意 CSS 宽高，直接透传（如 '120px' / '60%'） */
    width: {type: String, default: ''},
    height: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const SHIMMER = 'bg-[image:var(--um-skeleton-gradient)] bg-[size:200%_100%] animate-skeleton'

const shape = computed(() => {
    if (props.variant === 'circle') return 'rounded-full'
    if (props.variant === 'rect') return 'rounded-md'
    // text：行高 0.875rem ≈ 正文 x-height，圆角小一点更像文字块
    return 'h-3.5 rounded-xs'
})

const style = computed(() => ({
    width: props.width || undefined,
    height: props.height || undefined,
}))
</script>

<template>
  <div v-if="variant === 'text' && lines > 1" class="flex w-full flex-col gap-2" aria-hidden="true">
    <div
      v-for="i in lines"
      :key="i"
      :class="cn(SHIMMER, shape, 'w-full', i === lines && 'w-3/5', props.class)"
      :style="i === lines ? undefined : style"
    />
  </div>
  <div
    v-else
    :class="cn(SHIMMER, shape, variant === 'text' && !width && 'w-full', props.class)"
    :style="style"
    aria-hidden="true"
  />
</template>
