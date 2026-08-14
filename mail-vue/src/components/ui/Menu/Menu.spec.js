import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import ContextMenu from '../ContextMenu/ContextMenu.vue'
import DropdownMenu from '../DropdownMenu/DropdownMenu.vue'
import MenuCheckboxItem from './MenuCheckboxItem.vue'
import MenuGroup from './MenuGroup.vue'
import MenuItem from './MenuItem.vue'
import MenuLabel from './MenuLabel.vue'
import MenuRadioGroup from './MenuRadioGroup.vue'
import MenuRadioItem from './MenuRadioItem.vue'
import MenuSeparator from './MenuSeparator.vue'
import MenuSub from './MenuSub.vue'

/**
 * 菜单项词汇表（§6.1）。这一套组件 DropdownMenu 和 ContextMenu 共用：样式只写一遍，
 * 具体用哪家 reka 原语由 Root 通过 `provideMenuFamily` 注入 —— 所以这里统一挂在
 * 一个 `defaultOpen` 的 DropdownMenu 里测，另外单独测一条「同一份 MenuItem 放进
 * ContextMenu 也成立」来守住这层间接。
 *
 * 时序：菜单项的 select 会先 emit、再 `await nextTick()`、然后才关菜单，
 * 比浮层落地多一拍，`settle()` 统一等三拍。
 */

let mounted = []

/** 把一段菜单内容挂进一个已经打开的 DropdownMenu；state 里的键可以在模板里 v-model */
function renderMenu(inner, state = {}) {
    const wrapper = mount({
        components: {
            DropdownMenu, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem,
            MenuGroup, MenuLabel, MenuSeparator, MenuSub,
        },
        data: () => ({picked: [], checked: false, sort: 'date', ...state}),
        template: `
          <DropdownMenu default-open>
            <template #trigger><button type="button">更多操作</button></template>
            ${inner}
          </DropdownMenu>
        `,
    })
    mounted.push(wrapper)
    return wrapper
}

const items = () => [...document.querySelectorAll('[role="menuitem"]')]
const item = (index = 0) => items()[index]
const menus = () => [...document.querySelectorAll('[role="menu"]')]

async function settle() {
    await nextTick()
    await nextTick()
    await nextTick()
}

function click(el) {
    el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
}

/** 卸载必须排在清 body 前面（vitest 的 afterEach 是反序执行的） */
afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

describe('Menu · 家族注入', () => {
    it('脱离 Root 直接用就当场报错，而不是渲染一个没键盘行为的假菜单', () => {
        expect(() => mount(MenuItem)).toThrow(/<MenuItem> 必须放在 <DropdownMenu> 或 <ContextMenu> 里/)
    })

    it('同一份 MenuItem 放进 ContextMenu 一样成立 —— 样式只写一遍', async () => {
        const wrapper = mount({
            components: {ContextMenu, MenuItem},
            template: `
              <ContextMenu>
                <template #trigger><div>邮件行</div></template>
                <MenuItem>标为已读</MenuItem>
              </ContextMenu>
            `,
        })
        mounted.push(wrapper)
        wrapper.get('div').element.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: 10, clientY: 10,
        }))
        await settle()
        expect(item().textContent).toContain('标为已读')
        expect([...item().classList]).toContain('data-highlighted:bg-hover')
    })
})

describe('Menu · MenuItem', () => {
    it('是 role=menuitem，用 data-highlighted 而不是 :hover 上高亮', async () => {
        renderMenu('<MenuItem>归档</MenuItem>')
        await settle()
        const classes = [...item().classList]
        expect(item().getAttribute('role')).toBe('menuitem')
        expect(classes).toContain('data-highlighted:bg-hover')
        expect(classes).toContain('text-body')
        expect(classes).toContain('rounded-sm')
    })

    it('focus 就高亮 —— 键盘移动和指针移动共用同一套视觉', async () => {
        renderMenu('<MenuItem>归档</MenuItem>')
        await settle()
        expect(item().hasAttribute('data-highlighted')).toBe(false)
        item().dispatchEvent(new FocusEvent('focus'))
        await settle()
        expect(item().hasAttribute('data-highlighted')).toBe(true)
    })

    it('tone=danger 走危险色，高亮底也换成 danger-subtle', async () => {
        renderMenu('<MenuItem tone="danger">删除</MenuItem>')
        await settle()
        const classes = [...item().classList]
        expect(classes).toContain('text-danger-fg')
        expect(classes).toContain('data-highlighted:bg-danger-subtle')
    })

    it('inset 留出左侧槽位，跟同组的勾选项对齐', async () => {
        renderMenu('<MenuItem inset>移动到…</MenuItem>')
        await settle()
        expect([...item().classList]).toContain('pl-7')
    })

    it('shortcut 只是右侧提示，不参与按键绑定', async () => {
        renderMenu('<MenuItem shortcut="⌘⏎">发送</MenuItem>')
        await settle()
        const hint = item().querySelector('span')
        expect(hint.textContent).toBe('⌘⏎')
        expect([...hint.classList]).toEqual(expect.arrayContaining(['ml-auto', 'text-caption', 'text-fg-muted']))
    })

    it('disabled 同时给 aria 和 data，视觉走 data-disabled', async () => {
        renderMenu('<MenuItem disabled>撤回</MenuItem>')
        await settle()
        expect(item().getAttribute('aria-disabled')).toBe('true')
        expect(item().getAttribute('data-disabled')).toBe('')
        expect([...item().classList]).toContain('data-disabled:text-fg-disabled')
    })

    it('点击派 select 并把菜单收起', async () => {
        const wrapper = renderMenu('<MenuItem @select="picked.push(\'archive\')">归档</MenuItem>')
        await settle()
        click(item())
        await settle()
        expect(wrapper.vm.picked).toEqual(['archive'])
        expect(menus()).toHaveLength(0)
    })

    it('在 select 里 preventDefault 就留住菜单 —— 连续操作用得上', async () => {
        const wrapper = renderMenu('<MenuItem @select="(e) => { picked.push(\'keep\'); e.preventDefault() }">归档</MenuItem>')
        await settle()
        click(item())
        await settle()
        expect(wrapper.vm.picked).toEqual(['keep'])
        expect(menus()).toHaveLength(1)
    })

    it('disabled 的项点不动', async () => {
        const wrapper = renderMenu('<MenuItem disabled @select="picked.push(\'x\')">撤回</MenuItem>')
        await settle()
        click(item())
        await settle()
        expect(wrapper.vm.picked).toEqual([])
        expect(menus()).toHaveLength(1)
    })
})

