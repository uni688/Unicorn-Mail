<script setup>
/** `/_ds` — 表单类原语：Field / Input / Textarea / NumberInput / Checkbox / Radio / Switch / Select / Combobox / TagsInput / Segmented / DatePicker */
import {ref} from 'vue'
import IconSearch from '~icons/lucide/search'
import IconAt from '~icons/lucide/at-sign'
import IconList from '~icons/lucide/list'
import IconGrid from '~icons/lucide/layout-grid'
import IconRows from '~icons/lucide/rows-3'
import IconBold from '~icons/lucide/bold'
import IconItalic from '~icons/lucide/italic'
import IconUnderline from '~icons/lucide/underline'
import {
    Checkbox, Combobox, DatePicker, Field, Input, NumberInput, RadioGroup,
    Segmented, Select, Switch, TagsInput, Textarea,
} from '@/components/ui'
import DsSection from '../DsSection.vue'
import DsRow from '../DsRow.vue'

const SIZES = ['sm', 'md', 'lg']

const text = ref('hello@unicorn.mail')
const clearable = ref('点右侧 × 清空')
const search = ref('')
const area = ref('第一行\n第二行')
const autosize = ref('输入更多内容，这个框会自己长高')
const num = ref(5)
const checked = ref(true)
const partial = ref('indeterminate')
const radio = ref('all')
const enabled = ref(true)
const single = ref('inbox')
const multi = ref(['inbox', 'sent'])
const combo = ref(undefined)
const comboMulti = ref([])
const tags = ref(['spam', 'promo'])
const view = ref('list')
const marks = ref(['bold'])
const day = ref('2026-08-12')
const period = ref({start: '2026-08-10', end: '2026-08-16'})

const FOLDERS = [
    {label: '收件箱', value: 'inbox'},
    {label: '已发送', value: 'sent'},
    {label: '草稿', value: 'draft'},
    {label: '垃圾箱（禁用）', value: 'trash', disabled: true},
]

const GROUPED = [
    {label: '系统文件夹', options: FOLDERS.slice(0, 3)},
    {label: '自定义', options: [{label: '账单', value: 'bill'}, {label: '订阅', value: 'sub'}]},
]

const RADIO_OPTIONS = [
    {label: '全部邮件', value: 'all', hint: '包含垃圾箱'},
    {label: '仅未读', value: 'unread'},
    {label: '仅星标', value: 'starred'},
    {label: '仅附件（暂不可用）', value: 'attachment', disabled: true},
]

const VIEWS = [
    {label: '列表', value: 'list', icon: IconList},
    {label: '紧凑', value: 'rows', icon: IconRows},
    {label: '卡片', value: 'grid', icon: IconGrid},
]

const MARKS = [
    {label: '加粗', value: 'bold', icon: IconBold},
    {label: '斜体', value: 'italic', icon: IconItalic},
    {label: '下划线', value: 'underline', icon: IconUnderline},
]
</script>

