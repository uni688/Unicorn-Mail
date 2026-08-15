<script setup>
/**
 * OAuth 回调 —— `/oauth/callback`（§5.3.1）
 *
 * 只做一件事：拿 `?code=` 去后端换 token。三种结果对应三种界面状态：
 * - 有 token → 直接登录进去（这一页一闪而过）
 * - 没 token（首次授权，还没绑邮箱）→ 把 `oauthUserId` 存进 sessionStorage，转 `/register/bind`
 * - 换不出来（code 过期 / 被用过 / 用户直接敲地址进来）→ 停在失败态，给一条回登录的路
 *
 * 旧实现把这段塞在登录页的 setup 里，还用 `v-loading` 把整张登录表单蒙住
 * （`login/index.vue:2` + `273-305`）—— 蒙层下面是一张能看见但点不动的表单，
 * 用户不知道自己在等什么。独立一页之后状态是明确的。
 *
 * `history.replaceState` 那一步保留：地址栏里的 `code` 已经用掉了，留着只会让人手贱刷新。
 */
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {Button, Spinner} from '@/components/ui'
import AuthLayout from '@/layouts/AuthLayout.vue'
import {setPendingOauth, useAuthSession} from '@/composables/useAuth.js'
import {oauthLinuxDoLogin} from '@/request/ouath.js'

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const {saveToken} = useAuthSession()

const failed = ref(false)

onMounted(async () => {
    const code = route.query.code
    // 地址栏里的 code 用完即弃；用 router 的 query 而不是 window.location.search，
    // 因为这一页也可能是 /login 转过来的（老配置的回调地址）
    window.history.replaceState({}, '', window.location.origin + window.location.pathname)

    if (!code) {
        failed.value = true
        return
    }

    try {
        const data = await oauthLinuxDoLogin(code)
        if (data.token) {
            await saveToken(data.token)
            return
        }
        // 首次授权：还没有对应的邮箱账号，去绑定页选一个
        setPendingOauth({oauthUserId: data.userInfo.oauthUserId, provider: 'linuxdo'})
        await router.replace({name: 'oauth-bind'})
    } catch {
        failed.value = true
    }
})
</script>

<template>
  <AuthLayout
    :title="failed ? t('auth.oauthFailedTitle') : t('auth.oauthPending')"
    :description="failed ? t('auth.oauthFailedDesc') : ''"
  >
    <div v-if="failed">
      <Button variant="primary" size="lg" block @click="router.replace({name: 'login'})">
        {{ t('auth.backToLogin') }}
      </Button>
    </div>
    <!-- 等待态：标题已经写了「正在完成登录」，这里只需要一个在转的东西 -->
    <div v-else class="flex justify-center py-2">
      <Spinner size="md" :label="t('auth.oauthPending')" />
    </div>
  </AuthLayout>
</template>
