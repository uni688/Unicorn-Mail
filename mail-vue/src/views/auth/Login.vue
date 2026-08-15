<script setup>
/**
 * 登录（§5.3.1）
 *
 * 从 843 行的 `views/login/index.vue` 里剥出来的第一块：只管密码登录 + OAuth 入口。
 * 注册、绑定、回调各自成页（`/register`、`/register/bind`、`/oauth/callback`）。
 *
 * 校验错误走 `Field` 的行内 error，不再一条一个 toast —— 旧实现里同时空着邮箱和密码，
 * 只会看到「邮箱不能为空」，改一个再点又弹一条，来回三次才知道要填什么。
 *
 * `?code=` 的兼容：站长在系统设置里填的 `linuxdoCallbackUrl` 很可能指向 `/login`
 * （旧版本只有这一个页面能接回调）。这里原地把 code 转交给 `/oauth/callback`，
 * 老配置不用改也能登进来。
 */
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {Button, Field, Separator} from '@/components/ui'
import {EmailInput, PasswordInput} from '@/components/composite'
import AuthLayout from '@/layouts/AuthLayout.vue'
import {checkPassword, useAuthSession, useEmailSuffix} from '@/composables/useAuth.js'
import {login} from '@/request/login.js'
import {useSettingStore} from '@/store/setting.js'

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const settingStore = useSettingStore()
const {saveToken} = useAuthSession()
const {suffix, domainOptions, hideDomain, fullEmail, checkEmail} = useEmailSuffix()

const form = reactive({email: '', password: ''})
const errors = reactive({email: '', password: ''})
const loading = ref(false)
const emailRef = ref(null)

/** `register === 0` 才开放注册入口，和旧页面的判定一致 */
const canRegister = computed(() => settingStore.settings.register === 0)
const linuxdoOn = computed(() => Boolean(settingStore.settings.linuxdoSwitch))

// 边打字边清错误：报错停在那儿不动，用户会以为改了也没用
watch(() => form.email, () => (errors.email = ''))
watch(() => form.password, () => (errors.password = ''))

if (route.query.code) {
    router.replace({name: 'oauth-callback', query: {code: route.query.code}})
}

onMounted(() => emailRef.value?.focus())

function validate() {
    const email = checkEmail(form.email)
    errors.email = email ? t(email.key, email.params ?? {}) : ''

    // 登录不查 6 位下限：历史账号的密码可能比现在的规则短
    const password = checkPassword(form.password)
    errors.password = password ? t(password.key) : ''

    return !errors.email && !errors.password
}

function submit() {
    if (!validate()) return
    loading.value = true
    login(fullEmail(form.email), form.password)
        .then((data) => saveToken(data.token))
        .finally(() => (loading.value = false))
}

/** 跳去 LinuxDo 授权页；回来时带 `?code=`，由 `/oauth/callback` 接手 */
function linuxDoLogin() {
    const clientId = settingStore.settings.linuxdoClientId
    const redirectUri = encodeURIComponent(settingStore.settings.linuxdoCallbackUrl)
    window.location.href = 'https://connect.linux.do/oauth2/authorize'
        + `?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email`
}
</script>

<template>
  <AuthLayout :title="t('loginBtn')" :description="t('loginTitle')">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Field :label="t('emailAccount')" :error="errors.email">
        <template #default="{id, describedBy, invalid}">
          <EmailInput
            :id="id"
            ref="emailRef"
            v-model="form.email"
            v-model:suffix="suffix"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :domain-options="domainOptions"
            :hide-domain="hideDomain"
            :placeholder="hideDomain ? t('emailAccount') : t('auth.emailPrefixPlaceholder')"
            :domain-label="t('auth.domainSelect')"
            autocomplete="username"
          />
        </template>
      </Field>

      <Field :label="t('password')" :error="errors.password">
        <template #default="{id, describedBy, invalid}">
          <PasswordInput
            :id="id"
            v-model="form.password"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :placeholder="t('password')"
            :show-label="t('auth.showPwd')"
            :hide-label="t('auth.hidePwd')"
            autocomplete="current-password"
          />
        </template>
      </Field>

      <Button type="submit" variant="primary" size="lg" block :loading="loading">
        {{ t('loginBtn') }}
      </Button>
    </form>

    <template v-if="linuxdoOn">
      <div class="my-5 flex items-center gap-3" role="presentation">
        <Separator class="flex-1" />
        <span class="text-caption text-fg-muted">{{ t('auth.or') }}</span>
        <Separator class="flex-1" />
      </div>

      <Button size="lg" block @click="linuxDoLogin">
        <template #icon>
          <img src="/image/linuxdo.webp" alt="" class="size-4.5 rounded-full" aria-hidden="true">
        </template>
        {{ t('auth.continueWith', {name: 'LinuxDo'}) }}
      </Button>
    </template>

    <p v-if="canRegister" class="mt-6 text-center text-label text-fg-muted">
      {{ t('noAccount') }}
      <RouterLink
        :to="{name: 'register'}"
        class="rounded-xs font-medium text-accent-fg hover:underline"
      >
        {{ t('regSwitch') }}
      </RouterLink>
    </p>
  </AuthLayout>
</template>