describe('Menu · MenuCheckboxItem', () => {
    const checkbox = () => document.querySelector('[role="menuitemcheckbox"]')

    it('是 role=menuitemcheckbox，未勾选时 aria-checked=false 且不画勾', async () => {
        renderMenu('<MenuCheckboxItem>只看未读</MenuCheckboxItem>')
        await settle()
        expect(checkbox().getAttribute('aria-checked')).toBe('false')
        expect(checkbox().getAttribute('data-state')).toBe('unchecked')
        expect(checkbox().querySelector('svg')).toBeNull()
    })

    it('勾选框槽位一直占位，勾上/取消时文字不左右跳', async () => {
        renderMenu('<MenuCheckboxItem>只看未读</MenuCheckboxItem>')
        await settle()
        const slot = checkbox().querySelector('span')
        expect([...slot.classList]).toEqual(expect.arrayContaining(['flex', 'size-4', 'shrink-0']))
    })

    it('勾上才画勾，且是强调色', async () => {
        renderMenu('<MenuCheckboxItem :model-value="true">只看未读</MenuCheckboxItem>')
        await settle()
        expect(checkbox().getAttribute('aria-checked')).toBe('true')
        expect(checkbox().getAttribute('data-state')).toBe('checked')
        expect(checkbox().querySelector('svg').getAttribute('class')).toContain('text-accent')
    })

    it("'indeterminate' 念成 mixed —— 部分选中不能报成没选", async () => {
        renderMenu('<MenuCheckboxItem model-value="indeterminate">只看未读</MenuCheckboxItem>')
        await settle()
        expect(checkbox().getAttribute('aria-checked')).toBe('mixed')
        expect(checkbox().getAttribute('data-state')).toBe('indeterminate')
    })

    it('点击回写 v-model', async () => {
        const wrapper = renderMenu('<MenuCheckboxItem v-model="checked">只看未读</MenuCheckboxItem>')
        await settle()
        click(checkbox())
        await settle()
        expect(wrapper.vm.checked).toBe(true)
    })
})

describe('Menu · MenuRadioGroup', () => {
    const radios = () => [...document.querySelectorAll('[role="menuitemradio"]')]

    it('选中项 aria-checked=true，其余 false', async () => {
        renderMenu(`
          <MenuRadioGroup v-model="sort">
            <MenuRadioItem value="date">按日期</MenuRadioItem>
            <MenuRadioItem value="sender">按发件人</MenuRadioItem>
          </MenuRadioGroup>
        `)
        await settle()
        expect(radios().map((el) => el.getAttribute('aria-checked'))).toEqual(['true', 'false'])
        expect(radios()[0].getAttribute('data-state')).toBe('checked')
    })

    it('指示器是实心圆点，跟多选的勾区分开', async () => {
        renderMenu(`
          <MenuRadioGroup v-model="sort">
            <MenuRadioItem value="date">按日期</MenuRadioItem>
          </MenuRadioGroup>
        `)
        await settle()
        const dot = radios()[0].querySelector('.rounded-full')
        expect(dot).not.toBeNull()
        expect([...dot.classList]).toEqual(expect.arrayContaining(['size-2', 'rounded-full', 'bg-accent']))
        expect(radios()[0].querySelector('svg')).toBeNull()
    })

    it('未选中的项不画圆点', async () => {
        renderMenu(`
          <MenuRadioGroup v-model="sort">
            <MenuRadioItem value="date">按日期</MenuRadioItem>
            <MenuRadioItem value="sender">按发件人</MenuRadioItem>
          </MenuRadioGroup>
        `)
        await settle()
        expect(radios()[1].querySelector('.rounded-full')).toBeNull()
    })

    it('点另一项就换值', async () => {
        const wrapper = renderMenu(`
          <MenuRadioGroup v-model="sort">
            <MenuRadioItem value="date">按日期</MenuRadioItem>
            <MenuRadioItem value="sender">按发件人</MenuRadioItem>
          </MenuRadioGroup>
        `)
        await settle()
        click(radios()[1])
        await settle()
        expect(wrapper.vm.sort).toBe('sender')
    })
})

