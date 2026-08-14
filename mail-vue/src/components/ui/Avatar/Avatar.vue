<script setup>
/**
 * Avatar — L1 原语（§4.11）
 *
 * - 图片加载失败/未给 src 时退化成首字母；首字母由 `name` 推导，邮箱会先去掉 @ 之后
 * - 装饰性用法（旁边已经有名字文本）传 `decorative`，图片走 alt=""、首字母 aria-hidden，
 *   免得读屏把同一个人念两遍
 * - `status` 是右下角的在线/离线点，带 `title` 才会被读出来，否则纯装饰
 */
import {computed} from 'vue'
import {AvatarFallback, AvatarImage, AvatarRoot} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {avatarFallbackVariants, avatarVariants} from './avatar.variants.js'

const props = defineProps({
    src: {type: String, default: ''},
    /** 用于推导首字母与无障碍名称；可以是昵称，也可以是完整邮箱 */
    name: {type: String, default: ''},
    /** @type {'xs'|'sm'|'md'|'lg'|'xl'} */
    size: {type: String, default: 'md'},
    /** @type {'circle'|'rounded'} */
    shape: {type: String, default: 'circle'},
    /** @type {'neutral'|'accent'|'success'|'warning'|'danger'|'info'} */
    tone: {type: String, default: 'neutral'},
    /** @type {''|'online'|'busy'|'offline'} */
    status: {type: String, default: ''},
    /** 状态点的可读说明；不给就是纯装饰 */
    statusLabel: {type: String, default: ''},
    /** 旁边已有文字时开启，避免读屏重复 */
    decorative: {type: Boolean, default: false},
    /**
     * 图片先出现再回退会闪一下，给 fallback 一点延迟（毫秒）。
     * 不给 / 给 0 = 立即显示首字母 —— 注意**不能**把 0 透传给 reka：它的
     * `canRender` 初值是 `delayMs === undefined`，而启动定时器的判断是 `if (props.delayMs)`，
     * 所以 `delayMs={0}` 会让 fallback 永远渲染不出来。
     */
    delayMs: {type: Number, default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

/** 邮箱取 @ 前面；拉丁文取前两段首字母；CJK 取前两个字 */
const initials = computed(() => {
    const raw = (props.name || '').trim()
    if (!raw) return ''
    const local = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw
    if (/[぀-ヿ㐀-䶿一-鿿가-힯]/.test(local)) {
        return local.slice(0, 2)
    }
    const parts = local.split(/[\s._\-+]+/).filter(Boolean)
    if (parts.length === 0) return local.slice(0, 2)
    if (parts.length === 1) return parts[0].slice(0, 2)
    return (parts[0][0] ?? '') + (parts[1][0] ?? '')
})

const STATUS_TONE = {
    online: 'bg-success',
    busy: 'bg-warning',
    offline: 'bg-fg-subtle',
}

// 状态点压在头像上，需要一圈与父底同色的描边才看得出边界
const STATUS_SIZE = {
    xs: 'size-1.5 ring-1',
    sm: 'size-2 ring-1',
    md: 'size-2.5 ring-2',
    lg: 'size-3 ring-2',
    xl: 'size-3.5 ring-2',
}
</script>

<template>
  <AvatarRoot :class="cn(avatarVariants({size, shape}), props.class)">
    <AvatarImage
      v-if="src"
      :src="src"
      :alt="decorative ? '' : name"
      :class="cn('size-full object-cover', shape === 'circle' ? 'rounded-full' : 'rounded-md')"
    />
    <AvatarFallback
      :delay-ms="delayMs || undefined"
      :aria-hidden="decorative || undefined"
      :class="avatarFallbackVariants({tone, size, shape})"
    >
      <slot name="fallback">
        <span v-if="initials">{{ initials }}</span>
        <svg v-else class="size-3/5 text-fg-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 13.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.5 20.5a7.5 7.5 0 0 1 15 0"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </slot>
    </AvatarFallback>
    <span
      v-if="status"
      :class="cn(
        'absolute right-0 bottom-0 rounded-full ring-surface',
        STATUS_SIZE[size],
        STATUS_TONE[status],
      )"
      :role="statusLabel ? 'img' : undefined"
      :aria-label="statusLabel || undefined"
      :aria-hidden="statusLabel ? undefined : true"
    />
  </AvatarRoot>
</template>
