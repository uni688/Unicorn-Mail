<script setup>
/**
 * Collapsible — L1 原语（Reka `Collapsible`，§6.1）
 *
 * 主要客户是侧栏的「收藏夹 / 当前邮箱」两个分组（§5.1），其次是设置页的高级选项。
 *
 * 两点值得写下来：
 * 1. `unmountOnHide` 默认给 `false`（与 reka 的默认相反）。§5.1 已经点明「折叠不省渲染」，
 *    但对侧栏这种**几十行、状态要留住**的分组，卸载会让展开时重新拉计数、丢滚动位置。
 *    真正需要省渲染时显式传 `unmount`，此时进出场动画自然也就没有了（高度动画需要
 *    元素先在 DOM 里被量一次）。
 * 2. 高度动画走 tokens.css 的 `--animate-collapsible-down/up`（180ms，§8.3 允许 height
 *    作为折叠场景的例外）。它依赖 reka 注入的 `--reka-collapsible-content-height`，
 *    所以动画必须挂在 `CollapsibleContent` 自己身上，不能挂在内层 div 上。
 *    内容必须再包一层：动画期间外层是 `overflow-hidden` 且高度在变，
 *    padding 若写在同一元素上会被裁切成跳变。
 * 3. `aria-controls` 自己给。reka 把 `contentId` 存成 rootContext 上的普通字符串
 *    （非 ref），由 `CollapsibleContent` 在 setup 里 `||=` 补上；而 Trigger 先渲染，
 *    于是首帧拿到的是空串——`aria-controls=""` 是无效 IDREF，axe 的
 *    aria-valid-attr-value 会报，而且要等第一次点击触发重渲染才自愈。
 *    reka 那个 id 又盖不掉（它是 `mergeProps($attrs, {id})`，自己的值在后），
 *    所以这里用 useId() 生成一个，同时喂给 Trigger 的 aria-controls 和内层容器。
 */
import {useId} from 'vue'
import {CollapsibleContent, CollapsibleRoot, CollapsibleTrigger} from 'reka-ui'
import IconChevronRight from '~icons/lucide/chevron-right'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 受控开关，可 v-model:open */
    open: {type: Boolean, default: undefined},
    defaultOpen: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    /** 触发行的文案；需要更复杂的头部时用 `#trigger` 插槽 */
    title: {type: String, default: ''},
    /** 折叠时把内容从 DOM 卸载（省渲染，代价是没有高度动画与状态保留） */
    unmount: {type: Boolean, default: false},
    /** 隐藏默认的箭头（自己在 `#trigger` 里画指示器时用） */
    hideIndicator: {type: Boolean, default: false},
    triggerClass: {type: [String, Array, Object], default: undefined},
    contentClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:open'])

const contentId = useId()
</script>

<template>
  <CollapsibleRoot
    :open="open"
    :default-open="defaultOpen"
    :disabled="disabled"
    :unmount-on-hide="unmount"
    :class="props.class"
    @update:open="emit('update:open', $event)"
  >
    <template #default="{open: isOpen}">
      <CollapsibleTrigger
        :aria-controls="unmount && !isOpen ? undefined : contentId"
        :class="cn(
          'group flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left',
          'text-caption text-fg-muted transition-colors',
          'hover:bg-hover hover:text-fg',
          'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent',
          props.triggerClass,
        )"
      >
        <!-- 箭头旋转是 transform，§8.3 允许；90deg 对应「收起 → 展开」 -->
        <IconChevronRight
          v-if="!hideIndicator"
          class="size-3.5 shrink-0 text-fg-subtle transition-transform duration-150 group-data-[state=open]:rotate-90"
          aria-hidden="true"
        />
        <slot name="trigger">
          <span class="truncate">{{ title }}</span>
        </slot>
      </CollapsibleTrigger>

      <CollapsibleContent
        class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
      >
        <div :id="contentId" :class="cn('pt-1', props.contentClass)">
          <slot />
        </div>
      </CollapsibleContent>
    </template>
  </CollapsibleRoot>
</template>
