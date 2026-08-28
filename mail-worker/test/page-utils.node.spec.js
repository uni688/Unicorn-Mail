/**
 * `pageSize` / `pageNum` 的双边收口。
 *
 * 这两个函数是本次审计里唯一被所有列表接口共用的入口，坑在下界：SQLite 把负 LIMIT
 * 当「无限制」，drizzle 也不拦，于是 `size=-1` 能把整张表（含 HTML 正文）拉走。
 * 所以用例重点不是「大于 50 夹到 50」，而是**每一种非正整数**都必须落回默认值。
 */
import {describe, expect, it} from 'vitest'
import {pageNum, pageSize} from '../src/utils/page-utils.js'

describe('pageSize', () => {

    it('正整数原样返回', () => {
        expect(pageSize(1)).toBe(1)
        expect(pageSize(30)).toBe(30)
        expect(pageSize(50)).toBe(50)
    })

    it('超上限夹到 max', () => {
        expect(pageSize(51)).toBe(50)
        expect(pageSize(100000)).toBe(50)
        expect(pageSize(30, 20, 25)).toBe(25)
    })

    // 这一组就是审计 P1-1 的回归：任何一项漏掉都等于放开无限拉取
    it.each([
        ['负数', -1],
        ['更大的负数', -99999],
        ['零', 0],
        ['小数', 1.5],
        ['负小数', -0.5],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
        ['非数字字符串', 'abc'],
        ['空字符串', ''],
        ['空白字符串', '   '],
        ['undefined', undefined],
        ['null', null],
        ['布尔 false', false],
        ['对象', {}],
        ['数组', []],
    ])('%s 落回默认值', (_label, raw) => {
        expect(pageSize(raw)).toBe(50)
        expect(pageSize(raw, 7)).toBe(7)
    })

    it('数字字符串按数字处理（查询串来的都是字符串）', () => {
        expect(pageSize('20')).toBe(20)
        expect(pageSize('-20')).toBe(50)
        expect(pageSize('999')).toBe(50)
    })

    it('默认值本身不再过 max —— 调用方自己保证 def <= max', () => {
        expect(pageSize(undefined, 10, 5)).toBe(10)
    })
})

describe('pageNum', () => {

    it('正整数原样返回，且不设上限（深翻页由 total 自然收口）', () => {
        expect(pageNum(1)).toBe(1)
        expect(pageNum(9999)).toBe(9999)
    })

    // (num - 1) * size 里 num <= 0 会算出负 OFFSET，SQLite 直接报错
    it.each([
        ['零', 0],
        ['负数', -3],
        ['小数', 2.7],
        ['NaN', NaN],
        ['字符串', 'x'],
        ['undefined', undefined],
        ['null', null],
    ])('%s 落回第 1 页', (_label, raw) => {
        expect(pageNum(raw)).toBe(1)
        expect(pageNum(raw, 3)).toBe(3)
    })

    it('数字字符串按数字处理', () => {
        expect(pageNum('4')).toBe(4)
        expect(pageNum('0')).toBe(1)
    })
})
