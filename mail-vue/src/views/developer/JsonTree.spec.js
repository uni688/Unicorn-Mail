/**
 * JsonTree 单测（§4.3「响应 JSON 树」）。
 *
 * 三件事值得钉：默认展开两层（再深就收起，否则一条邮件列表响应能刷掉两屏）、
 * 长字符串截断（正文 HTML 动辄几万字符）、收起时的摘要要有信息量而不是一个 `…`。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import JsonTree from './JsonTree.vue'

const deep = {code: 200, data: {list: [{emailId: 1, content: 'x'.repeat(300)}], total: 1}}

describe('JsonTree · 折叠', () => {
    it('默认展开两层，第三层收起（`{code, message, data}` 的外壳看得见，正文不铺开）', () => {
        const wrapper = mount(JsonTree, {props: {value: deep}})
        const buttons = wrapper.findAll('button')
        // 根 + data + data.list：前两层展开，list 里的对象是第三层，收起
        expect(buttons.map((b) => b.attributes('aria-expanded'))).toEqual(['true', 'true', 'false'])
    })

    it('点一下就展开，键名与值都出来', async () => {
        const wrapper = mount(JsonTree, {props: {value: {a: {b: {c: 1}}}, defaultOpenDepth: 0}})
        expect(wrapper.text()).not.toContain('c')
        await wrapper.get('button').trigger('click')
        expect(wrapper.text()).toContain('a')
    })

    it('收起时的摘要是「几项」而不是省略号', () => {
        expect(mount(JsonTree, {props: {value: [1, 2, 3]}}).text()).toContain('[3]')
        expect(mount(JsonTree, {props: {value: {a: 1}}}).text()).toContain('{1}')
    })
})

describe('JsonTree · 叶子', () => {
    it('长字符串截断到 200 字符（响应里的 HTML 正文不能把页面撑爆）', () => {
        const wrapper = mount(JsonTree, {props: {value: 'y'.repeat(500)}})
        const text = wrapper.text()
        expect(text).toContain('…')
        expect(text.length).toBeLessThan(230)
    })

    it('短字符串带引号，null / 数字 / 布尔按类型着色', () => {
        expect(mount(JsonTree, {props: {value: 'ok'}}).text()).toBe('"ok"')
        expect(mount(JsonTree, {props: {value: null}}).text()).toBe('null')
        expect(mount(JsonTree, {props: {value: 0}}).html()).toContain('text-info')
        expect(mount(JsonTree, {props: {value: false}}).html()).toContain('text-accent')
    })

    it('数组下标当键名用，读得出「第几项」', () => {
        const wrapper = mount(JsonTree, {props: {value: ['a', 'b']}})
        expect(wrapper.text()).toContain('0')
        expect(wrapper.text()).toContain('1')
    })
})
