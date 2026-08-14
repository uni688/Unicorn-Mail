/**
 * Field 的 id 串联是整个表单 a11y 的地基：标签、说明、错误三者与控件的关联全靠它。
 * 这里锁的是「哪些 id 会出现在 aria-describedby 里」——尤其是报错时 hint 被顶掉后
 * **不能**再被引用（悬空引用会被 axe 判 aria-valid-attr-value）。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {h} from 'vue'
import Field from './Field.vue'

/**
 * 插槽用渲染函数而不是字符串模板：字符串模板拿不到作用域参数，
 * 而这三个值（id / describedBy / invalid）正是要断言的东西。
 */
function mountRaw(props = {}) {
    return mount(Field, {
        props,
        slots: {
            default: ({id, describedBy, invalid}) => h('input', {
                id,
                'aria-describedby': describedBy,
                'aria-invalid': invalid || undefined,
            }),
        },
    })
}

describe('Field', () => {
    it('label 的 for 指向控件自动生成的 id', () => {
        const wrapper = mountRaw({label: '邮箱'})
        const id = wrapper.find('input').attributes('id')
        expect(id).toBeTruthy()
        expect(wrapper.find('label').attributes('for')).toBe(id)
    })

    it('自定义 id 覆盖自动生成的', () => {
        const wrapper = mountRaw({label: '邮箱', id: 'my-input'})
        expect(wrapper.find('input').attributes('id')).toBe('my-input')
        expect(wrapper.find('label').attributes('for')).toBe('my-input')
    })

    it('只有 hint 时，describedBy 指向 hint 且 hint 元素存在', () => {
        const wrapper = mountRaw({label: '邮箱', hint: '用于登录'})
        const describedBy = wrapper.find('input').attributes('aria-describedby')
        expect(describedBy).toBeTruthy()
        // wrapper.get 找不到就抛错，等于同时证明了「id 不悬空」
        expect(wrapper.get(`#${describedBy}`).text()).toBe('用于登录')
    })

    it('报错时 hint 被顶掉，describedBy 只留 error —— 不能有悬空 id', () => {
        const wrapper = mountRaw({label: '邮箱', hint: '用于登录', error: '格式不对'})
        const describedBy = wrapper.find('input').attributes('aria-describedby')
        // 只有一个 id，且它对应的元素真的在 DOM 里
        expect(describedBy.split(' ')).toHaveLength(1)
        expect(wrapper.get(`#${describedBy}`).text()).toBe('格式不对')
        expect(wrapper.text()).not.toContain('用于登录')
    })

    it('无 hint 无 error 时不给 aria-describedby', () => {
        const wrapper = mountRaw({label: '邮箱'})
        expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined()
    })

    it('error 有值才 invalid', () => {
        expect(mountRaw({label: 'a'}).find('input').attributes('aria-invalid')).toBeUndefined()
        expect(mountRaw({label: 'a', error: 'x'}).find('input').attributes('aria-invalid')).toBe('true')
    })

    it('required：星号对读屏隐身，另有 sr-only 文本说明', () => {
        const wrapper = mountRaw({label: '邮箱', required: true})
        const star = wrapper.findAll('span').find((el) => el.text() === '*')
        expect(star.attributes('aria-hidden')).toBe('true')
        expect(wrapper.find('.sr-only').text()).toContain('必填')
    })

    it('optional 与 required 互斥，只渲染一个', () => {
        const optional = mountRaw({label: '备注', optional: true})
        expect(optional.text()).toContain('选填')
        const both = mountRaw({label: '备注', optional: true, required: true})
        expect(both.text()).not.toContain('选填')
    })

    it('hideLabel 只是视觉隐藏，label 元素仍在（读屏能拿到名字）', () => {
        const wrapper = mountRaw({label: '搜索', hideLabel: true})
        const label = wrapper.find('label')
        expect(label.exists()).toBe(true)
        expect(label.classes()).toContain('sr-only')
    })

    it('错误容器常驻并挂 aria-live，先存在后填内容才会被播报', () => {
        const wrapper = mountRaw({label: '邮箱'})
        expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
    })
})
