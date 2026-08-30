<script setup>
/**
 * 开发者中心 · API 调试台（§4.3）
 *
 * 三条约束决定了这一页的形状：
 *
 * 1. **不点「发送」就绝不发请求**。选接口、填参数、切 Key 都只改本地状态；
 *    §4.3 明确写了这一条，因为 `/open/email/send` 是真的会把信发出去的。
 *    写操作还要再过一次 AlertDialog（`endpoint.write === true`）。
 * 2. **不走 axios**。项目的 http 实例会自动带上会话 token 与 `accept-language`，
 *    还会在 401 时清会话、跳登录 —— 调试台要模拟的是**第三方拿着 Key 打过来**，
 *    带上会话 token 就测不出 Key 本身有没有问题，而一个故意用错 Key 的 401
 *    会把用户自己的登录态踢掉。所以这里用裸 `fetch`，只带 `Authorization: Bearer`。
 * 3. **明文 Key 只在内存里**。库里没有明文（`api-key-service` 第 1 条），所以调试台
 *    没法「选一把 Key 就自动填好」，只能让用户把创建时抄下来的明文粘进来。
 *    粘进来的值不写 localStorage：一个能长期调 API 的凭据落进 localStorage，
 *    任何一次 XSS 就能把它捞走；刷新页面要重新粘，这是有意的代价。
 *
 * 左侧列表按 scope 分组（`openApiScopeGroups`），因为「这把 Key 能打哪些接口」正好
 * 是按 scope 切的：勾了 `email:read` 就是那一组亮着。
 */
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import IconSend from '~icons/lucide/send'
import IconTerminal from '~icons/lucide/terminal'
import {
    AlertDialog, Badge, Button, Code, CopyButton, Field, Input, Segmented, Textarea,
} from '@/components/ui'
import {DeveloperNav, EmptyState} from '@/components/composite'
import {toast} from '@/components/ui/Toast/toast.js'
import JsonTree from './JsonTree.vue'
import {openApiBase, openApiEndpoints, openApiScopeGroups} from '@/enums/open-api-enum.js'

defineOptions({name: 'developer-console'})

const {t} = useI18n()

/* ------------------------------------------------------------------ 接口选择 */

/** 按 scope 分组；`null` 那一组是探活（不需要任何 scope） */
const groups = computed(() => openApiScopeGroups
    .map(scope => ({
        scope,
        label: scope ?? t('openApi.noScope'),
        items: openApiEndpoints.filter(item => item.scope === scope),
    }))
    .filter(group => group.items.length > 0))

const activeId = ref(openApiEndpoints[0]?.id ?? '')
const endpoint = computed(() => openApiEndpoints.find(item => item.id === activeId.value) ?? null)

/**
 * 参数值按接口分开存：切回上一个接口时填过的东西还在。
 * 键是 `${endpointId}.${paramName}`，不用嵌套对象是为了让 reactive 的依赖粒度就是一格。
 */
const values = reactive({})

function valueKey(param) {
    return `${activeId.value}.${param.name}`
}

function paramValue(param) {
    return values[valueKey(param)] ?? ''
}

function setParam(param, next) {
    values[valueKey(param)] = next
}

function selectEndpoint(id) {
    activeId.value = id
    // 换接口就把上一次的响应清掉：留着会让人以为那是新接口的返回
    response.value = null
}

/* -------------------------------------------------------------- 请求的组装 */

/** 明文 Key。空着也允许发 —— 探活不需要 Key，且「不带 Key 会怎样」本身就值得试 */
const plainKey = ref('')

/** 填了值的参数才进请求：空字符串送过去会变成 `?size=`，服务端要当非法值处理 */
function filled(param) {
    const raw = String(paramValue(param) ?? '').trim()
    return raw !== '' ? raw : null
}

/** `type: 'number'` 的参数转成数字，其余保持字符串（校验是服务端的事，这里只管类型） */
function typed(param, raw) {
    if (param.type !== 'number') {
        return raw
    }
    const num = Number(raw)
    return Number.isFinite(num) ? num : raw
}

const queryParams = computed(() => (endpoint.value?.params ?? [])
    .filter(param => param.in === 'query')
    .map(param => [param, filled(param)])
    .filter(([, raw]) => raw !== null))

const bodyParams = computed(() => (endpoint.value?.params ?? [])
    .filter(param => param.in === 'body')
    .map(param => [param, filled(param)])
    .filter(([, raw]) => raw !== null))

const requestUrl = computed(() => {
    if (!endpoint.value) {
        return ''
    }
    const search = new URLSearchParams()
    queryParams.value.forEach(([param, raw]) => search.set(param.name, raw))
    const qs = search.toString()
    return `${openApiBase({absolute: true})}${endpoint.value.path}${qs ? `?${qs}` : ''}`
})

