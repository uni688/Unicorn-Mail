<script setup>
/**
 * EmptyState — 空状态（§7.8 状态矩阵里的「空」一档）
 *
 * 三种空是不一样的，所以文案由调用方给，这里只固定版式：
 *   - 收件箱真的没有邮件 → 说明「新邮件会自动出现」
 *   - 搜索没有命中        → 给「清空筛选」这个出口
 *   - 回收站空的          → 什么都不用做
 *
 * 版式（§7.8）：图标 40 → 标题 body-strong → 说明 caption → 可选动作。整块垂直居中，
 * 不占满高度时也不上下乱跳（`min-h-48` + `place-content-center`）。
 * 不用 `role="status"`：空状态是页面内容而不是通知，读屏会顺着读到；
 * 播报「加载完成但是空的」由列表容器的 `aria-busy` 负责。
 */
import {Button} from '@/components/ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 40px 线性图标组件 @type {Object|Function|null} */
    icon: {type: [Object, Function], default: null},
    title: {type: String, required: true},
    description: {type: String, default: ''},
    /** 给了才画按钮 */
    actionLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['action'])
</script>

<template>
  <div :class="cn('grid min-h-48 place-content-center justify-items-center gap-2 px-6 py-10 text-center', props.class)">
    <component :is="icon" v-if="icon" class="size-10 text-fg-subtle" aria-hidden="true" />
    <p class="text-body-strong text-fg">{{ title }}</p>
    <p v-if="description" class="max-w-80 text-caption text-fg-muted">{{ description }}</p>
    <Button v-if="actionLabel" variant="secondary" size="sm" class="mt-1" @click="emit('action')">
      {{ actionLabel }}
    </Button>
    <slot />
  </div>
</template>
