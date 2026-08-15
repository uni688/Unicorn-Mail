<script setup>
/**
 * SidebarItem — 侧栏的一行（§6.2「FolderTree / SidebarItem」）
 *
 * ```
 * h 32px · pl 12 + icon16 + gap8 + label + 右侧计数
 *   default   : fg-muted, 无底
 *   hover     : bg-hover, fg-default
 *   selected  : bg-selected + 左侧 2px 指示条 + fg-default + body-strong
 *   collapsed : 只剩 16px 图标居中，计数降级为右上角圆点，Tooltip 给全名
 * ```
 *
 * 一套模板同时服务两种落点：给了 `to` 就是 `<RouterLink>`（真链接，可中键新标签打开），
 * 没给就是 `<button>` 只 `emit('select')`（侧栏里那些「开个面板」的行）。
 *
 * 选中判定按**路由名**而不是路径比对：`/mail/:folder/:emailId` 这类子路由将来展开时，
 * 打开一封邮件不该让「收件箱」失去选中态。调用方也可以用 `active` 直接接管。
 *
 * 计数（`count`）在 P2 全程为 `null` —— 数据源要等 `GET /email/counts`（§10.5 增量 3）。
 * 组件先把契约与两种形态（数字 / 折叠态圆点）备齐，P3 接上即可，`/_ds` 里有样例。
 * 显示规则照 §5.1：`> 0` 才出数字，`> 999` 记 `999+`，`= 0` 什么都不画。
 */
import {computed} from 'vue'
import {RouterLink, useRoute, useRouter} from 'vue-router'
import {Tooltip} from '@/components/ui'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 路由目标；缺省则渲染 `<button>` @type {string|Object|null} */
    to: {type: [String, Object], default: null},
    label: {type: String, required: true},
    /** 16px 线性图标组件 @type {Object|Function|null} */
    icon: {type: [Object, Function], default: null},
    /** 计数；`null` = 无数据源，不占位 @type {number|null} */
    count: {type: Number, default: null},
    /** 计数的读屏文案（「12 封未读」）；折叠态也用它拼可访问名 */
    countLabel: {type: String, default: ''},
    /** 计数左侧的文字标记（草稿的「本机」） */
    badge: {type: String, default: ''},
    /** 56px 图标态 */
    collapsed: {type: Boolean, default: false},
    /** 覆盖选中判定；缺省按路由名比对 @type {boolean|null} */
    active: {type: Boolean, default: null},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['select'])

const route = useRoute()
const router = useRouter()

const targetName = computed(() => {
    if (!props.to) return null
    try {
        return router.resolve(props.to).name ?? null
    } catch {
        // 路由还没注册（权限未到）时 resolve 会抛，这行本来也不该被渲染出来
        return null
    }
})

const isActive = computed(() => props.active ?? (!!targetName.value && route.name === targetName.value))

/** 折叠态没有可见文字，可访问名只能由 aria-label 提供（图标是 aria-hidden 的） */
const ariaLabel = computed(() => {
    if (!props.collapsed) return undefined
    return props.countLabel ? `${props.label} · ${props.countLabel}` : props.label
})

const showCount = computed(() => typeof props.count === 'number' && props.count > 0)
const countText = computed(() => (props.count > 999 ? '999+' : String(props.count)))

const rowClass = computed(() => cn(
    'relative flex items-center rounded-md text-fg-muted transition-colors',
    'hover:bg-hover hover:text-fg',
    isActive.value ? 'text-body-strong' : 'text-body',
    props.collapsed ? 'size-9 justify-center' : 'h-8 gap-2 pl-3 pr-2',
    isActive.value && 'bg-selected text-fg',
    // 指示条只在展开态画：折叠态整行只有 36px 宽，再插一条竖线会把图标挤离中心
    isActive.value && !props.collapsed && [
        'before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5',
        'before:-translate-y-1/2 before:rounded-full before:bg-sidebar-indicator',
    ],
    props.class,
))
</script>

<template>
  <li>
    <Tooltip :text="label" :disabled="!collapsed" side="right">
      <component
        :is="to ? RouterLink : 'button'"
        v-bind="to ? {to} : {type: 'button'}"
        :class="rowClass"
        :aria-current="isActive ? 'page' : undefined"
        :aria-label="ariaLabel"
        @click="to || emit('select')"
      >
        <component :is="icon" v-if="icon" class="size-4 shrink-0" aria-hidden="true" />

        <template v-if="!collapsed">
          <span class="truncate">{{ label }}</span>
          <span v-if="badge || showCount" class="ml-auto flex shrink-0 items-center gap-1.5">
            <span v-if="badge" class="text-micro text-fg-muted">{{ badge }}</span>
            <span
              v-if="showCount"
              class="tabular-nums text-caption text-fg-muted"
              :aria-label="countLabel || undefined"
            >{{ countText }}</span>
          </span>
        </template>

        <!-- 折叠态：计数降级为右上角圆点，数字本身进 aria-label -->
        <span
          v-else-if="showCount"
          class="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent"
          aria-hidden="true"
        />
      </component>
    </Tooltip>
  </li>
</template>
