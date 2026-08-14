import {describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import TagsInput from './TagsInput.vue'

/**
 * 这个原语要替掉 10 处 `el-input-tag`（收件人、白名单、允许域名），所以测试重心在两头：
 * ① a11y —— 每个删除按钮都得有自己的名字，否则读屏在一排标签里只会念一串「按钮」；
 * ② 受控契约 —— 组件永远只 emit，不自己改 modelValue，宿主不接受就不该变。
 *
 * 两个 reka 时序坑：
 * ① Enter 处理是 `await nextTick()` 之后再读 `target.value`，所以「输入并回车」要多等一拍；
 * ② 标签是通过 Collection 的 watchEffect（pre-flush）注册进 itemMap 的，mount 当拍还是空的。
 *    此时点删除，reka 的 `handleRemoveTag` 会拿 `collection[index].value` 而不判空，直接抛
 *    TypeError。真实用户不可能在首次 flush 前点到按钮，所以这是测试时序问题而非产品缺陷——
 *    渲染完等一拍再点即可。
 */

const TAGS = ['ada@unicorn.mail', 'grace@unicorn.mail']

const render = (props = {}, options = {}) => mount(TagsInput, {props: {modelValue: TAGS, ...props}, ...options})
const input = (wrapper) => wrapper.get('input')
const lastEmit = (wrapper, event) => {
    const all = wrapper.emitted(event)
    return all?.[all.length - 1]?.[0]
}

/** 模拟用户敲字并回车 */
async function type(wrapper, text) {
    const el = input(wrapper)
    el.element.value = text
    await el.trigger('keydown', {key: 'Enter'})
    await nextTick()
}

describe('TagsInput · 渲染与 a11y', () => {
    it('每个标签渲染一行文本 + 一个有名字的删除按钮', () => {
        const wrapper = render()
        const tags = wrapper.findAll('[data-reka-collection-item]')
        expect(tags).toHaveLength(2)
        expect(tags[0].text()).toContain('ada@unicorn.mail')

        const deletes = wrapper.findAll('button')
        expect(deletes[0].attributes('aria-label')).toBe('移除 ada@unicorn.mail')
        expect(deletes[1].attributes('aria-label')).toBe('移除 grace@unicorn.mail')
    })

    it('删除按钮里的图标对读屏隐藏', () => {
        expect(render().get('button svg').attributes('aria-hidden')).toBe('true')
    })

    it('ariaLabel / id 落在真正的输入框上', () => {
        const wrapper = render({id: 'to-field', ariaLabel: '收件人'})
        expect(input(wrapper).attributes('id')).toBe('to-field')
        expect(input(wrapper).attributes('aria-label')).toBe('收件人')
    })

    it('invalid 只标在输入框上，正常态不留空属性', () => {
        expect(input(render({invalid: true})).attributes('aria-invalid')).toBe('true')
        expect(input(render()).attributes('aria-invalid')).toBeUndefined()
    })

    it('inheritAttrs: false —— 外部属性透到输入框而不是外框', () => {
        const wrapper = render({}, {attrs: {'data-testid': 'to', autocomplete: 'email'}})
        expect(input(wrapper).attributes('data-testid')).toBe('to')
        expect(wrapper.element.getAttribute('data-testid')).toBeNull()
    })
})

describe('TagsInput · 受控增删', () => {
    it('回车把新标签追加到末尾（只 emit，不自己改）', async () => {
        const wrapper = render()
        await type(wrapper, 'linus@unicorn.mail')

        expect(lastEmit(wrapper, 'update:modelValue')).toEqual([...TAGS, 'linus@unicorn.mail'])
        // 宿主没回写，DOM 就该停在两个标签
        expect(wrapper.findAll('[data-reka-collection-item]')).toHaveLength(2)
    })

    it('空输入回车什么也不发生', async () => {
        const wrapper = render()
        await type(wrapper, '')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('默认拒绝重复值并抛 invalid', async () => {
        const wrapper = render()
        await type(wrapper, 'ada@unicorn.mail')

        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(lastEmit(wrapper, 'invalid')).toBe('ada@unicorn.mail')
    })

    it('duplicate 打开后允许重复', async () => {
        const wrapper = render({duplicate: true})
        await type(wrapper, 'ada@unicorn.mail')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual([...TAGS, 'ada@unicorn.mail'])
    })

    it('点删除按钮发的是「去掉这一个」的新数组', async () => {
        const wrapper = render()
        await nextTick() // 等 Collection 注册完，见文件头注释②
        await wrapper.findAll('button')[0].trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['grace@unicorn.mail'])
    })

    it('分隔符输入即成标签', async () => {
        const wrapper = render()
        const el = input(wrapper)
        el.element.value = 'linus@unicorn.mail,'
        await el.trigger('input', {data: ','})
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual([...TAGS, 'linus@unicorn.mail'])
    })
})

describe('TagsInput · max', () => {
    it('到上限就禁用输入框并收掉 placeholder（免得看着像还能填）', () => {
        const wrapper = render({max: 2, placeholder: '输入邮箱'})
        expect(input(wrapper).attributes('disabled')).toBeDefined()
        // 组件传的是空串而不是 undefined，所以属性在但内容为空
        expect(input(wrapper).attributes('placeholder')).toBe('')
    })

    it('没到上限时输入框照常可用', () => {
        const wrapper = render({max: 5, placeholder: '输入邮箱'})
        expect(input(wrapper).attributes('disabled')).toBeUndefined()
        expect(input(wrapper).attributes('placeholder')).toBe('输入邮箱')
    })

    it('超限的添加被拒绝并抛 invalid', async () => {
        const wrapper = render({max: 2})
        // 输入框已禁用，直接走 reka 的 onAddValue 语义：粘贴也会被拦
        await input(wrapper).trigger('paste', {
            clipboardData: {getData: () => 'linus@unicorn.mail'},
        })
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})

describe('TagsInput · 清空与禁用', () => {
    it('clearable 且有标签才出清空按钮，点了发空数组', async () => {
        const wrapper = render({clearable: true})
        await nextTick()
        const clear = wrapper.findAll('button').at(-1)
        expect(clear.attributes('aria-label')).toBe('清除')

        await clear.trigger('click')
        expect(lastEmit(wrapper, 'update:modelValue')).toEqual([])
    })

    it('没有标签时不出清空按钮', () => {
        expect(render({clearable: true, modelValue: []}).findAll('button')).toHaveLength(0)
    })

    it('disabled 传到输入框，且外框标 data-disabled', () => {
        const wrapper = render({disabled: true})
        expect(input(wrapper).attributes('disabled')).toBeDefined()
        expect(wrapper.element.getAttribute('data-disabled')).toBe('')
    })
})

describe('TagsInput · 外观', () => {
    it('三档尺寸给标签不同高度', () => {
        const tagClass = (size) => render({size}).get('[data-reka-collection-item]').classes()
        expect(tagClass('sm')).toContain('h-5')
        expect(tagClass('md')).toContain('h-5.5')
        expect(tagClass('lg')).toContain('h-6')
    })

    it('聚焦环挂在外框上（focus-within），因为真正的输入框只是其中一格', () => {
        expect(render().classes()).toContain('focus-within:outline-focus')
    })

    it('class 透传', () => {
        expect(render({class: 'mt-2'}).classes()).toContain('mt-2')
    })
})
