<script setup>
/**
 * Kbd — L1 原语（§4.11；快捷键提示见 §6.2 CommandPalette）
 *
 * `keys` 支持 `'Mod+K'` 这种写法：`Mod` 在 macOS 上渲染 ⌘、在其它平台渲染 Ctrl，
 * 这样调用方只写一份，不用到处 `isMac ? ... : ...`。
 * 单个键用 <kbd>，多个键外面套一层 <kbd>，这是 HTML 规范推荐的嵌套用法。
 */
import {computed} from 'vue'
import {cn} from '@/utils/cn.js'

const props = defineProps({
    /** 'Mod+K' / ['Mod','K'] / 'Esc' */
    keys: {type: [String, Array], default: ''},
    /** @type {'sm'|'md'} */
    size: {type: String, default: 'sm'},
    class: {type: [String, Array, Object], default: undefined},
})

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

// 单字符键位统一大写；符号键各平台不同
const SYMBOL = isMac
    ? {mod: '⌘', meta: '⌘', cmd: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧', enter: '↵', esc: 'esc', escape: 'esc', backspace: '⌫', delete: '⌦', tab: '⇥', up: '↑', down: '↓', left: '←', right: '→'}
    : {mod: 'Ctrl', meta: 'Win', cmd: 'Ctrl', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Esc', escape: 'Esc', backspace: 'Backspace', delete: 'Del', tab: 'Tab', up: '↑', down: '↓', left: '←', right: '→'}

const parts = computed(() => {
    const raw = Array.isArray(props.keys) ? props.keys : String(props.keys).split('+')
    return raw
        .map((k) => String(k).trim())
        .filter(Boolean)
        .map((k) => SYMBOL[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k))
})

const KEY_SIZE = {
    sm: 'h-4.5 min-w-4.5 px-1 text-micro',
    md: 'h-5.5 min-w-5.5 px-1.5 text-caption',
}
</script>

<template>
  <kbd :class="cn('inline-flex select-none items-center gap-0.5 align-middle font-sans', props.class)">
    <kbd
      v-for="(part, i) in parts"
      :key="`${part}-${i}`"
      :class="cn(
        'inline-flex items-center justify-center rounded-xs border border-line bg-subtle',
        'text-fg-muted shadow-xs',
        KEY_SIZE[size],
      )"
    >{{ part }}</kbd>
  </kbd>
</template>
