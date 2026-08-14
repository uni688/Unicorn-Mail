// @vitest-environment node
// 同 legacy-css.spec.js：读源码做静态断言，留在 node 环境
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

/**
 * View Transitions 主题切换的两个坑。P0 的 vitest 环境是 node，没有 DOM，
 * 只能用源码静态断言守住；真正的行为测试等 P1 引入 jsdom + @vue/test-utils：
 *
 * 1. startViewTransition() 返回的三个 promise 里，ready / updateCallbackDone /
 *    finished 在过渡被跳过时都会 reject（Chrome: InvalidStateError
 *    "Transition was aborted because of invalid state"，标签页不可见、
 *    过渡被打断都会触发）。任何一个没人接手，控制台里就是 Uncaught (in promise)。
 *    实测：只处理 finished 不够，ready 才是真正在报错的那个。
 * 2. 过渡进行中再次切主题必须走「直接切」分支，否则两次径向扩散互相打断。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = readFileSync(join(ROOT, 'src/composables/useTheme.js'), 'utf8')

describe('主题切换动画（P0 回归护栏）', () => {
    it('ready / updateCallbackDone / finished 的 rejection 都有人接', () => {
        expect(SRC).toMatch(/\.ready\s*\.\s*catch\s*\(/)
        expect(SRC).toMatch(/\.updateCallbackDone\s*\.\s*catch\s*\(/)
        expect(SRC, '.finished.finally() 会把 reject 继续往下传').not.toMatch(/\.finished\s*\.\s*finally\s*\(/)
        expect(SRC).toMatch(/\.finished\s*\.\s*(then\s*\([^)]*,[^)]*\)|catch\s*\()/)
    })

    it('过渡进行中再切主题走直接切分支', () => {
        const guard = /if\s*\(\s*!document\.startViewTransition([\s\S]*?)\)\s*\{/.exec(SRC)
        expect(guard, '找不到「不做动画直接切」的判断分支').not.toBeNull()
        expect(guard[1], '判断条件里没有「过渡进行中」的守卫').toMatch(/transitioning/)
        // 守卫必须在过渡结束时复位，否则第一次动画之后再也没有动画
        expect(SRC).toMatch(/transitioning\s*=\s*false/)
    })
})
