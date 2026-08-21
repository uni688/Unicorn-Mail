<script setup>
/**
 * MailBody — 邮件正文的 Shadow DOM 宿主（§7.6）
 *
 * 只做两件事：把净化后的 HTML 塞进 shadow root，并给它一套**固定的浅色**基础样式。
 *
 * 为什么固定浅色：§7.6「不做暗色反转」。邮件的配色是发件人定的，反转会把品牌色搅成
 * 一团（深色底 + 深色字），而且这类邮件的图片本身就是浅底的。所以正文永远是白纸，
 * 由外面的容器（`rounded-lg border`）把它和暗色界面隔开。
 *
 * `all: initial` 是 host 级别的隔离：站点的 Tailwind preflight 与 CSS 变量都进不来，
 * 邮件里的 `p {margin: 0}` 之类也出不去。
 */
import {onMounted, ref, watch} from 'vue'

const props = defineProps({
    /** 已经过 `sanitizeEmailHtml()` 的 HTML —— 这里不做任何净化 */
    html: {type: String, default: ''},
})

const emit = defineEmits(['link-click'])

const host = ref(null)
let shadow = null

const BASE_CSS = `
:host {
  all: initial;
  display: block;
  font-family: -apple-system, Inter, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #13181D;
  background: #FFFFFF;
  word-break: break-word;
}
.body { padding: 16px; }
p { margin: 0 0 8px; }
h1, h2, h3, h4 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
a { color: #0E70DF; text-decoration: underline; }
img { max-width: 100%; height: auto; }
table { max-width: 100%; }
blockquote {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid #E3E8EF;
  color: #4B5565;
}
pre { white-space: pre-wrap; word-break: break-word; }
/* 被拦下的远程图片：留一个占位框，不然「已屏蔽 N 张图片」在正文里看不出位置 */
img[data-blocked-src] {
  min-width: 24px;
  min-height: 24px;
  background: repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 6px, #E3E8EF 6px, #E3E8EF 12px);
  border: 1px dashed #CDD5DF;
}
`

function render() {
    if (!shadow) return
    shadow.innerHTML = `<style>${BASE_CSS}</style><div class="body">${props.html}</div>`
}

/**
 * 链接一律交给外面处理：`target=_blank` 已经由净化器加上，但点击事件在 shadow 里
 * 不会冒泡出**组件**的 click 处理（会冒泡出 shadow root，composed 事件仍可捕获），
 * 所以这里显式转发，宿主要做「外链确认」之类的事就有钩子。
 */
function onClick(event) {
    const link = event.composedPath().find((node) => node?.tagName === 'A')
    if (link) emit('link-click', link.getAttribute('href'), event)
}

onMounted(() => {
    shadow = host.value.attachShadow({mode: 'open'})
    render()
})

watch(() => props.html, render)
</script>

<template>
  <div ref="host" @click="onClick" />
</template>
