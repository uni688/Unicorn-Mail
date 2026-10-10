<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { cleanInlineStyle, sanitizeEmailHtml } from '@/utils/mail-sanitize.js'

/**
 * P4 验收时实测的存储型 XSS：这里原来把邮件 HTML 原样写进 `shadowRoot.innerHTML`。
 * Shadow DOM 只隔离样式、不隔离行为 —— `<img src=x onerror=…>` 照样在站长的页面里执行
 * （「全部邮件」点开任意一封就会走到这里），而登录 token 就在 localStorage 里。
 *
 * 两处输入都要处理：
 *   1. 正文走 `sanitizeEmailHtml()`（与新阅读窗格同一个白名单净化器）。这个旧页面没有
 *      「显示图片」按钮，所以 `allowRemote: true` 维持原来「直接显示远程图片」的行为 ——
 *      放行的只是图片地址，事件处理器 / script / iframe 一律删掉。
 *   2. `<body style="…">` 被单独抠出来塞进 `<style>` 块：不过滤的话
 *      `color:red}</style><img onerror=…>` 就能跳出样式表。这里只保留声明列表需要的字符。
 * 这个页面会在 P6 随旧正文页一起删掉；在那之前它不能是一个洞。
 */
function safeBodyStyle(raw) {
  // 先去掉能跳出声明块 / 样式表的字符，再走与正文同一套 CSS 清洗（position:fixed、@import…）
  return cleanInlineStyle(String(raw ?? '').replace(/[^\w\s#%.,:;()'"\-/]/g, ''), {allowRemote: true})
}

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return;

  // 1. 提取 <body> 的 style 属性（如果存在）
  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
  const bodyStyleMatch = props.html.match(bodyStyleRegex);
  const bodyStyle = bodyStyleMatch ? safeBodyStyle(bodyStyleMatch[1]) : '';

  // 2. 移除 <body> 标签（保留内容），再整体过一遍白名单净化
  const cleanedHtml = sanitizeEmailHtml(props.html.replace(/<\/?body[^>]*>/gi, ''), {allowRemote: true}).html;

  // 3. 将 body 的 style 应用到 .shadow-content
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: -apple-system, Inter, BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: #FFFFFF;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
        ${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

    </style>
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, Inter, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
