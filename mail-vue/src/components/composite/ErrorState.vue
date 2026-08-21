<script setup>
/**
 * ErrorState — 错误状态（§7.8 状态矩阵里的「错」一档）
 *
 * 和 [[EmptyState]] 同一个版式，区别只有三处，而这三处都不是装饰：
 *   1. 图标与标题用 danger 前景色 —— 空和错必须一眼分得开；
 *   2. 默认带「重试」按钮 —— 错误状态没有出口就是死路；
 *   3. `role="alert"` —— 请求失败是需要立刻播报的变化，空列表不是。
 *
 * 详细报错（`detail`）默认折起：给愿意看的人看，不用技术细节吓其他人。
 */
import IconAlert from '~icons/lucide/circle-alert'
import {Button} from '@/components/ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    title: {type: String, required: true},
    description: {type: String, default: ''},
    /** 折叠起来的原始错误信息 */
    detail: {type: String, default: ''},
    /** 传空串可以去掉重试按钮（比如权限不足这类重试也没用的错） */
    retryLabel: {type: String, default: ''},
    detailLabel: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['retry'])
</script>

<template>
  <div
    role="alert"
    :class="cn('grid min-h-48 place-content-center justify-items-center gap-2 px-6 py-10 text-center', props.class)"
  >
    <IconAlert class="size-10 text-danger-fg" aria-hidden="true" />
    <p class="text-body-strong text-danger-fg">{{ title }}</p>
    <p v-if="description" class="max-w-80 text-caption text-fg-muted">{{ description }}</p>

    <Button v-if="retryLabel" variant="secondary" size="sm" class="mt-1" @click="emit('retry')">
      {{ retryLabel }}
    </Button>

    <details v-if="detail" class="mt-1 max-w-80 text-left">
      <summary class="cursor-pointer text-caption text-fg-muted">{{ detailLabel || detail }}</summary>
      <p class="mt-1 break-words text-micro text-fg-muted">{{ detail }}</p>
    </details>
  </div>
</template>
