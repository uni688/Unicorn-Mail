<script setup>
/**
 * OAuth 绑定 —— `/register/bind`（§5.3.1）
 *
 * 旧实现是登录页里的一个 `el-dialog`（`login/index.vue:109-142`）：弹窗里再嵌一个表单，
 * 移动端上弹窗、软键盘、背景滚动三者打架。改成独立步骤页之后它就是一张普通的认证卡。
 *
 * `oauthUserId` 从 sessionStorage 里取（见 `useAuth.js` 的 `setPendingOauth`），
 * 取不到说明用户是直接敲地址进来的 —— 没有可绑的授权，回登录页。
 */
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {Button, Field, Input} from '@/components/ui'
import {EmailInput} from '@/components/composite'
import AuthLayout from '@/layouts/AuthLayout.vue'
import {
    checkRegKey, clearPendingOauth, readPendingOauth, useAuthSession, useEmailSuffix,
} from '@/composables/useAuth.js'
import {oauthBindUser} from '@/request/ouath.js'
import {useSettingStore} from '@/store/setting.js'

const {t} = useI18n()
const router = useRouter()
const settingStore = useSettingStore()
const {saveToken} = useAuthSession()
const {suffix, domainOptions, hideDomain, fullEmail, checkEmail} = useEmailSuffix()

const pending = readPendingOauth()

const form = reactive({email: '', code: ''})
const errors = reactive({email: '', code: ''})
const loading = ref(false)
const emailRef = ref(null)

const regKeyMode = computed(() => settingStore.settings.regKey)
const showRegKey = computed(() => regKeyMode.value === 0 || regKeyMode.value === 2)

watch(() => form.email, () => (errors.email = ''))
watch(() => form.code, () => (errors.code = ''))

onMounted(() => {
    if (!pending) {
        router.replace({name: 'login'})
        return
    }
    emailRef.value?.focus()
})

function validate() {
    const email = checkEmail(form.email, {checkPrefixLength: true})
    errors.email = email ? t(email.key, email.params ?? {}) : ''

    const code = checkRegKey(form.code, regKeyMode.value)
    errors.code = code ? t(code.key) : ''

    return !errors.email && !errors.code
}

function submit() {
    if (!pending || !validate()) return

    loading.value = true
    oauthBindUser({
        email: fullEmail(form.email),
        oauthUserId: pending.oauthUserId,
        code: form.code,
    }).then((data) => {
        clearPendingOauth()
        return saveToken(data.token)
    }).catch(() => {
        loading.value = false
    })
}
</script>

<template>
  <AuthLayout :title="t('auth.bindTitle')" :description="t('auth.bindDesc')">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Field :label="t('emailAccount')" :error="errors.email" required>
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

      <Field
        v-if="showRegKey"
        :label="t('regKey')"
        :error="errors.code"
        :required="regKeyMode === 0"
        :optional="regKeyMode === 2"
      >
        <template #default="{id, describedBy, invalid}">
          <Input
            :id="id"
            v-model="form.code"
            :aria-describedby="describedBy"
            :invalid="invalid"
            size="lg"
            :placeholder="t('regKey')"
            autocomplete="off"
          />
        </template>
      </Field>

      <Button type="submit" variant="primary" size="lg" block :loading="loading">
        {{ t('auth.bindBtn') }}
      </Button>
    </form>

    <p class="mt-6 text-center text-label">
      <RouterLink
        :to="{name: 'login'}"
        class="rounded-xs text-fg-muted hover:text-fg hover:underline"
      >
        {{ t('auth.backToLogin') }}
      </RouterLink>
    </p>
  </AuthLayout>
</template>
