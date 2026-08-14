import {describe, expect, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import Input from './Input.vue'

/**
 * Input 的重点是 `inheritAttrs: false` 那套转发：id / aria-describedby / autocomplete
 * 必须落在真正的 <input> 上，落到外层 div 的话 Field 串起来的 id 关系会整条断掉。
 */

const render = (props = {}, options = {}) => mount(Input, {props, ...options})
const field = (wrapper) => wrapper.get('input')

describe('Input · 值与事件', () => {
    it('modelValue 渲染进去，输入抛出新值', async () => {
        const wrapper = render({modelValue: 'ada'})
        expect(field(wrapper).element.value).toBe('ada')

        await field(wrapper).setValue('ada@unicorn.mail')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['ada@unicorn.mail'])
    })

    it('完全受控：自己不改 modelValue，只等宿主回写', async () => {
        const wrapper = render({modelValue: 'ada'})
        await field(wrapper).setValue('x')
        expect(wrapper.props('modelValue')).toBe('ada')

        await wrapper.setProps({modelValue: 'ada@unicorn.mail'})
        expect(field(wrapper).element.value).toBe('ada@unicorn.mail')
    })

    it('回车单独抛 enter，带上原生事件', async () => {
        const wrapper = render({modelValue: 'q'})
        await field(wrapper).trigger('keydown', {key: 'Enter'})
        expect(wrapper.emitted('enter')).toHaveLength(1)
        expect(wrapper.emitted('enter')[0][0]).toBeInstanceOf(Event)
    })

    it('其他按键不触发 enter', async () => {
        const wrapper = render()
        await field(wrapper).trigger('keydown', {key: 'a'})
        expect(wrapper.emitted('enter')).toBeUndefined()
    })

    it('数字 modelValue 也能正常渲染', () => {
        expect(field(render({modelValue: 42})).element.value).toBe('42')
    })
})

describe('Input · clearable', () => {
    it('有值才出清除按钮', () => {
        expect(render({clearable: true}).find('button').exists()).toBe(false)
        expect(render({clearable: true, modelValue: 'x'}).find('button').exists()).toBe(true)
    })

    it('清除按钮抛空串 + clear 事件，并把焦点还给输入框', async () => {
        const wrapper = render({clearable: true, modelValue: 'x'}, {attachTo: document.body})
        await wrapper.get('button').trigger('click')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
        expect(wrapper.emitted('clear')).toHaveLength(1)
        expect(document.activeElement).toBe(field(wrapper).element)
        wrapper.unmount()
    })

    it('disabled / readonly 时不给清除按钮', () => {
        expect(render({clearable: true, modelValue: 'x', disabled: true}).find('button').exists()).toBe(false)
        expect(render({clearable: true, modelValue: 'x', readonly: true}).find('button').exists()).toBe(false)
    })

    it('清除按钮是 type=button 且有无障碍名称', () => {
        const btn = render({clearable: true, modelValue: 'x'}).get('button')
        expect(btn.attributes('type')).toBe('button')
        expect(btn.attributes('aria-label')).toBe('清除')
    })

    it('i18n 注册后清除按钮跟着走翻译', () => {
        // useUiText 读的是 globalProperties.$t，VTU 的 `mocks` 走的是别的通道，注不进去
        const wrapper = render(
            {clearable: true, modelValue: 'x'},
            {global: {config: {globalProperties: {$t: (key) => (key === 'ui.clear' ? 'Clear' : key)}}}},
        )
        expect(wrapper.get('button').attributes('aria-label')).toBe('Clear')
    })
})

describe('Input · 属性转发', () => {
    it('id / aria-describedby / autocomplete 落在 input 上，不在包装 div 上', () => {
        const wrapper = render({}, {
            attrs: {id: 'email', 'aria-describedby': 'email-hint', autocomplete: 'email'},
        })
        const el = field(wrapper)
        expect(el.attributes('id')).toBe('email')
        expect(el.attributes('aria-describedby')).toBe('email-hint')
        expect(el.attributes('autocomplete')).toBe('email')
        expect(wrapper.attributes('id')).toBeUndefined()
    })

    it('type 直接透到原生 input', () => {
        expect(field(render({type: 'password'})).attributes('type')).toBe('password')
    })

    it('invalid 报 aria-invalid + 危险色描边', () => {
        const el = field(render({invalid: true}))
        expect(el.attributes('aria-invalid')).toBe('true')
        expect(el.classes()).toContain('border-danger')
    })

    it('正常态不留空的 aria-invalid', () => {
        expect(field(render()).attributes('aria-invalid')).toBeUndefined()
    })

    it('ariaLabel 只在需要时出现', () => {
        expect(field(render({ariaLabel: '搜索邮件'})).attributes('aria-label')).toBe('搜索邮件')
        expect(field(render()).attributes('aria-label')).toBeUndefined()
    })

    it('空 placeholder 不渲染成空属性', () => {
        expect(field(render()).attributes('placeholder')).toBeUndefined()
        expect(field(render({placeholder: '搜索'})).attributes('placeholder')).toBe('搜索')
    })

    it('disabled / readonly 透到原生属性', () => {
        expect(field(render({disabled: true})).attributes('disabled')).toBeDefined()
        expect(field(render({readonly: true})).attributes('readonly')).toBeDefined()
    })
})

describe('Input · 插槽与外观', () => {
    it('前缀图标对读屏隐身，并给输入框让出左内边距', () => {
        const wrapper = render({}, {slots: {prefix: '<i class="ico"/>'}})
        expect(wrapper.get('.ico').element.parentElement.getAttribute('aria-hidden')).toBe('true')
        expect(field(wrapper).classes()).toContain('pl-8')
    })

    it('后缀插槽同样隐身并让出右内边距', () => {
        const wrapper = render({}, {slots: {suffix: '<i class="ico"/>'}})
        expect(wrapper.get('.ico').element.parentElement.getAttribute('aria-hidden')).toBe('true')
        expect(field(wrapper).classes()).toContain('pr-8')
    })

    it('只有 clearable 冒出来时也算后缀，一样让出内边距', () => {
        expect(field(render({clearable: true, modelValue: 'x'})).classes()).toContain('pr-8')
        expect(field(render({clearable: true})).classes()).not.toContain('pr-8')
    })

    it('三档尺寸走 controlVariants 的高度', () => {
        expect(field(render({size: 'sm'})).classes()).toContain('h-7')
        expect(field(render()).classes()).toContain('h-8')
        expect(field(render({size: 'lg'})).classes()).toContain('h-[38px]')
    })

    it('尺寸变了内边距槽位跟着变', () => {
        const sm = render({size: 'sm'}, {slots: {prefix: '<i/>'}})
        expect(field(sm).classes()).toContain('pl-7')
        const lg = render({size: 'lg'}, {slots: {prefix: '<i/>'}})
        expect(field(lg).classes()).toContain('pl-9')
    })

    it('class 给外层容器，不污染 input 的控件样式', () => {
        const wrapper = render({class: 'max-w-xs'})
        expect(wrapper.classes()).toContain('max-w-xs')
        expect(field(wrapper).classes()).not.toContain('max-w-xs')
    })
})

describe('Input · 暴露方法', () => {
    it('focus() / select() 打到真正的 input 上', () => {
        const wrapper = render({modelValue: 'ada'}, {attachTo: document.body})
        wrapper.vm.focus()
        expect(document.activeElement).toBe(field(wrapper).element)

        const select = vi.spyOn(field(wrapper).element, 'select')
        wrapper.vm.select()
        expect(select).toHaveBeenCalled()
        wrapper.unmount()
    })
})
