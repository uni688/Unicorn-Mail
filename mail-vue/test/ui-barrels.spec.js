import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import * as ui from '@/components/ui/index.js'

// L2 桶里的 CommandPalette 顺着 `utils/day.js` 会在**模块顶层**就 `useSettingStore()`
// （旧代码遗留），少了 pinia 是 import 那一刻就抛；静态 import 会被提升到这行之前。
setActivePinia(createPinia())
const composite = await import('@/components/composite/index.js')
const domain = await import('@/components/domain/index.js')

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

/**
 * L2 / L3 的桶是平铺的（没有子目录），同一个静默 undefined 的坑照样存在 ——
 * P2 起 `AppShell` / `CommandPalette` 这些是全站入口，漏导出直接白屏。
 */
const L2_DIRS = [
    {dir: 'src/components/composite', barrel: composite, label: 'composite'},
    {dir: 'src/components/domain', barrel: domain, label: 'domain'},
]

/** `*.spec.js` 与 `index.js` 不算组件 */
function vueNames(dir) {
    return readdirSync(dir)
        .filter((file) => file.endsWith('.vue'))
        .map((file) => file.replace(/\.vue$/, ''))
        .sort()
}

describe('components/composite + components/domain 桶文件', () => {
    for (const {dir, barrel, label} of L2_DIRS) {
        it(`${label}/ 里的每个 .vue 都导出了，且没有多余导出`, () => {
            expect(Object.keys(barrel).sort()).toEqual(vueNames(dir))
        })

        it(`${label}/ 导出的都是组件对象`, () => {
            for (const [name, value] of Object.entries(barrel)) {
                expect(value, name).toBeTypeOf('object')
            }
        })
    }

    /**
     * `/_ds` 页头写着「共 N 个组件」。这两个数字是人手维护的，跟磁盘对不上时
     * 页面就在说谎 —— 与其靠人记得改，不如让这里断言它们一致。
     */
    it('/_ds 上宣称的组件个数与磁盘一致', () => {
        const src = readFileSync('src/views/design-system/index.vue', 'utf8')
        const read = (name) => Number(src.match(new RegExp(`const ${name} = (\\d+)`))?.[1])

        expect(read('COMPONENT_COUNT')).toBe(expected.length)
        expect(read('COMPOSITE_COUNT')).toBe(
            L2_DIRS.reduce((n, {dir}) => n + vueNames(dir).length, 0),
        )
    })
})
