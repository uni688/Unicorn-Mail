<script setup>
/**
 * 404（§7.2）
 *
 * 旧实现是一个 `el-empty` + 一句「404错误, 找不到页面」，并且在 setup 里读了一次
 * `window.innerWidth < 1025` 来决定要不要画插图 —— 那个值在窗口变化后不会更新。
 *
 * 这一版不需要断点判断：数字「404」本身就是插图，尺寸用 `clamp()` 跟着视口走。
 * 落点按登录状态分岔：登录了回收件箱，没登录回登录页（否则路由守卫会把人再弹一次）。
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import IconArrowLeft from '~icons/lucide/arrow-left'
import {Button} from '@/components/ui'

const {t} = useI18n()
const router = useRouter()

const signedIn = computed(() => Boolean(localStorage.getItem('token')))

function back() {
    router.replace(signedIn.value ? {name: 'layout'} : {name: 'login'})
}
</script>

<template>
  <main class="flex min-h-full flex-col items-center justify-center gap-6 bg-canvas px-6 py-16 text-center">
    <!-- 数字当插图：对读屏隐身，标题已经把事情说清楚了 -->
    <p
      class="select-none font-semibold leading-none tracking-tight text-fg-subtle/40 text-[clamp(4rem,18vw,9rem)]"
      aria-hidden="true"
    >
      404
    </p>

    <div class="max-w-100">
      <h1 class="text-h3 text-fg">{{ t('shell.notFoundTitle') }}</h1>
      <p class="mt-2 text-body text-fg-muted">{{ t('shell.notFoundDesc') }}</p>
    </div>

    <Button variant="primary" size="lg" @click="back">
      <template #icon>
        <IconArrowLeft class="size-4" aria-hidden="true" />
      </template>
      {{ signedIn ? t('shell.backToInbox') : t('auth.backToLogin') }}
    </Button>
  </main>
</template>
