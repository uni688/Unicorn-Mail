import {readdirSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import * as ui from '@/components/ui/index.js'

/**
 * 桶文件有 40 个，全靠手写维护 —— 漏加一个新组件，`import {X} from '@/components/ui'`
 * 会静默拿到 undefined，然后在渲染时炸成一句莫名其妙的 "Invalid VNode type"。
 * 这个测试直接拿磁盘上的目录结构当事实来源，逼着桶文件跟上。
 */

const UI_DIR = 'src/components/ui'

const folders = readdirSync(UI_DIR)
    .filter((name) => name !== '_shared' && statSync(join(UI_DIR, name)).isDirectory())
    .sort()

/** 每个目录里的 `*.vue` 基名就是它应该导出的组件名 */
const expected = folders.flatMap((folder) => readdirSync(join(UI_DIR, folder))
    .filter((file) => file.endsWith('.vue'))
    .map((file) => file.replace(/\.vue$/, '')))

describe('components/ui 桶文件', () => {
    it('目录数与 §6.1 的规模相符（21 个 L1 原语，含拆分出来的子组件）', () => {
        expect(folders.length).toBeGreaterThanOrEqual(21)
    })

    it('每个组件目录里的每个 .vue 都从根桶导出了', () => {
        const missing = expected.filter((name) => ui[name] === undefined)
        expect(missing).toEqual([])
    })

    it('导出的都是组件对象，不是 undefined 或字符串', () => {
        for (const name of expected) {
            expect(ui[name], name).toBeTypeOf('object')
        }
    })

    it('日期契约与宿主接线的工具函数也一起导出', () => {
        for (const name of ['todayKey', 'toDateKey', 'toCalendarDate', 'formatDateKey', 'toast', 'useUiText', 'useUiLocale', 'UI_TEXT_FALLBACK']) {
            expect(ui[name], name).toBeDefined()
        }
    })

    it('每个子目录自己的 index.js 也能单独 import（按需引入的路径）', async () => {
        for (const folder of folders) {
            const mod = await import(`@/components/ui/${folder}/index.js`)
            expect(Object.keys(mod).length, folder).toBeGreaterThan(0)
        }
    })
})
