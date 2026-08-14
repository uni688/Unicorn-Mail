<script setup>
/**
 * MenuRadioGroup — 单选组（排序方式、显示密度这类互斥选项）
 *
 * 只管值，外观全在 `MenuRadioItem`。要组标题时外面再套一层 `MenuGroup label="…"`
 * —— reka 的 RadioGroup 自己是 role="group"，再嵌一层不会破坏语义。
 */
import {useMenuFamily} from '../_shared/menu.family.js'

const props = defineProps({
    modelValue: {type: String, default: undefined},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['update:modelValue'])
const family = useMenuFamily('MenuRadioGroup')
</script>

<template>
  <component
    :is="family.RadioGroup"
    :model-value="modelValue"
    :class="props.class"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </component>
</template>
