<script setup>
/**
 * TabPanel — `Tabs` 的面板（Reka `TabsContent`）
 *
 * 单独包一层只做两件事：给一个统一的 class 钩子，以及把 `min-w-0` 兜住 ——
 * 面板常放在 flex 容器里，里面又常有 `truncate` 的长邮件标题，缺 `min-w-0`
 * 会把整条列宽顶开。
 *
 * 面板自身不加 padding：Tabs 会出现在卡片里、抽屉里、页面主体里，间距归调用方。
 * 焦点环也不动：reka 给激活面板挂 `tabindex="0"`，键盘从标签条 Tab 进来时
 * base.css 的 `:focus-visible` 会给环，这是对的（读屏用户需要知道自己进了面板）。
 */
import {TabsContent} from 'reka-ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 与对应 TabsTrigger 的 value 一致 */
    value: {type: [String, Number], required: true},
    /** 强制挂载（外部动画库接管进出场时用） */
    forceMount: {type: Boolean, default: false},
    class: {type: [String, Array, Object], default: undefined},
})
</script>

<template>
  <TabsContent
    :value="value"
    :force-mount="forceMount || undefined"
    :class="cn('min-w-0', props.class)"
  >
    <slot />
  </TabsContent>
</template>
