<script setup>
/**
 * 调试台的响应树（§4.3「响应 JSON 树」）。
 *
 * 只在开发者中心用，所以放在页面旁边而不是 `components/ui` —— 它认识的是「JSON」
 * 这一种数据，不是通用原语，进 L1 桶只会让那层的 API 面变大。
 *
 * 为什么不直接 `JSON.stringify(data, null, 2)` 塞进 `<Code>`：邮件列表的响应里
 * 每封信都带 `content`（整段 HTML），一条就能刷掉两屏，展开/收起是必需的。
 * 折叠自己实现而不是用 `<details>`：需要在同一行里既显示键名又显示「N 项」摘要，
 * 且默认展开前两层，`<details open>` 的层级控制得靠 JS 反过来算。
 */
import {computed, ref} from 'vue'
import IconChevronRight from '~icons/lucide/chevron-right'

const props = defineProps({
    value: {type: null, default: undefined},
    /** 父级键名；根节点不传 */
    label: {type: String, default: ''},
    depth: {type: Number, default: 0},
    /** 深到这一层默认收起。两层足够看清 `{code, message, data}` 的外壳 */
    defaultOpenDepth: {type: Number, default: 2},
})

defineOptions({name: 'JsonTree'})

const kind = computed(() => {
    if (props.value === null) return 'null'
    if (Array.isArray(props.value)) return 'array'
    return typeof props.value
})

const isBranch = computed(() => kind.value === 'array' || kind.value === 'object')

const entries = computed(() => {
    if (!isBranch.value) return []
    return kind.value === 'array'
        ? props.value.map((item, index) => [String(index), item])
        : Object.entries(props.value)
})

const open = ref(props.depth < props.defaultOpenDepth)

/** 收起时的摘要：`[12]` / `{4}`，比只留一个 `…` 有信息量 */
const summary = computed(() => (kind.value === 'array'
    ? `[${entries.value.length}]`
    : `{${entries.value.length}}`))

/** 叶子的显示值。字符串带引号，长字符串截断（响应里的 HTML 正文动辄几万字符） */
const leafText = computed(() => {
    if (kind.value === 'string') {
        const raw = props.value
        return raw.length > 200 ? `"${raw.slice(0, 200)}…"` : `"${raw}"`
    }
    return String(props.value)
})

const LEAF_TONE = {
    string: 'text-success',
    number: 'text-info',
    boolean: 'text-accent',
    null: 'text-fg-subtle',
    undefined: 'text-fg-subtle',
}
</script>

<template>
  <div class="font-mono text-mono">
    <!-- 分支：一行「箭头 + 键名 + 摘要」，展开后缩进渲染子节点 -->
    <template v-if="isBranch">
      <button
        type="button"
        class="flex w-full items-center gap-1 rounded-xs px-0.5 text-left hover:bg-hover"
        :aria-expanded="open"
        @click="open = !open"
      >
        <IconChevronRight
          class="size-3 shrink-0 text-fg-subtle transition-transform"
          :class="open && 'rotate-90'"
          aria-hidden="true"
        />
        <span v-if="label" class="text-accent">{{ label }}</span>
        <span v-if="label" class="text-fg-subtle">:</span>
        <span class="text-fg-muted">{{ summary }}</span>
      </button>

      <div v-if="open" class="ml-3 border-l border-line pl-2">
        <JsonTree
          v-for="[key, item] in entries"
          :key="key"
          :value="item"
          :label="key"
          :depth="depth + 1"
          :default-open-depth="defaultOpenDepth"
        />
      </div>
    </template>

    <!-- 叶子：键名 + 值，值按类型着色（颜色只是冗余提示，文本本身已经带引号/大小写） -->
    <div v-else class="flex items-start gap-1 px-0.5 pl-4">
      <span v-if="label" class="shrink-0 text-accent">{{ label }}</span>
      <span v-if="label" class="shrink-0 text-fg-subtle">:</span>
      <span class="min-w-0 break-all" :class="LEAF_TONE[kind] ?? 'text-fg'">{{ leafText }}</span>
    </div>
  </div>
</template>
