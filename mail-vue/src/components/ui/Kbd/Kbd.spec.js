/**
 * Kbd 的价值全在 `keys` 的解析上：调用方只写一份 `'Mod+K'`，由它决定渲染 ⌘ 还是 Ctrl。
 *
 * `isMac` 在模块加载时就求值了（读 navigator.platform），所以这里不去 mock 平台 ——
 * 那需要 vi.resetModules() 重新 import，为一个常量做这些不值得。改为断言
 * 「解析出的键位个数与结构」以及「跨平台都成立的那部分」（符号键、大写化）。
 */
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import Kbd from './Kbd.vue'

/** 内层 kbd 才是一个个键位，外层那个是容器 */
const keysOf = (wrapper) => wrapper.findAll('kbd kbd').map((el) => el.text())

describe('Kbd', () => {
    it('字符串按 + 拆分', () => {
        expect(keysOf(mount(Kbd, {props: {keys: 'Mod+Shift+K'}}))).toHaveLength(3)
    })

    it('数组写法与字符串等价', () => {
        const fromString = keysOf(mount(Kbd, {props: {keys: 'Mod+K'}}))
        const fromArray = keysOf(mount(Kbd, {props: {keys: ['Mod', 'K']}}))
        expect(fromArray).toEqual(fromString)
    })

    it('Mod 解析成当前平台的主修饰键（⌘ 或 Ctrl），不会原样输出 Mod', () => {
        const [mod] = keysOf(mount(Kbd, {props: {keys: 'Mod+K'}}))
        expect(mod).not.toBe('Mod')
        expect(['⌘', 'Ctrl']).toContain(mod)
    })

    it('单字符键位统一大写', () => {
        expect(keysOf(mount(Kbd, {props: {keys: 'k'}}))).toEqual(['K'])
        expect(keysOf(mount(Kbd, {props: {keys: 'g+i'}}))).toEqual(['G', 'I'])
    })

    it('方向键两个平台都是箭头符号', () => {
        expect(keysOf(mount(Kbd, {props: {keys: ['up', 'down', 'left', 'right']}})))
            .toEqual(['↑', '↓', '←', '→'])
    })

    it('esc / enter 走符号表，不被当成普通多字符键原样输出', () => {
        const [esc] = keysOf(mount(Kbd, {props: {keys: 'Escape'}}))
        expect(['esc', 'Esc']).toContain(esc)
        const [enter] = keysOf(mount(Kbd, {props: {keys: 'Enter'}}))
        expect(['↵', 'Enter']).toContain(enter)
    })

    it('符号表大小写不敏感', () => {
        expect(keysOf(mount(Kbd, {props: {keys: 'SHIFT'}})))
            .toEqual(keysOf(mount(Kbd, {props: {keys: 'shift'}})))
    })

    it('表里没有的多字符键原样保留（不强行大写）', () => {
        expect(keysOf(mount(Kbd, {props: {keys: 'F12'}}))).toEqual(['F12'])
        expect(keysOf(mount(Kbd, {props: {keys: 'Space'}}))).toEqual(['Space'])
    })

    it('空串 / 空数组 / 多余的 + 不产出空键位', () => {
        expect(keysOf(mount(Kbd, {props: {keys: ''}}))).toEqual([])
        expect(keysOf(mount(Kbd, {props: {keys: []}}))).toEqual([])
        expect(keysOf(mount(Kbd, {props: {keys: 'Mod++K'}}))).toHaveLength(2)
        expect(keysOf(mount(Kbd, {props: {keys: ' Mod + K '}}))).toHaveLength(2)
    })

    it('结构是 kbd 套 kbd（HTML 规范推荐的组合键写法）', () => {
        const wrapper = mount(Kbd, {props: {keys: 'Mod+K'}})
        expect(wrapper.element.tagName).toBe('KBD')
        expect(wrapper.findAll('kbd kbd')).toHaveLength(2)
    })

    it('size 只改内层键位的类', () => {
        const sm = mount(Kbd, {props: {keys: 'K', size: 'sm'}}).find('kbd kbd').classes().join(' ')
        const md = mount(Kbd, {props: {keys: 'K', size: 'md'}}).find('kbd kbd').classes().join(' ')
        expect(sm).not.toBe(md)
    })
})
