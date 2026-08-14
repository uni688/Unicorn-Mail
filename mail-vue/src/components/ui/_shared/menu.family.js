import {inject, provide} from 'vue'

/**
 * 菜单家族注入（DropdownMenu / ContextMenu 共用一套菜单项，§6.1）
 *
 * reka 把菜单拆成了两套同构原语：`DropdownMenuItem` 和 `ContextMenuItem` 是两个
 * 不同的组件对象（各自转发到内部的 Menu 实现）。直接写两份带样式的菜单项，
 * 「下拉里的删除项是红的、右键菜单里忘了改」这种漂移就是时间问题。
 *
 * 所以：两个 Root 各自 provide 自己家族的原语，`Menu*` 那组组件只写一遍样式，
 * 渲染时用 `<component :is>` 挑出对应家族的实现。不用 `import * as reka` 是为了
 * 保住 tree-shaking —— 只有真正被 provide 的那几个原语会进包。
 */
const MENU_FAMILY_KEY = Symbol('um-menu-family')

/**
 * @param {Record<string, unknown>} parts 本家族的原语，键名固定：
 *   Item / Label / Separator / Group / CheckboxItem / RadioGroup / RadioItem /
 *   ItemIndicator / Sub / SubTrigger / SubContent
 */
export function provideMenuFamily(parts) {
    provide(MENU_FAMILY_KEY, parts)
}

/**
 * @param {string} name 调用方组件名，只用于报错信息
 * @returns {Record<string, any>}
 */
export function useMenuFamily(name) {
    const parts = inject(MENU_FAMILY_KEY, null)
    if (!parts) {
        // 这是开发期错误：菜单项脱离了 Root，reka 的 context 也一样拿不到，
        // 与其渲染出一个无键盘行为的假菜单，不如当场说清楚
        throw new Error(`[ui] <${name}> 必须放在 <DropdownMenu> 或 <ContextMenu> 里`)
    }
    return parts
}
