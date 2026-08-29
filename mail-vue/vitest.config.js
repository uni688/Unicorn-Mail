import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'

/**
 * 两个 project：`web`（前端）与 `worker`（`../mail-worker` 的服务层）。
 *
 * P0 只有静态契约测试（token 对比度、遗留变量引用），跑在 node 下就够。
 * P1 起要挂载真组件，所以 `web` 整体切 jsdom —— 静态测试读文件用的是 node API，
 * 在 jsdom 环境里同样可用，不必再分两套 environment。
 * 插件要和 vite.config.js 对齐：组件里直接 import 了 `~icons/lucide/*`，
 * 少了 Icons() 这些 import 在测试里会解析失败。
 *
 * ---
 * 为什么 worker 的测试挂在**前端**这份 config 下（而不是 mail-worker 自己那份）：
 *
 * `mail-worker/vitest.config.js` 用的是 `@cloudflare/vitest-pool-workers`（真 workerd +
 * 本地 D1）。那套在本机起不来：池子把 vitest 跑在 workerd 里、需要 `node:vm`，
 * 这一版（pool 0.7.8 / miniflare 3.20250310）在 Windows 上以
 * `Failed to import "node:vm"` → `MiniflareCoreError [ERR_RUNTIME_FAILURE]` 结束，
 * 一个测试文件都收集不到（跟本次改动无关，升级 pool 需要连带换 wrangler/workerd 二进制）。
 *
 * 服务层的逻辑并不需要 workerd —— 它只碰 D1 与 KV 两个接口。所以 worker 的用例跑在
 * node 环境下，D1 用 `node:sqlite` 实现的替身（`mail-worker/test/helpers/d1-sqlite.js`），
 * 表结构由**真的** `dbInit.init()` 迁移链建出来，SQL 也是真的在 SQLite 上执行 ——
 * D1 本身就是 SQLite，`COLLATE NOCASE`、负数 LIMIT、`datetime('now', ?)` 这些
 * 正是要验的行为。剩下「只有 workerd 才有」的部分（真部署、真 HTTP 栈）留给
 * `wrangler dev` 的手工过审。
 *
 * 跑法：`pnpm vitest run`（两个 project）/ `pnpm vitest run --project worker`。
 */
export default defineConfig({
    plugins: [
        vue(),
        Icons({
            compiler: 'vue3',
            autoInstall: false,
            customizations: {
                transform: (svg) => svg.replace(/stroke-width="[^"]*"/g, 'stroke-width="1.5"'),
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        reporters: 'default',
        projects: [
            {
                extends: true,
                test: {
                    name: 'web',
                    environment: 'jsdom',
                    include: ['test/**/*.spec.js', 'src/**/*.spec.js'],
                    setupFiles: ['./test/setup.js'],
                },
            },
            {
                test: {
                    name: 'worker',
                    root: fileURLToPath(new URL('../mail-worker', import.meta.url)),
                    environment: 'node',
                    include: ['test/**/*.node.spec.js'],
                    // 每个文件的**第一个** setupEnv() 要跑完整条真迁移链（v1_1 → v3_2，几十条
                    // DDL），实测 5–8s；同文件后续用例复用已 transform 的模块，只要 10–20ms。
                    // 默认 5s 会让「第一个用例」随文件数增加而随机超时 —— 那是调度噪声，
                    // 不是被测行为，所以这里放宽到 30s 而不是去拆 setupEnv 的缓存。
                    testTimeout: 30000,
                },
            },
        ],
    },
})
