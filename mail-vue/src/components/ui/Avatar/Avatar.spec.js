/**
 * Avatar 的逻辑就两块：`name` → 首字母，以及「装饰性用法不要被读屏念两遍」。
 *
 * reka 的 AvatarImage 只有在图片真的 load 成功后才显示，jsdom 里不会发生，
 * 所以这里断言的是 fallback 分支与 img 的属性，不去等图片状态机。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Avatar from './Avatar.vue'

const initialsOf = (name) => mount(Avatar, {props: {name}}).text()

describe('Avatar', () => {
    it('邮箱只取 @ 前面的部分', () => {
        // 大写是 CSS 干的（avatarFallbackVariants 里有 uppercase），文本本身保持原样
        expect(initialsOf('ada@unicorn.mail')).toBe('ad')
    })

    it('拉丁文取前两段的首字母', () => {
        expect(initialsOf('Ada Lovelace')).toBe('AL')
        expect(initialsOf('ada.lovelace@x.com')).toBe('al')
    })

    it('单段拉丁文取前两个字符', () => {
        expect(initialsOf('ada')).toBe('ad')
        expect(initialsOf('A')).toBe('A')
    })

    it('CJK 取前两个字（不是首字母）', () => {
        expect(initialsOf('张三丰')).toBe('张三')
        expect(initialsOf('独角兽邮箱')).toBe('独角')
    })

    it('分隔符支持空格 / . / _ / - / +', () => {
        expect(initialsOf('ada_lovelace')).toBe('al')
        expect(initialsOf('ada-lovelace')).toBe('al')
        expect(initialsOf('ada+tag@x.com')).toBe('at')
    })

    it('name 为空时退化成占位图标，不渲染文字', () => {
        const wrapper = mount(Avatar)
        expect(wrapper.text()).toBe('')
        expect(wrapper.find('svg').exists()).toBe(true)
    })

    it('给了 src 才渲染 img，alt 用 name', () => {
        expect(mount(Avatar, {props: {name: 'Ada'}}).find('img').exists()).toBe(false)
        const wrapper = mount(Avatar, {props: {src: 'https://x/y.png', name: 'Ada'}})
        const img = wrapper.find('img')
        expect(img.attributes('src')).toBe('https://x/y.png')
        expect(img.attributes('alt')).toBe('Ada')
    })

    it('decorative：img 的 alt 置空、首字母 aria-hidden，避免读屏念两遍', () => {
        const wrapper = mount(Avatar, {props: {src: 'https://x/y.png', name: 'Ada', decorative: true}})
        expect(wrapper.find('img').attributes('alt')).toBe('')
        // fallback 容器带 aria-hidden
        expect(wrapper.html()).toContain('aria-hidden="true"')
    })

    it('status 点默认纯装饰；给了 statusLabel 才有名字', () => {
        const bare = mount(Avatar, {props: {name: 'Ada', status: 'online'}})
        const dot = bare.findAll('span').at(-1)
        expect(dot.attributes('aria-hidden')).toBe('true')
        expect(dot.attributes('role')).toBeUndefined()

        const labelled = mount(Avatar, {props: {name: 'Ada', status: 'online', statusLabel: '在线'}})
        const named = labelled.findAll('[role="img"]')
        expect(named).toHaveLength(1)
        expect(named[0].attributes('aria-label')).toBe('在线')
        expect(named[0].attributes('aria-hidden')).toBeUndefined()
    })

    it('不给 status 就没有那个点', () => {
        const wrapper = mount(Avatar, {props: {name: 'Ada'}})
        expect(wrapper.findAll('span').some((el) => el.classes().includes('rounded-full') && el.classes().includes('absolute')))
            .toBe(false)
    })

    it('size / shape / tone 落到类名上', () => {
        const md = mount(Avatar, {props: {name: 'A'}}).classes().join(' ')
        const xl = mount(Avatar, {props: {name: 'A', size: 'xl'}}).classes().join(' ')
        expect(md).not.toBe(xl)

        const circle = mount(Avatar, {props: {name: 'A'}}).classes()
        const rounded = mount(Avatar, {props: {name: 'A', shape: 'rounded'}}).classes()
        expect(circle).not.toEqual(rounded)

        const neutral = mount(Avatar, {props: {name: 'A'}}).html()
        const accent = mount(Avatar, {props: {name: 'A', tone: 'accent'}}).html()
        expect(neutral).not.toBe(accent)
    })

    it('#fallback 插槽接管首字母', () => {
        const wrapper = mount(Avatar, {props: {name: 'Ada'}, slots: {fallback: '<span>自定义</span>'}})
        expect(wrapper.text()).toBe('自定义')
        expect(wrapper.text()).not.toContain('AD')
    })
})