const requestBody = computed(() => {
    if (!bodyParams.value.length) {
        return null
    }
    const out = {}
    bodyParams.value.forEach(([param, raw]) => {
        out[param.name] = typed(param, raw)
    })
    return out
})

/* ------------------------------------------------------------------ 代码片段 */

/** 片段里的 Key 用占位符，除非用户真填了 —— 复制出去贴到工单里不该带着真凭据 */
const snippetKey = computed(() => plainKey.value.trim() || 'um_live_YOUR_KEY')

const bodyJson = computed(() => (requestBody.value ? JSON.stringify(requestBody.value, null, 2) : ''))

const snippets = computed(() => {
    const url = requestUrl.value
    const method = endpoint.value?.method ?? 'GET'
    const body = requestBody.value

    const curl = [
        `curl -X ${method} \\`,
        `  -H "Authorization: Bearer ${snippetKey.value}" \\`,
        ...(body ? ['  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(body)}' \\`] : []),
        `  "${url}"`,
    ].join('\n')

    const fetchCode = [
        `const res = await fetch('${url}', {`,
        `  method: '${method}',`,
        '  headers: {',
        `    Authorization: 'Bearer ${snippetKey.value}',`,
        ...(body ? ["    'Content-Type': 'application/json',"] : []),
        '  },',
        ...(body ? [`  body: JSON.stringify(${JSON.stringify(body)}),`] : []),
        '})',
        'const data = await res.json()',
    ].join('\n')

    const python = [
        'import requests',
        '',
        `res = requests.${method.toLowerCase()}(`,
        `    "${url}",`,
        `    headers={"Authorization": "Bearer ${snippetKey.value}"},`,
        ...(body ? [`    json=${JSON.stringify(body)},`] : []),
        ')',
        'print(res.json())',
    ].join('\n')

    return {curl, fetch: fetchCode, requests: python}
})

const snippetLang = ref('curl')

const snippetItems = computed(() => [
    {label: 'cURL', value: 'curl'},
    {label: 'fetch', value: 'fetch'},
    {label: 'requests', value: 'requests'},
])

const snippetText = computed(() => snippets.value[snippetLang.value] ?? '')

/* -------------------------------------------------------------------- 发送 */

const sending = ref(false)
/** @type {import('vue').Ref<{status:number, ok:boolean, duration:number, data:any, raw:string}|null>} */
const response = ref(null)

const confirmOpen = ref(false)

function onSend() {
    // 写操作二次确认（§4.3）：`/open/email/send` 点下去就是真发信，没有撤回
    if (endpoint.value?.write) {
        confirmOpen.value = true
        return
    }
    send()
}

async function send() {
    if (!endpoint.value) {
        return
    }
    confirmOpen.value = false
    sending.value = true
    const started = performance.now()
    try {
        const headers = {}
        if (plainKey.value.trim()) {
            headers.Authorization = `Bearer ${plainKey.value.trim()}`
        }
        if (requestBody.value) {
            headers['Content-Type'] = 'application/json'
        }

        const res = await fetch(requestUrl.value, {
            method: endpoint.value.method,
            headers,
            body: requestBody.value ? JSON.stringify(requestBody.value) : undefined,
        })

        const raw = await res.text()
        let data = raw
        try {
            data = JSON.parse(raw)
        } catch {
            // 非 JSON（比如反代插进来的一页 HTML 错误页）就原样显示，不能吞掉
        }

        response.value = {
            status: res.status,
            ok: res.ok,
            duration: Math.round(performance.now() - started),
            data,
            raw,
        }
    } catch (e) {
        // fetch 本身抛错 = 网络层没通（CORS / 断网 / 地址写错），没有 HTTP 状态码可显示
        response.value = {
            status: 0,
            ok: false,
            duration: Math.round(performance.now() - started),
            data: {error: String(e?.message ?? e)},
            raw: String(e?.message ?? e),
        }
        toast.error(t('developer.sendFailed'))
    } finally {
        sending.value = false
    }
}

/** 状态码色调：与日志页同一套口径（2xx 绿 / 4xx 黄 / 5xx 红 / 0 灰） */
const statusTone = computed(() => {
    const status = response.value?.status ?? 0
    if (status >= 200 && status < 300) return 'success'
    if (status >= 400 && status < 500) return 'warning'
    if (status >= 500) return 'danger'
    return 'neutral'
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-canvas">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <h1 class="text-title text-fg">{{ t('developer.console') }}</h1>
      <DeveloperNav class="ml-auto" />
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
      <!-- 左：接口索引，按 scope 分组 -->
      <nav
        class="shrink-0 lg:w-56"
        :aria-label="t('developer.endpoints')"
      >
        <ul class="grid gap-3">
          <li v-for="group in groups" :key="String(group.scope)">
            <p class="px-1 pb-1 text-label text-fg-muted">{{ group.label }}</p>
            <ul class="grid gap-0.5">
              <li v-for="item in group.items" :key="item.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-hover"
                  :class="item.id === activeId && 'bg-selected text-fg'"
                  :aria-current="item.id === activeId ? 'true' : undefined"
                  @click="selectEndpoint(item.id)"
                >
                  <Badge :tone="item.write ? 'warning' : 'neutral'" size="sm" class="shrink-0 font-mono">
                    {{ item.method }}
                  </Badge>
                  <span class="min-w-0 truncate text-body">{{ t(`openApi.${item.id}`) }}</span>
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <!-- 右：参数 → 发送 → 响应 -->
      <div v-if="endpoint" class="grid min-w-0 flex-1 content-start gap-4">
        <section class="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center gap-2">
            <Badge :tone="endpoint.write ? 'warning' : 'neutral'" class="font-mono">{{ endpoint.method }}</Badge>
            <code class="min-w-0 truncate font-mono text-mono text-fg">{{ endpoint.path }}</code>
            <Badge v-if="endpoint.scope" tone="info" size="sm">{{ endpoint.scope }}</Badge>
          </div>
          <p class="text-caption text-fg-muted">{{ t(`openApi.${endpoint.id}Desc`) }}</p>
        </section>

        <section class="grid gap-3 rounded-lg border border-line bg-surface p-4">
          <Field :label="t('developer.plainKeyLabel')" :hint="t('developer.plainKeyHint')">
            <template #default="{id}">
              <Input
                :id="id"
                v-model="plainKey"
                type="password"
                :placeholder="'um_live_…'"
                autocomplete="off"
                spellcheck="false"
              />
            </template>
          </Field>

          <div v-if="endpoint.params.length" class="grid gap-3 md:grid-cols-2">
            <Field
              v-for="param in endpoint.params"
              :key="param.name"
              :label="param.name"
              :hint="`${param.in} · ${param.type}`"
              :required="param.required === true"
            >
              <template #default="{id}">
                <Textarea
                  v-if="param.name === 'content'"
                  :id="id"
                  :model-value="paramValue(param)"
                  :rows="3"
                  @update:model-value="setParam(param, $event)"
                />
                <Input
                  v-else
                  :id="id"
                  :model-value="paramValue(param)"
                  :placeholder="param.placeholder ?? ''"
                  @update:model-value="setParam(param, $event)"
                />
              </template>
            </Field>
          </div>
          <p v-else class="text-caption text-fg-muted">{{ t('developer.noParams') }}</p>

          <div class="flex flex-wrap items-center gap-2">
            <Button variant="primary" :loading="sending" @click="onSend">
              <IconSend class="size-4" />
              {{ t('developer.send') }}
            </Button>
            <code class="min-w-0 flex-1 truncate font-mono text-mono text-fg-muted">{{ requestUrl }}</code>
          </div>
        </section>

        <!-- 响应：状态码 + 耗时 + JSON 树 -->
        <section v-if="response" class="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center gap-2">
            <Badge :tone="statusTone" dot>
              {{ response.status || t('developer.noStatus') }}
            </Badge>
            <span class="text-caption text-fg-muted">{{ response.duration }} ms</span>
            <CopyButton :value="response.raw" :label="t('developer.copyResponse')" class="ml-auto" />
          </div>
          <div class="max-h-96 overflow-auto rounded-md border border-line bg-inset p-2">
            <JsonTree :value="response.data" />
          </div>
        </section>

        <!-- 代码片段：三种语言同一份请求 -->
        <section class="grid gap-2 rounded-lg border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-label text-fg-muted">{{ t('developer.snippet') }}</p>
            <Segmented
              v-model="snippetLang"
              :items="snippetItems"
              size="sm"
              class="ml-auto"
              :aria-label="t('developer.snippetLang')"
            />
            <CopyButton :value="snippetText" :label="t('developer.copySnippet')" />
          </div>
          <Code variant="block" wrap>{{ snippetText }}</Code>
        </section>
      </div>

      <div v-else class="grid min-w-0 flex-1 place-items-center">
        <EmptyState :icon="IconTerminal" :title="t('developer.pickEndpoint')" />
      </div>
    </div>

    <AlertDialog
      v-model:open="confirmOpen"
      :title="t('developer.writeConfirm')"
      :description="t('developer.writeConfirmHint')"
      :confirm-text="t('developer.send')"
      :cancel-text="t('cancel')"
      tone="danger"
      :loading="sending"
      @confirm="send"
    />
  </div>
</template>
