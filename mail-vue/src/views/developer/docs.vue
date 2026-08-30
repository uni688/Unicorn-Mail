<script setup>
/**
 * 开发者中心 · API 文档（§5.3.5）
 *
 * 文档从 [[open-api-enum]] 生成，不手写一份 Markdown：手写的那份第二天就会和调试台不一致，
 * 而「文档上写着的参数在调试台里没有」是最伤信任的一种 bug。
 *
 * 三块内容：
 * 1. **鉴权说明**。`Authorization: Bearer um_live_…`，一条 cURL 就能跑通的最小例子。
 * 2. **接口索引**。每条一个 Collapsible：参数表 + cURL 示例，默认收起（六条全展开要三屏）。
 * 3. **`/public/*` 的迁移指引**。旧接口标 Deprecated 并指到对应的 `/open/*`（§5.3.5）。
 *    不在这里说「什么时候删」—— 那是运营决定，文档只负责说清「有新的了」。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {RouterLink, useRouter} from 'vue-router'
import IconBook from '~icons/lucide/book-open'
import {Badge, Button, Code, Collapsible, CopyButton} from '@/components/ui'
import {DeveloperNav} from '@/components/composite'
import {legacyEndpoints, openApiBase, openApiEndpoints} from '@/enums/open-api-enum.js'

defineOptions({name: 'developer-docs'})

const {t} = useI18n()
const router = useRouter()

/**
 * 「去调试台试试」只在调试台那条路由真的注入了才画。
 * 两页同属 `api-key:query`，正常情况下同生共死；但 `RouterLink` 指向一个不存在的
 * 命名路由会在 resolve 阶段直接抛错，用 [[DeveloperNav]] 同一套 `hasRoute` 口径兜住。
 */
const hasConsole = computed(() => router.hasRoute('developer-console'))

const base = computed(() => openApiBase({absolute: true}))

/** 鉴权那段的最小例子：探活不需要任何 scope，是「Key 通不通」的最短验证 */
const authSnippet = computed(() => [
    `curl -H "Authorization: Bearer um_live_xxxxxxxx" \\`,
    `  ${base.value}/open/ping`,
].join('\n'))

/** 每条接口的 cURL。写操作给 `-d`，读操作把必填参数拼进 query，直接可粘 */
function snippetOf(endpoint) {
    const lines = [`curl -X ${endpoint.method} \\`, `  -H "Authorization: Bearer um_live_xxxxxxxx" \\`]

    const body = endpoint.params.filter(param => param.in === 'body')

    if (body.length) {
        const payload = {}
        body.forEach((param) => {
            payload[param.name] = param.type === 'number' ? 0 : `<${param.name}>`
        })
        lines.push('  -H "Content-Type: application/json" \\')
        lines.push(`  -d '${JSON.stringify(payload)}' \\`)
    }

    const query = endpoint.params
        .filter(param => param.in === 'query' && param.required)
        .map(param => `${param.name}=${param.placeholder ?? `<${param.name}>`}`)
        .join('&')

    lines.push(`  "${base.value}${endpoint.path}${query ? `?${query}` : ''}"`)
    return lines.join('\n')
}

const rows = computed(() => openApiEndpoints.map(endpoint => ({
    ...endpoint,
    snippet: snippetOf(endpoint),
})))