<template>
  <DsSection id="field" title="Field" note="唯一负责「标签 ↔ 控件 ↔ 错误」三者 id 关联的组件；控件从插槽拿 id / describedBy">
    <DsRow label="label + hint" stack>
      <Field v-slot="{id, describedBy}" label="邮箱地址" hint="登录名，创建后不可修改">
        <Input :id="id" v-model="text" :aria-describedby="describedBy" />
      </Field>
    </DsRow>

    <DsRow label="required / optional" note="二者互斥；required 的 * 对读屏念作「必填」" stack>
      <Field v-slot="{id}" label="邮箱地址" required>
        <Input :id="id" v-model="text" />
      </Field>
      <Field v-slot="{id}" label="备注" optional>
        <Input :id="id" placeholder="可以不填" />
      </Field>
    </DsRow>

    <DsRow label="error" note="error 有值即错误态；aria-live 保证读屏当场播报" stack>
      <Field v-slot="{id, describedBy, invalid}" label="邮箱地址" error="该地址已被占用">
        <Input :id="id" v-model="text" :invalid="invalid" :aria-describedby="describedBy" />
      </Field>
    </DsRow>

    <DsRow label="hideLabel" note="列表页的紧凑筛选器：视觉无标签，读屏仍有名字" stack>
      <Field v-slot="{id}" label="搜索邮件" hide-label>
        <Input :id="id" v-model="search" type="search" placeholder="搜索邮件">
          <template #prefix>
            <IconSearch />
          </template>
        </Input>
      </Field>
    </DsRow>
  </DsSection>

  <DsSection id="input" title="Input" note="3 个尺寸共用 control.variants；invalid 只改边框不改布局，避免错误出现时行高跳动">
    <DsRow label="size" stack>
      <Input v-for="s in SIZES" :key="s" :size="s" :placeholder="`size ${s}`" aria-label="尺寸示例" />
    </DsRow>

    <DsRow label="type" stack>
      <Input v-model="text" type="email" aria-label="邮箱" />
      <Input type="password" value="secret" aria-label="密码" />
      <Input v-model="search" type="search" placeholder="搜索" aria-label="搜索" />
    </DsRow>

    <DsRow label="#prefix / #suffix" stack>
      <Input v-model="search" placeholder="搜索邮件" aria-label="搜索邮件">
        <template #prefix>
          <IconSearch />
        </template>
      </Input>
      <Input value="unicorn" aria-label="用户名">
        <template #suffix>
          <IconAt />
        </template>
      </Input>
    </DsRow>

    <DsRow label="clearable" note="清除按钮是输入框的兄弟节点，不是嵌套 button" stack>
      <Input v-model="clearable" clearable aria-label="可清除" />
    </DsRow>

    <DsRow label="状态" stack>
      <Input value="disabled" disabled aria-label="禁用" />
      <Input value="readonly（可选中复制）" readonly aria-label="只读" />
      <Input value="invalid" invalid aria-label="错误" />
    </DsRow>
  </DsSection>

  <DsSection id="textarea" title="Textarea" note="autosize 到 maxRows 就转内部滚动，不会把页面撑到无限长">
    <DsRow label="size × rows" stack>
      <Textarea v-for="s in SIZES" :key="s" :size="s" :rows="2" :placeholder="`size ${s}`" aria-label="尺寸示例" />
    </DsRow>

    <DsRow label="modelValue" stack>
      <Textarea v-model="area" aria-label="多行文本" />
    </DsRow>

    <DsRow label="autosize" note="maxRows 默认 12" stack>
      <Textarea v-model="autosize" autosize :max-rows="6" aria-label="自动高度" />
    </DsRow>

    <DsRow label="状态" stack>
      <Textarea value="disabled" disabled :rows="2" aria-label="禁用" />
      <Textarea value="invalid" invalid :rows="2" aria-label="错误" />
    </DsRow>
  </DsSection>

  <DsSection id="numberinput" title="NumberInput" note="加减按钮是真按钮（可 Tab 到）；越界时按钮自己禁用而不是让用户点了没反应">
    <DsRow label="size" stack>
      <NumberInput v-for="s in SIZES" :key="s" v-model="num" :size="s" :aria-label="`size ${s}`" />
    </DsRow>

    <DsRow label="min / max / step" note="0..10，步长 2" stack>
      <NumberInput v-model="num" :min="0" :max="10" :step="2" aria-label="步长 2" />
    </DsRow>

    <DsRow label="状态" stack>
      <NumberInput :model-value="5" disabled aria-label="禁用" />
      <NumberInput :model-value="5" invalid aria-label="错误" />
      <NumberInput placeholder="不限" aria-label="空值" />
    </DsRow>
  </DsSection>

  <DsSection id="checkbox" title="Checkbox" note="支持 'indeterminate'：列表全选框「部分选中」的唯一正确表示">
    <DsRow label="modelValue" stack>
      <Checkbox v-model="checked" label="记住这台设备" />
      <Checkbox :model-value="false" label="未选中" />
      <Checkbox v-model="partial" label="部分选中（indeterminate）" />
    </DsRow>

    <DsRow label="hint" note="说明文字挂在 aria-describedby 上" stack>
      <Checkbox v-model="checked" label="转发副本到备用邮箱" hint="仅转发正文，不含附件" />
    </DsRow>

    <DsRow label="size">
      <Checkbox :model-value="true" size="sm" label="sm" />
      <Checkbox :model-value="true" size="md" label="md" />
    </DsRow>

    <DsRow label="状态" stack>
      <Checkbox :model-value="true" disabled label="禁用（已选）" />
      <Checkbox :model-value="false" disabled label="禁用（未选）" />
      <Checkbox :model-value="false" invalid label="必须勾选才能继续" />
    </DsRow>
  </DsSection>

  <DsSection id="radio" title="RadioGroup / Radio" note="互斥选项才用它；超过 5 项改用 Select，否则表单会被撑得很长">
    <DsRow label="options（竖排）" stack>
      <RadioGroup v-model="radio" :options="RADIO_OPTIONS" aria-label="筛选范围" />
    </DsRow>

    <DsRow label="orientation=horizontal">
      <RadioGroup v-model="radio" :options="RADIO_OPTIONS.slice(0, 3)" orientation="horizontal" aria-label="筛选范围（横排）" />
    </DsRow>

    <DsRow label="size">
      <RadioGroup :model-value="'a'" size="sm" orientation="horizontal" aria-label="sm" :options="[{label: 'sm 甲', value: 'a'}, {label: 'sm 乙', value: 'b'}]" />
      <RadioGroup :model-value="'a'" size="md" orientation="horizontal" aria-label="md" :options="[{label: 'md 甲', value: 'a'}, {label: 'md 乙', value: 'b'}]" />
    </DsRow>

    <DsRow label="disabled（整组）" stack>
      <RadioGroup :model-value="'all'" :options="RADIO_OPTIONS.slice(0, 2)" disabled aria-label="整组禁用" />
    </DsRow>
  </DsSection>

  <DsSection id="switch" title="Switch" note="Switch 是「立即生效」的开关，不需要保存按钮；需要提交才生效的用 Checkbox">
    <DsRow label="modelValue" stack>
      <Switch v-model="enabled" label="开启邮件通知" />
      <Switch :model-value="false" label="关闭态" />
    </DsRow>

    <DsRow label="hint" stack>
      <Switch v-model="enabled" label="自动清理垃圾箱" hint="每 30 天清空一次，不可恢复" />
    </DsRow>

    <DsRow label="size">
      <Switch :model-value="true" size="sm" label="sm" />
      <Switch :model-value="true" size="md" label="md" />
    </DsRow>

    <DsRow label="loading / disabled" note="loading 保留焦点但吞掉交互：正在写库时不能让用户连点" stack>
      <Switch :model-value="true" loading label="保存中…" />
      <Switch :model-value="true" disabled label="禁用（开）" />
      <Switch :model-value="false" disabled label="禁用（关）" />
    </DsRow>
  </DsSection>

  <DsSection id="select" title="Select" note="值来自固定列表、不需要搜索时用 Select；需要搜索或自由输入用 Combobox">
    <DsRow label="size" stack>
      <Select v-for="s in SIZES" :key="s" v-model="single" :options="FOLDERS" :size="s" :aria-label="`size ${s}`" />
    </DsRow>

    <DsRow label="options 分组" stack>
      <Select v-model="single" :options="GROUPED" aria-label="分组选项" />
    </DsRow>

    <DsRow label="multiple" note="触发器显示「已选 n 项」，避免长文案把控件挤爆" stack>
      <Select v-model="multi" :options="FOLDERS" multiple aria-label="多选文件夹" />
    </DsRow>

    <DsRow label="状态" stack>
      <Select :options="FOLDERS" placeholder="请选择文件夹" aria-label="空值" />
      <Select :model-value="'inbox'" :options="FOLDERS" disabled aria-label="禁用" />
      <Select :model-value="undefined" :options="FOLDERS" invalid placeholder="必选" aria-label="错误" />
    </DsRow>
  </DsSection>

  <DsSection id="combobox" title="Combobox" note="内置过滤用 Intl.Collator（大小写/音标不敏感）；服务端搜索时打开 ignoreFilter 自己过滤">
    <DsRow label="单选 + 搜索" stack>
      <Combobox v-model="combo" :options="FOLDERS" placeholder="搜索文件夹" aria-label="搜索文件夹" />
    </DsRow>

    <DsRow label="options 分组" stack>
      <Combobox v-model="combo" :options="GROUPED" placeholder="搜索" aria-label="分组搜索" />
    </DsRow>

    <DsRow label="multiple" stack>
      <Combobox v-model="comboMulti" :options="FOLDERS" multiple placeholder="可多选" aria-label="多选搜索" />
    </DsRow>

    <DsRow label="状态" stack>
      <Combobox :options="FOLDERS" disabled placeholder="禁用" aria-label="禁用" />
      <Combobox :options="FOLDERS" invalid placeholder="错误态" aria-label="错误" />
      <Combobox :options="[]" empty-text="没有匹配的文件夹" placeholder="空数据" aria-label="空数据" />
    </DsRow>
  </DsSection>

  <DsSection id="tagsinput" title="TagsInput" note="回车或 delimiter 成标签；超过 max / 重复时发 invalid 事件，由调用方决定怎么提示">
    <DsRow label="modelValue" stack>
      <TagsInput v-model="tags" placeholder="输入后回车" aria-label="标签" />
    </DsRow>

    <DsRow label="size" stack>
      <TagsInput v-for="s in SIZES" :key="s" :model-value="['tag']" :size="s" :aria-label="`size ${s}`" />
    </DsRow>

    <DsRow label="max / duplicate / clearable" note="max=3；重复值默认被拒" stack>
      <TagsInput v-model="tags" :max="3" clearable placeholder="最多 3 个" aria-label="限量标签" />
    </DsRow>

    <DsRow label="状态" stack>
      <TagsInput :model-value="['disabled']" disabled aria-label="禁用" />
      <TagsInput :model-value="['invalid']" invalid aria-label="错误" />
    </DsRow>
  </DsSection>

  <DsSection id="segmented" title="Segmented" note="视图/参数切换用它（同一份内容的不同呈现）；切换的是「页面区域」时用 Tabs">
    <DsRow label="items">
      <Segmented v-model="view" :items="VIEWS" aria-label="视图">
        <template #item="{icon, iconSize}">
          <component :is="icon" v-if="icon" :class="iconSize" aria-hidden="true" />
        </template>
      </Segmented>
    </DsRow>

    <DsRow label="size">
      <Segmented v-model="view" :items="VIEWS" size="sm" aria-label="sm" />
      <Segmented v-model="view" :items="VIEWS" size="md" aria-label="md" />
    </DsRow>

    <DsRow label="iconOnly" note="每项的 label 转成 aria-label，读屏仍念得出">
      <Segmented v-model="view" :items="VIEWS" icon-only aria-label="视图（仅图标）">
        <template #item="{icon, iconSize}">
          <component :is="icon" :class="iconSize" aria-hidden="true" />
        </template>
      </Segmented>
    </DsRow>

    <DsRow label="multiple" note="多选时值是数组（富文本工具条那种）">
      <Segmented v-model="marks" :items="MARKS" multiple icon-only aria-label="文字样式">
        <template #item="{icon, iconSize}">
          <component :is="icon" :class="iconSize" aria-hidden="true" />
        </template>
      </Segmented>
    </DsRow>

    <DsRow label="orientation=vertical / block" stack>
      <Segmented :model-value="'list'" :items="VIEWS" orientation="vertical" aria-label="竖排" />
      <Segmented :model-value="'list'" :items="VIEWS" block aria-label="撑满" />
    </DsRow>

    <DsRow label="disabled">
      <Segmented :model-value="'list'" :items="VIEWS" disabled aria-label="禁用" />
      <Segmented :model-value="'list'" :items="[...VIEWS.slice(0, 2), {label: '卡片', value: 'grid', disabled: true}]" aria-label="单项禁用" />
    </DsRow>
  </DsSection>

  <DsSection id="datepicker" title="DatePicker / Calendar" note="值是 'YYYY-MM-DD' 字符串而不是 Date：字符串没有时区，不会出现「东八区少一天」">
    <DsRow label="单日" stack>
      <DatePicker v-model="day" aria-label="选择日期" />
      <DatePicker v-model="day" size="sm" aria-label="sm" />
      <DatePicker v-model="day" size="lg" aria-label="lg" />
    </DsRow>

    <DsRow label="range" note="面板并排两个月；要等 end 落地才收面板" stack>
      <DatePicker v-model="period" range aria-label="选择区间" />
    </DsRow>

    <DsRow label="min / max" note="范围外的日子点不动，「今天」按钮也会自己禁用" stack>
      <DatePicker v-model="day" min="2026-08-05" max="2026-08-25" aria-label="限定范围" />
    </DsRow>

    <DsRow label="isDateDisabled" note="按 key 判断：这里禁掉所有周末" stack>
      <DatePicker
        v-model="day"
        :is-date-disabled="(key) => [0, 6].includes(new Date(`${key}T00:00:00`).getDay())"
        aria-label="仅工作日"
      />
    </DsRow>

    <DsRow label="format / locale" note="触发器文案走 Intl，跟随界面语言" stack>
      <DatePicker v-model="day" :format="{dateStyle: 'full'}" aria-label="完整格式" />
      <DatePicker v-model="day" locale="en-US" aria-label="英文" />
    </DsRow>

    <DsRow label="状态" stack>
      <DatePicker aria-label="空值" />
      <DatePicker :model-value="day" disabled aria-label="禁用" />
      <DatePicker :model-value="day" invalid aria-label="错误" />
      <DatePicker :model-value="day" :clearable="false" aria-label="不可清除" />
    </DsRow>
  </DsSection>
</template>
