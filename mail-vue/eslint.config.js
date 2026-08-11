import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/**
 * P0 起的静态检查基线（§10.6）：
 * - 新代码（design / composables / components/ui / views/design-system）跑严格规则，零 error
 * - 1.5 万行未迁移的旧视图先只跑「能抓真 bug」的规则，风格类降级为 warn，
 *   避免在 Strangler 迁移完成前制造几千条噪音
 */
const NEW_CODE = [
    'src/design/**/*.{js,vue}',
    'src/composables/**/*.{js,vue}',
    'src/components/ui/**/*.{js,vue}',
    'src/components/composite/**/*.{js,vue}',
    'src/components/domain/**/*.{js,vue}',
    'src/views/design-system/**/*.{js,vue}',
]

export default [
    {
        ignores: ['dist/**', 'dev-dist/**', 'public/**', 'node_modules/**', '*.min.js'],
    },
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['**/*.{js,vue}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // unplugin-auto-import + ElementPlusResolver 注入的全局（P6 随 EP 移除）
                ElMessage: 'readonly',
                ElMessageBox: 'readonly',
                ElNotification: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none'}],
            'no-empty': ['warn', {allowEmptyCatch: true}],
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'off',
        },
    },
    {
        // 旧代码：风格类规则全部降级，只保留真错误
        files: ['src/**/*.{js,vue}'],
        ignores: NEW_CODE,
        rules: {
            'vue/attributes-order': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-self-closing': 'off',
            'vue/html-indent': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/first-attribute-linebreak': 'off',
            'vue/require-default-prop': 'off',
            'vue/attribute-hyphenation': 'off',
            'vue/v-on-event-hyphenation': 'off',
        },
    },
    {
        files: NEW_CODE,
        rules: {
            'no-unused-vars': 'error',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': ['error', 2],
        },
    },
    {
        files: ['*.config.js', 'vitest.config.js', 'eslint.config.js'],
        languageOptions: {globals: {...globals.node}},
    },
]