const METHOD_TONE = {GET: 'info', POST: 'accent', PUT: 'warning', DELETE: 'danger'}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <h1 class="flex items-center gap-1.5 text-title text-fg">
        <IconBook class="size-4 text-fg-muted" aria-hidden="true" />
        {{ t('developer.docs') }}
      </h1>
      <DeveloperNav class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto grid max-w-3xl gap-6 p-4 pb-10">

        <!-- 1. 鉴权 -->
        <section class="grid gap-2">
          <h2 class="text-subtitle text-fg">{{ t('openApi.authTitle') }}</h2>
          <p class="text-body text-fg-muted">{{ t('openApi.authDesc') }}</p>
          <p class="text-body text-fg-muted">{{ t('openApi.baseDesc', {base}) }}</p>
          <div class="flex items-start gap-1.5">
            <Code variant="block" wrap class="min-w-0 flex-1">{{ authSnippet }}</Code>
            <CopyButton :value="authSnippet" :label="t('developer.copySnippet')" />
          </div>
          <p class="text-caption text-fg-muted">{{ t('openApi.errorShape') }}</p>
        </section>

        <!-- 2. 接口索引 -->
        <section class="grid gap-2">
          <h2 class="text-subtitle text-fg">{{ t('openApi.endpointsTitle') }}</h2>
          <p class="text-body text-fg-muted">{{ t('openApi.endpointsDesc') }}</p>

          <ul class="grid gap-1.5">
            <li v-for="endpoint in rows" :key="endpoint.id" class="rounded-md border border-line">
              <Collapsible>
                <template #trigger>
                  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                    <Badge :tone="METHOD_TONE[endpoint.method]" size="sm" class="font-mono">
                      {{ endpoint.method }}
                    </Badge>
                    <code class="min-w-0 truncate font-mono text-mono text-fg">{{ endpoint.path }}</code>
                    <Badge v-if="endpoint.scope" size="sm" appearance="outline">{{ endpoint.scope }}</Badge>
                    <Badge v-else size="sm" appearance="outline">{{ t('openApi.noScope') }}</Badge>
                  </div>
                </template>

                <div class="grid gap-3 px-3 pb-3">
                  <p class="text-body text-fg-muted">{{ t(`openApi.${endpoint.id}Desc`) }}</p>

                  <!-- 参数表：读屏要能念出「参数名 / 位置 / 类型 / 是否必填」，所以用真表格 -->
                  <table v-if="endpoint.params.length" class="w-full text-left text-caption">
                    <caption class="sr-only">{{ t('openApi.paramsTitle') }}</caption>
                    <thead>
                      <tr class="border-b border-line text-fg-muted">
                        <th scope="col" class="py-1 pr-2 font-medium">{{ t('openApi.paramName') }}</th>
                        <th scope="col" class="py-1 pr-2 font-medium">{{ t('openApi.paramIn') }}</th>
                        <th scope="col" class="py-1 pr-2 font-medium">{{ t('openApi.paramType') }}</th>
                        <th scope="col" class="py-1 font-medium">{{ t('openApi.paramRequired') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="param in endpoint.params" :key="param.name" class="border-b border-line/60">
                        <td class="py-1 pr-2 font-mono text-mono text-fg">{{ param.name }}</td>
                        <td class="py-1 pr-2 text-fg-muted">{{ param.in }}</td>
                        <td class="py-1 pr-2 text-fg-muted">{{ param.type }}</td>
                        <td class="py-1 text-fg-muted">
                          {{ param.required ? t('openApi.yes') : t('openApi.no') }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-else class="text-caption text-fg-muted">{{ t('developer.noParams') }}</p>

                  <div class="flex items-start gap-1.5">
                    <Code variant="block" wrap class="min-w-0 flex-1">{{ endpoint.snippet }}</Code>
                    <CopyButton :value="endpoint.snippet" :label="t('developer.copySnippet')" />
                  </div>
                </div>
              </Collapsible>
            </li>
          </ul>
        </section>

        <!-- 3. /public/* 的迁移指引 -->
        <section class="grid gap-2">
          <h2 class="text-subtitle text-fg">{{ t('openApi.legacyTitle') }}</h2>
          <p class="text-body text-fg-muted">{{ t('openApi.legacyDesc') }}</p>

          <ul class="grid gap-1.5">
            <li
              v-for="item in legacyEndpoints"
              :key="item.path"
              class="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2"
            >
              <Badge tone="warning" size="sm">{{ t('openApi.deprecated') }}</Badge>
              <code class="font-mono text-mono text-fg-muted line-through">{{ item.method }} {{ item.path }}</code>
              <span class="text-caption text-fg-muted" aria-hidden="true">→</span>
              <span class="sr-only">{{ t('openApi.replacedBy') }}</span>
              <code class="font-mono text-mono text-fg">{{ item.replacement }}</code>
            </li>
          </ul>

          <p class="text-caption text-fg-muted">{{ t('openApi.legacyHint') }}</p>
        </section>

        <div v-if="hasConsole">
          <Button as-child variant="secondary" size="sm">
            <RouterLink :to="{name: 'developer-console'}">{{ t('openApi.tryItOut') }}</RouterLink>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
