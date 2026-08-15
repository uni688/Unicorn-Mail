<script setup>
/**
 * 注册（§5.3.1）
 *
 * 与旧实现（`views/login/index.vue` 的 `show === 'register'` 分支）相比多三样，都是 §5.3.1 点名的：
 * - **密码强度条**：判定在 `passwordStrength()`，只提示不拦截（拦截规则归后端）
 * - **邀请码显式标注必填 / 选填**：旧代码只靠 placeholder 区分 `regKey === 0` 与 `=== 2`
 * - **Turnstile 容器预留 65px**：旧代码 `v-show` 一切换整块表单往下跳一截
 *
 * 卡片高度上限与内滚由 `AuthLayout` 提供（整页滚会把背景图一起拖走，玻璃就没了）。
 */
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {Button, Field, Input, Meter, Separator, toast} from '@/components/ui'
import {EmailInput, PasswordInput} from '@/components/composite'
import AuthLayout from '@/layouts/AuthLayout.vue'
import {
    PASSWORD_MIN, checkConfirmPassword, checkPassword, checkRegKey, passwordStrength, useEmailSuffix,
} from '@/composables/useAuth.js'
import {useTurnstile} from '@/composables/useTurnstile.js'
import {useTheme} from '@/composables/useTheme.js'
import {register} from '@/request/login.js'
import {useSettingStore} from '@/store/setting.js'

const {t} = useI18n()
const router = useRouter()
const settingStore = useSettingStore()
const {isDark} = useTheme()
const {suffix, domainOptions, hideDomain, fullEmail, checkEmail} = useEmailSuffix()

const form = reactive({email: '', password: '', confirmPassword: '', code: ''})
const errors = reactive({email: '', password: '', confirmPassword: '', code: ''})
const loading = ref(false)
const emailRef = ref(null)

const {
    container: verifyContainer, visible: verifyVisible, scriptError: verifyScriptError,
    token: verifyToken, show: verifyShow, reset: verifyReset, teardown: verifyTeardown,
} = useTurnstile({
    sitekey: () => settingStore.settings.siteKey,
    theme: () => (isDark.value ? 'dark' : 'light'),
})

/** 0 = 必填、2 = 可选、其余不出现这个字段 */
const regKeyMode = computed(() => settingStore.settings.regKey)
const showRegKey = computed(() => regKeyMode.value === 0 || regKeyMode.value === 2)

/** 站长强制验证（0），或按 IP 规则触发后由后端把 `regVerifyOpen` 打开（2） */
const verifyRequired = computed(() => {
    const mode = settingStore.settings.registerVerify
    return mode === 0 || (mode === 2 && Boolean(settingStore.settings.regVerifyOpen))
})

const strength = computed(() => passwordStrength(form.password))
const linuxdoOn = computed(() => Boolean(settingStore.settings.linuxdoSwitch))

watch(() => form.email, () => (errors.email = ''))
watch(() => form.password, () => (errors.password = ''))
watch(() => form.confirmPassword, () => (errors.confirmPassword = ''))
watch(() => form.code, () => (errors.code = ''))

onMounted(() => emailRef.value?.focus())

function validate() {
    const email = checkEmail(form.email, {checkPrefixLength: true})
    errors.email = email ? t(email.key, email.params ?? {}) : ''

    const password = checkPassword(form.password, {minLength: PASSWORD_MIN})
    errors.password = password ? t(password.key) : ''

    const confirm = password ? null : checkConfirmPassword(form.password, form.confirmPassword)
    errors.confirmPassword = confirm ? t(confirm.key) : ''

    const code = checkRegKey(form.code, regKeyMode.value)
    errors.code = code ? t(code.key) : ''

    return !errors.email && !errors.password && !errors.confirmPassword && !errors.code
}

/**
 * 人机验证闸门。第一次提交时才把 widget 挂出来（和旧实现一样，避免所有人都白等一个 iframe）；
 * 挂出来了但还没过，就提示一句 —— 除非脚本本身没加载出来，那时提示「请完成验证」是误导。
 * @returns {boolean} true = 可以提交
 */
function passedVerify() {
    if (verifyToken.value || !verifyRequired.value) return true
    if (!verifyVisible.value) verifyShow()
    else if (!verifyScriptError.value) toast.error(t('botVerifyMsg'))
    return false
}

function submit() {
    if (!validate()) return
    if (!passedVerify()) return

    loading.value = true
    register({
        email: fullEmail(form.email),
        password: form.password,
        token: verifyToken.value,
        code: form.code,
    }).then(({regVerifyOpen}) => {
        settingStore.settings.regVerifyOpen = regVerifyOpen
        verifyTeardown()
        toast.success(t('regSuccessMsg'))
        router.replace({name: 'login'})
    }).catch((res) => {
        // 400 = token 无效/被用过：后端顺手把验证要求打开，这里重挂一次 widget
        if (res?.code === 400) {
            settingStore.settings.regVerifyOpen = true
            verifyReset()
        }
    }).finally(() => (loading.value = false))
}

function linuxDoLogin() {
    const clientId = settingStore.settings.linuxdoClientId
    const redirectUri = encodeURIComponent(settingStore.settings.linuxdoCallbackUrl)
    window.location.href = 'https://connect.linux.do/oauth2/authorize'
        + `?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email`
}
</script>

<template>
  <AuthLayout :title="t('regBtn')" :description="t('regTitle')">
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

      <Field :label="t('password')" :error="errors.password" required>
        <template #default="{id, describedBy, invalid}">
          <PasswordInput
            :id="id"
            v-model="form.password"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :placeholder="t('password')"
            :show-label="t('auth.showPwd')"
            :hide-label="t('auth.hidePwd')"
            autocomplete="new-password"
          />
          <!-- 强度条只在有内容时出现；文字对读屏隐身，语义已在 Meter 的 valueText 里 -->
          <div v-if="form.password" class="mt-1 flex items-center gap-2">
            <Meter
              :value="strength.score"
              :max="4"
              :tone="strength.tone"
              size="sm"
              :label="t('auth.pwdStrength')"
              :value-text="t(strength.labelKey)"
              class="flex-1"
            />
            <span class="shrink-0 text-caption text-fg-muted" aria-hidden="true">
              {{ t(strength.labelKey) }}
            </span>
          </div>
        </template>
      </Field>

      <Field :label="t('confirmPwd')" :error="errors.confirmPassword" required>
        <template #default="{id, describedBy, invalid}">
          <PasswordInput
            :id="id"
            v-model="form.confirmPassword"
            :aria-describedby="describedBy"
            :invalid="invalid"
            :placeholder="t('confirmPwd')"
            :show-label="t('auth.showPwd')"
            :hide-label="t('auth.hidePwd')"
            autocomplete="new-password"
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

      <!-- 预留 65px：Turnstile 的 widget 就是这个高度，先占位后加载才不会把按钮顶下去 -->
      <div v-show="verifyVisible" class="min-h-[65px]">
        <div ref="verifyContainer" />
        <p v-if="verifyScriptError" class="text-caption text-danger-fg">
          {{ t('verifyModuleFailed') }}
        </p>
      </div>

      <Button type="submit" variant="primary" size="lg" block :loading="loading">
        {{ t('regBtn') }}
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

    <p class="mt-6 text-center text-label text-fg-muted">
      {{ t('hasAccount') }}
      <RouterLink
        :to="{name: 'login'}"
        class="rounded-xs font-medium text-accent-fg hover:underline"
      >
        {{ t('loginSwitch') }}
      </RouterLink>
    </p>
  </AuthLayout>
</template>
