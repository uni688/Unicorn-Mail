<script setup>
/**
 * Tabs — L1 原语（Reka `Tabs`，§4.11 的 `line` / `segmented`）
 *
 * 两种用法，都保留：
 * 1. 传 `items`（`{value, label, disabled?, count?}[]`）自动渲染标签条 —— 覆盖 95% 的场景；
 * 2. 用 `#list` 插槽自己排 `<TabsTrigger>` —— 需要在标签里塞头像、状态点时用。
 * 面板一律由 `<TabPanel value="…">` 提供，放在默认插槽里。
 *
 * `activationMode`：默认 `automatic`（方向键移动即切换）。面板内容需要请求数据时
 * 传 `manual`，否则用键盘扫一遍标签条会连打 N 个请求。
 *
 * 计数徽标用 `<span>` 而不是 `Badge`：标签条里的计数是次要信息，Badge 的实底会
 * 抢走选中态的注意力；同时避免 L1 之间互相依赖。
 */
import {TabsList, TabsRoot, TabsTrigger} from 'reka-ui'
import {cn} from '@/utils/cn.js'
import {tabsListVariants, tabsTriggerVariants} from './tabs.variants.js'

const props = defineProps({
    /** 当前选中项，可 v-model */
    modelValue: {type: [String, Number], default: undefined},
    defaultValue: {type: [String, Number], default: undefined},
    /** `{value, label, disabled?, count?}[]`；给了就自动渲染标签条 */
    items: {type: Array, default: () => []},
    /** @type {'line'|'segmented'} */
    variant: {type: String, default: 'line'},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'md'},
    /** @type {'horizontal'|'vertical'} */
    orientation: {type: String, default: 'horizontal'},
    /** @type {'automatic'|'manual'} 面板要拉数据时用 manual */
    activationMode: {type: String, default: 'automatic'},
    /** 方向键在首尾之间循环 */
    loop: {type: Boolean, default: true},
    /** 标签条的无障碍名称（同页多组 Tabs 时必须给） */
    ariaLabel: {type: String, default: ''},
    /** 切走的面板保留在 DOM 里（表单填了一半、iframe 不想重载时用） */
    keepMounted: {type: Boolean, default: false},
    listClass: {type: [String, Array, Object], default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    :default-value="defaultValue"
    :orientation="orientation"
    :activation-mode="activationMode"
    :unmount-on-hide="!keepMounted"
    :class="cn('flex', orientation === 'vertical' ? 'gap-4' : 'flex-col gap-3', props.class)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <TabsList
      :loop="loop"
      :aria-label="ariaLabel || undefined"
      :class="cn(tabsListVariants({variant, orientation}), props.listClass)"
    >
      <slot name="list">
        <TabsTrigger
          v-for="item in items"
          :key="String(item.value)"
          :value="item.value"
          :disabled="item.disabled === true"
          :class="tabsTriggerVariants({variant, size, orientation})"
        >
          <slot name="item" v-bind="item">
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="item.count !== undefined && item.count !== null"
              class="text-caption text-fg-muted tabular-nums"
            >{{ item.count }}</span>
          </slot>
        </TabsTrigger>
      </slot>
    </TabsList>

    <slot />
  </TabsRoot>
</template>
