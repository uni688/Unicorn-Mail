<script setup>
/** `/_ds` — 展示类原语：Avatar / Badge / Code / Separator / Skeleton / Spinner / Progress / Meter */
import IconCheck from '~icons/lucide/check'
import IconShield from '~icons/lucide/shield'
import {Avatar, Badge, Code, Meter, Progress, Separator, Skeleton, Spinner} from '@/components/ui'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const TONES = ['neutral', 'accent', 'success', 'warning', 'danger', 'info']
const AVATAR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl']
</script>

<template>
  <DsSection id="avatar" title="Avatar" note="没有头像图时按名字取首字母 + 稳定色，同一个人每次进来颜色一致">
    <DsRow label="size">
      <Avatar v-for="s in AVATAR_SIZES" :key="s" :size="s" name="张三丰" />
    </DsRow>

    <DsRow label="name → 首字母与配色" note="中文取首字，英文/邮箱取首字母">
      <Avatar name="张三丰" />
      <Avatar name="Ada Lovelace" />
      <Avatar name="admin@unicorn.mail" />
      <Avatar name="" />
    </DsRow>

    <DsRow label="tone（覆盖自动配色）">
      <Avatar v-for="t in TONES" :key="t" :tone="t" name="U" />
    </DsRow>

    <DsRow label="shape">
      <Avatar name="Ada" shape="circle" />
      <Avatar name="Ada" shape="rounded" />
    </DsRow>

    <DsRow label="status" note="statusLabel 不给就是纯装饰，读屏跳过">
      <Avatar name="在线" status="online" status-label="在线" />
      <Avatar name="忙" status="busy" status-label="忙碌" />
      <Avatar name="离线" status="offline" status-label="离线" />
      <Avatar name="大" size="lg" status="online" status-label="在线" />
    </DsRow>

    <DsRow label="src 失效时回退" note="故意给一个 404 地址：应该退回首字母而不是留一个碎图标">
      <Avatar src="/__not-exist__.png" name="Fallback" />
      <Avatar src="/__not-exist__.png" name="延迟 300ms" :delay-ms="300" />
    </DsRow>

    <DsRow label="#fallback">
      <Avatar name="Shield" tone="info">
        <template #fallback>
          <IconShield class="size-4" />
        </template>
      </Avatar>
    </DsRow>
  </DsSection>

  <DsSection id="badge" title="Badge" note="默认 subtle：列表里 solid 徽章一多就变成圣诞树">
    <DsRow label="appearance × tone">
      <div v-for="a in ['solid', 'subtle', 'outline']" :key="a" class="flex flex-wrap items-center gap-2">
        <Badge v-for="t in TONES" :key="t" :tone="t" :appearance="a">{{ t }}</Badge>
      </div>
    </DsRow>

    <DsRow label="size">
      <Badge size="sm">sm</Badge>
      <Badge size="md">md</Badge>
    </DsRow>

    <DsRow label="dot" note="状态点比纯文字更快被扫到">
      <Badge tone="success" dot>已投递</Badge>
      <Badge tone="warning" dot>待重试</Badge>
      <Badge tone="danger" dot appearance="outline">已拒收</Badge>
    </DsRow>

    <DsRow label="#icon">
      <Badge tone="success" appearance="subtle">
        <template #icon>
          <IconCheck />
        </template>
        已验证
      </Badge>
    </DsRow>

    <DsRow label="数字徽章" note="tabular-nums：99 → 100 时宽度不抖">
      <Badge tone="accent" appearance="solid" size="sm">9</Badge>
      <Badge tone="accent" appearance="solid" size="sm">99</Badge>
      <Badge tone="accent" appearance="solid" size="sm">99+</Badge>
    </DsRow>
  </DsSection>

  <DsSection id="code" title="Code" note="等宽字号单独定过（12.5px），和正文 14px 混排时视觉重量才一致">
    <DsRow label="variant=inline">
      <p class="text-body text-fg">
        密钥形如 <Code>um_sk_9f3c4d2e</Code>，请求头是 <Code>Authorization</Code>。
      </p>
    </DsRow>

    <DsRow label="variant=block" stack>
      <Code variant="block">{{ 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.unicorn.mail/v1/mail' }}</Code>
    </DsRow>

    <DsRow label="wrap" note="长行默认横向滚动；wrap 让它软换行（正文里嵌一段命令时用）" stack>
      <Code variant="block" wrap>
        {{ 'wrangler d1 execute unicorn-mail --remote --command "select count(*) from email where user_id = 1 and status = 0"' }}
      </Code>
    </DsRow>
  </DsSection>

  <DsSection id="separator" title="Separator" note="默认 decorative（读屏跳过）；真的用来分隔语义段落时关掉它">
    <DsRow label="orientation=horizontal" stack>
      <div>
        <p class="text-body">上面</p>
        <Separator class="my-2" />
        <p class="text-body">下面</p>
      </div>
      <div>
        <p class="text-caption text-fg-muted">strong（工具条与内容之间）</p>
        <Separator strong class="my-2" />
      </div>
    </DsRow>

    <DsRow label="orientation=vertical" note="必须有确定高度，否则 0 高看不见">
      <div class="flex h-6 items-center gap-3">
        <span class="text-caption">收件箱</span>
        <Separator orientation="vertical" />
        <span class="text-caption">草稿</span>
        <Separator orientation="vertical" strong />
        <span class="text-caption">已发送</span>
      </div>
    </DsRow>
  </DsSection>

  <DsSection id="skeleton" title="Skeleton" note="骨架的形状要贴近真实内容，否则加载完会「跳版」">
    <DsRow label="variant=text × lines" note="最后一行短一截，模拟自然段落" stack>
      <Skeleton />
      <Skeleton :lines="3" />
    </DsRow>

    <DsRow label="variant=rect / circle">
      <Skeleton variant="circle" width="40px" height="40px" />
      <Skeleton variant="rect" width="120px" height="40px" />
      <Skeleton variant="rect" width="60%" height="88px" />
    </DsRow>

    <DsRow label="邮件行骨架" note="真实用法：和 --um-row-h 对齐" stack>
      <div v-for="i in 3" :key="i" class="flex items-center gap-3">
        <Skeleton variant="circle" width="32px" height="32px" />
        <div class="min-w-0 flex-1">
          <Skeleton width="30%" />
          <Skeleton class="mt-1.5" width="70%" />
        </div>
        <Skeleton width="48px" />
      </div>
    </DsRow>
  </DsSection>

  <DsSection id="spinner" title="Spinner" note="label 留空 = 纯装饰；独立出现（不在按钮里）时必须给 label">
    <DsRow label="size">
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </DsRow>

    <DsRow label="label" note="读屏会播报「加载中」">
      <Spinner size="md" label="加载中" />
      <span class="text-caption text-fg-muted">正在拉取邮件…</span>
    </DsRow>
  </DsSection>

  <DsSection id="progress" title="Progress" note="有确定进度用 Progress；null = 不确定（跑马灯）">
    <DsRow label="modelValue × tone" stack>
      <Progress v-for="(t, i) in ['accent', 'success', 'warning', 'danger', 'info']" :key="t" :model-value="(i + 1) * 18" :tone="t" :label="`${t} 进度`" />
    </DsRow>

    <DsRow label="size" stack>
      <Progress :model-value="40" size="xs" label="xs" />
      <Progress :model-value="40" size="sm" label="sm" />
      <Progress :model-value="40" size="md" label="md" />
    </DsRow>

    <DsRow label="不确定进度" note="modelValue=null：不知道总量时（如首次同步）" stack>
      <Progress :model-value="null" label="同步中" />
    </DsRow>
  </DsSection>

  <DsSection id="meter" title="Meter" note="Meter 是「静态量」（配额、容量），不是「进度」；tone=auto 会随水位变色">
    <DsRow label="tone=auto" note="≥75% 转 warning，≥90% 转 danger" stack>
      <Meter :value="30" :max="100" label="存储用量" value-text="已用 30 / 100 GB" />
      <Meter :value="80" :max="100" label="存储用量" value-text="已用 80 / 100 GB" />
      <Meter :value="96" :max="100" label="存储用量" value-text="已用 96 / 100 GB" />
    </DsRow>

    <DsRow label="size" stack>
      <Meter :value="45" size="xs" label="xs" />
      <Meter :value="45" size="sm" label="sm" />
      <Meter :value="45" size="md" label="md" />
    </DsRow>

    <DsRow label="非 0-100 区间" note="min/max 任意；valueText 决定读屏播报的人话" stack>
      <Meter :value="3" :min="0" :max="50" tone="accent" label="今日发信" value-text="已发 3 / 50 封" />
    </DsRow>
  </DsSection>
</template>
