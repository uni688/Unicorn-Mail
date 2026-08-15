/**
 * useShortcutsDialog — `?` 快捷键面板的开关（§7.1 末句）
 *
 * 单独一个模块只为切断循环引用：命令面板里有一条「快捷键」动作，而快捷键面板里
 * 也要显示「命令面板 ⌘K」。两边都只依赖这里的两个 ref，就不会互相 import。
 */
import {ref} from 'vue'

const shortcutsOpen = ref(false)

export function openShortcuts() {
    shortcutsOpen.value = true
}

export function closeShortcuts() {
    shortcutsOpen.value = false
}

export function useShortcutsDialog() {
    return {open: shortcutsOpen, openShortcuts, closeShortcuts}
}
