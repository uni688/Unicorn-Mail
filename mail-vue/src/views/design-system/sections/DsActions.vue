<script setup>
/** `/_ds` — 动作类原语：Button / CopyButton / Kbd */
import IconPlus from '~icons/lucide/plus'
import IconTrash from '~icons/lucide/trash-2'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconExternal from '~icons/lucide/external-link'
import {Button, CopyButton, Kbd} from '@/components/ui'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'link']
const SIZES = ['sm', 'md', 'lg']
</script>

<template>
  <DsSection id="button" title="Button" note="5 变体 × 3 尺寸 + 2 个 icon-only 尺寸；loading 时吞掉点击而不是只变灰">
    <DsRow label="variant" note="默认 secondary：列表页里主按钮太多会失去重点">
      <Button v-for="v in VARIANTS" :key="v" :variant="v">{{ v }}</Button>
    </DsRow>

    <DsRow label="size" note="link 变体不参与尺寸阶梯（它就是一段文字）">
      <Button v-for="s in SIZES" :key="s" variant="primary" :size="s">size {{ s }}</Button>
    </DsRow>

    <DsRow label="size=icon | icon-sm" note="icon-only 必须传 label，否则读屏念不出；DEV 下会 warn">
      <Button size="icon" label="新建">
        <IconPlus />
      </Button>
      <Button size="icon-sm" label="新建">
        <IconPlus />
      </Button>
      <Button size="icon" variant="danger" label="删除">
        <IconTrash />
      </Button>
      <Button size="icon" variant="ghost" label="删除">
        <IconTrash />
      </Button>
    </DsRow>

    <DsRow label="#icon / #suffix" note="图标槽位固定在文字两侧，不用手动加间距">
      <Button variant="primary">
        <template #icon>
          <IconPlus />
        </template>
        写邮件
      </Button>
      <Button>
        更多
        <template #suffix>
          <IconChevronDown />
        </template>
      </Button>
    </DsRow>

    <DsRow label="loading" note="尺寸不跳：spinner 占位与图标同宽">
      <Button v-for="v in ['primary', 'secondary', 'danger']" :key="v" :variant="v" loading>
        保存中
      </Button>
      <Button size="icon" label="保存中" loading />
    </DsRow>

    <DsRow label="disabled">
      <Button v-for="v in VARIANTS" :key="v" :variant="v" disabled>{{ v }}</Button>
    </DsRow>

    <DsRow label="block" stack>
      <Button variant="primary" block>撑满一整行（表单提交）</Button>
      <Button block>次要动作</Button>
    </DsRow>

    <DsRow label="as='a'" note="外链用真的 <a>，右键「新标签打开」才有效">
      <Button as="a" variant="link" href="https://developers.cloudflare.com/" target="_blank" rel="noreferrer">
        Cloudflare 文档
        <template #suffix>
          <IconExternal />
        </template>
      </Button>
    </DsRow>
  </DsSection>

  <DsSection id="copybutton" title="CopyButton" note="复制成功/失败靠图标自己反馈 2 秒，不弹 toast（复制是高频动作）">
    <DsRow label="默认（icon-only）">
      <CopyButton value="um_sk_9f3c4d2e1b" />
      <CopyButton value="um_sk_9f3c4d2e1b" variant="secondary" size="icon" />
    </DsRow>

    <DsRow label="showText">
      <CopyButton value="um_sk_9f3c4d2e1b" show-text variant="secondary" size="sm" />
      <CopyButton value="um_sk_9f3c4d2e1b" show-text variant="ghost" size="md" />
    </DsRow>

    <DsRow label="空值" note="没东西可复制时仍可点，但复制的是空串 —— 由调用方负责禁用">
      <CopyButton value="" show-text variant="secondary" size="sm" />
    </DsRow>
  </DsSection>

  <DsSection id="kbd" title="Kbd" note="`Mod` 按平台渲染成 ⌘ 或 Ctrl；组合键拆成多个 <kbd>">
    <DsRow label="keys（字符串）">
      <Kbd keys="Mod+K" />
      <Kbd keys="Mod+Shift+P" />
      <Kbd keys="Esc" />
      <Kbd keys="Enter" />
      <Kbd keys="↑" />
    </DsRow>

    <DsRow label="keys（数组）">
      <Kbd :keys="['Mod', 'Enter']" />
      <Kbd :keys="['G', 'I']" />
    </DsRow>

    <DsRow label="size">
      <Kbd keys="Mod+K" size="sm" />
      <Kbd keys="Mod+K" size="md" />
    </DsRow>

    <DsRow label="行内混排" note="放在句子里不能撑高行距">
      <p class="text-body text-fg">
        按 <Kbd keys="Mod+K" /> 打开命令面板，<Kbd keys="Esc" /> 关闭。
      </p>
    </DsRow>
  </DsSection>
</template>
