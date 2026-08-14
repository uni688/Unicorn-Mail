<script setup>
/**
 * CopyButton — L1 原语（§4.11）
 *
 * - 成功后 1.6s 内换成 ✓ 与「已复制」，图标变化之外还有 aria-live 播报，
 *   否则只换图标对读屏用户等于什么都没发生（§4.10）
 * - 优先 `navigator.clipboard`；非安全上下文（http 局域网调试）退回 execCommand，
 *   两条路都失败就报错态，不静默失败
 * - 文案走 useUiText()，未注册 i18n 时用内置中文兜底
 */
import {onBeforeUnmount, ref} from 'vue'
import IconCopy from '~icons/lucide/copy'
import IconCheck from '~icons/lucide/check'
import {Button} from '../Button/index.js'
import {useUiText} from '../_shared/useUiText.js'

const props = defineProps({
    /** 要复制的文本 */
    value: {type: String, default: ''},
    /** @type {'primary'|'secondary'|'ghost'|'danger'|'link'} */
    variant: {type: String, default: 'ghost'},
    /** @type {'sm'|'md'|'lg'|'icon'|'icon-sm'} */
    size: {type: String, default: 'icon-sm'},
    /** 显示文字（默认只有图标） */
    showText: {type: Boolean, default: false},
    /** 覆盖无障碍名称 */
    label: {type: String, default: ''},
    class: {type: [String, Array, Object], default: undefined},
})

const emit = defineEmits(['copy'])
const t = useUiText()

/** @type {import('vue').Ref<'idle'|'copied'|'error'>} */
const state = ref('idle')
let timer = null

function flash(next) {
    state.value = next
    clearTimeout(timer)
    timer = setTimeout(() => (state.value = 'idle'), 1600)
}

async function write(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch {
            // 权限被拒或非安全上下文，落到下面的兜底
        }
    }
    // execCommand 已废弃但仍是 http 页面唯一可用的路径
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    let ok
    try {
        ok = document.execCommand('copy')
    } catch {
        ok = false
    }
    ta.remove()
    return ok
}

async function onClick() {
    const ok = await write(props.value ?? '')
    flash(ok ? 'copied' : 'error')
    emit('copy', ok)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Button
    :variant="variant"
    :size="size"
    :label="label || t(state === 'copied' ? 'copied' : 'copy')"
    :class="props.class"
    @click="onClick"
  >
    <template #icon>
      <IconCheck v-if="state === 'copied'" class="size-3.5 shrink-0 text-success" aria-hidden="true" />
      <IconCopy v-else class="size-3.5 shrink-0" aria-hidden="true" />
    </template>
    <template v-if="showText">
      {{ state === 'copied' ? t('copied') : t('copy') }}
    </template>
    <!-- 单独的播报区：图标切换本身对读屏是静默的 -->
    <span class="sr-only" role="status" aria-live="polite">
      {{ state === 'copied' ? t('copied') : state === 'error' ? t('copyFailed') : '' }}
    </span>
  </Button>
</template>
