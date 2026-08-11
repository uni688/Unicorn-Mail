import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

/**
 * P0 阶段的测试只做「不需要 DOM 的静态契约校验」：
 * token 对比度、遗留 CSS 变量是否还有人引用、主题色是否两处一致。
 * 组件测试（需要 jsdom + @vue/test-utils）留到 P1 有真组件时再加环境。
 */
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['test/**/*.spec.js', 'src/**/*.spec.js'],
        reporters: 'default',
    },
})