describe('Menu · 分组与分隔', () => {
    it('MenuLabel 只是视觉标题，不可聚焦也不是 menuitem', async () => {
        renderMenu('<MenuLabel>批量操作</MenuLabel><MenuItem>归档</MenuItem>')
        await settle()
        const label = [...menus()[0].children].find((el) => el.textContent.includes('批量操作'))
        expect(label.getAttribute('role')).toBeNull()
        expect(label.getAttribute('tabindex')).toBeNull()
        expect([...label.classList]).toEqual(expect.arrayContaining(['px-2', 'py-1.5', 'text-caption', 'text-fg-muted']))
    })

    it('MenuSeparator 是 role=separator，负边距顶满面板两侧', async () => {
        renderMenu('<MenuItem>归档</MenuItem><MenuSeparator /><MenuItem>删除</MenuItem>')
        await settle()
        const sep = document.querySelector('[role="separator"]')
        expect(sep).not.toBeNull()
        expect([...sep.classList]).toEqual(expect.arrayContaining(['-mx-1', 'my-1', 'h-px', 'bg-line']))
    })

    it('MenuGroup 带 label 时把标题接到 aria-labelledby 上', async () => {
        renderMenu('<MenuGroup label="标记为"><MenuItem>已读</MenuItem></MenuGroup>')
        await settle()
        const group = document.querySelector('[role="group"]')
        const labelledby = group.getAttribute('aria-labelledby')
        expect(labelledby).toBeTruthy()
        expect(document.getElementById(labelledby).textContent).toContain('标记为')
    })

    it('没 label 就不留悬空的 aria-labelledby —— 指向不存在的 id 是 axe 的 serious', async () => {
        renderMenu('<MenuGroup><MenuItem>已读</MenuItem></MenuGroup>')
        await settle()
        const group = document.querySelector('[role="group"]')
        expect(group.getAttribute('role')).toBe('group')
        expect(group.getAttribute('aria-labelledby')).toBeNull()
    })
})

describe('Menu · MenuSub', () => {
    const subTrigger = () => item(0)

    it('触发项永远有 chevron —— 那是「还有下一层」的唯一线索', async () => {
        renderMenu('<MenuSub label="移动到…"><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        expect(subTrigger().textContent).toContain('移动到…')
        expect(subTrigger().querySelector('svg')).not.toBeNull()
        expect(subTrigger().getAttribute('aria-haspopup')).toBe('menu')
        expect(subTrigger().getAttribute('aria-expanded')).toBe('false')
    })

    it('闭合时二级面板不在 DOM 里', async () => {
        renderMenu('<MenuSub label="移动到…"><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        expect(menus()).toHaveLength(1)
    })

    it('点触发项展开二级菜单，二级面板复用一级外观', async () => {
        renderMenu('<MenuSub label="移动到…"><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        click(subTrigger())
        await settle()
        expect(menus()).toHaveLength(2)
        expect(subTrigger().getAttribute('aria-expanded')).toBe('true')
        expect(subTrigger().getAttribute('data-state')).toBe('open')

        const classes = [...menus()[1].classList]
        expect(classes).toContain('bg-raised')
        expect(classes).toContain('rounded-lg')
        expect(classes).toContain('shadow-lg')
        expect(classes).toContain('p-1')
        expect(classes).toContain('min-w-40')
    })

    it('ArrowRight 也能展开 —— 键盘不用先点', async () => {
        renderMenu('<MenuSub label="移动到…"><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        subTrigger().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
        await settle()
        expect(menus()).toHaveLength(2)
    })

    it('width / contentClass 落到二级面板上', async () => {
        renderMenu('<MenuSub label="移动到…" width="w-48" content-class="p-0"><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        click(subTrigger())
        await settle()
        const classes = [...menus()[1].classList]
        expect(classes).toContain('w-48')
        expect(classes).toContain('p-0')
    })

    it('disabled 的触发项展不开', async () => {
        renderMenu('<MenuSub label="移动到…" disabled><MenuItem>收件箱</MenuItem></MenuSub>')
        await settle()
        expect(subTrigger().getAttribute('data-disabled')).toBe('')
        click(subTrigger())
        await settle()
        expect(menus()).toHaveLength(1)
    })
})
