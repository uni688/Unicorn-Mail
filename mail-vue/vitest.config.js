import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'

/**
 * P0 只有静态契约测试（token 对比度、遗留变量引用），跑在 node 下就够。
 * P1 起要挂载真组件，所以整体切 jsdom —— 静态测试读文件用的是 node API，
 * 在 jsdom 环境里同样可用，不必再分两套 environment。
 *
 * 插件要和 vite.config.js 对齐：组件里直接 import 了 `~icons/lucide/*`，
 * 少了 Icons() 这些 import 在测试里会解析失败。
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
        environment: 'jsdom',
        include: ['test/**/*.spec.js', 'src/**/*.spec.js'],
        setupFiles: ['./test/setup.js'],
        reporters: 'default',
    },
})
