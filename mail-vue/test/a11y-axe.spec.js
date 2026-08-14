import {afterEach, describe, expect, it} from 'vitest'
import {nextTick} from 'vue'
import {mount} from '@vue/test-utils'
import axe from 'axe-core'
import * as ui from '@/components/ui/index.js'
import DsActions from '@/views/design-system/sections/DsActions.vue'
import DsDisplay from '@/views/design-system/sections/DsDisplay.vue'
import DsForms from '@/views/design-system/sections/DsForms.vue'
import DsNavigation from '@/views/design-system/sections/DsNavigation.vue'
import DsOverlays from '@/views/design-system/sections/DsOverlays.vue'

/**
 * P1-9：axe-core 结构扫描（§9.4 的可执行版本，要求 0 serious / 0 critical）
 *
 * 两部分：
 *   1. `/_ds` 那五个展示区整段扫 —— 它们本来就是「每个原语的每种变体各来一个」，
 *      比手写 harness 覆盖得全，而且以后加组件会自动进扫描范围；
 *   2. 浮层单独扫 —— 展示区里的对话框/菜单默认是关着的，而恰恰是打开后的
 *      role/aria 关系最容易出错（悬空的 aria-describedby 就是这么抓出来的）。
 *
 * 能力边界，说清楚免得误读这份绿灯：
 * - **对比度不在这里**。jsdom 不排版、没有 canvas，axe 的 color-contrast 只会返回
 *   incomplete。两套主题的对比度是 `design-tokens.spec.js` 用 token 静态算的
 *   （WCAG 2.2 SC 1.4.3 / 1.4.11 双主题全覆盖），外加浏览器里的人工复核。
 *   也因为不排版，主题 class 对这份扫描没有任何影响，所以不做 light/dark 两遍空跑。
 * - 页面级规则（region / landmark / html-has-lang / document-title …）在这里没有
 *   意义：扫的是组件片段，不是整页。它们属于 P2 外壳（AppShell）的活。
 * - 同理，需要真实尺寸的规则（scrollable-region-focusable、target-size）在 jsdom
 *   里恒为不适用 —— 不是过了，是没测到。
 */

/** 页面级 / 需要排版的规则：在组件片段 + jsdom 里没有判定意义 */
const DISABLED_RULES = [
    'color-contrast', 'color-contrast-enhanced',
    'region', 'landmark-one-main', 'landmark-unique', 'page-has-heading-one',
    'html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch', 'document-title', 'bypass',
    'target-size', 'scrollable-region-focusable',
]

const AXE_OPTIONS = {
    runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']},
    rules: Object.fromEntries(DISABLED_RULES.map((id) => [id, {enabled: false}])),
    resultTypes: ['violations'],
}

/**
 * P1-9 的红线是 0 serious / 0 critical，但整套原语现在连 moderate / minor 都是 0 条 ——
 * 所以这里直接按「一条都不许有」收，把线钉在当前水位上，免得慢慢漏回来。
 * （`impact` 为 undefined 的规则也算，别让它从缝里溜走。）
 */
const BLOCKING = new Set(['critical', 'serious', 'moderate', 'minor', undefined])

let mounted = []

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount())
    mounted = []
    document.body.innerHTML = ''
})

function render(component, options = {}) {
    const wrapper = mount(component, {attachTo: document.body, ...options})
    mounted.push(wrapper)
    return wrapper
}

async function settle(ticks = 3) {
    for (let i = 0; i < ticks; i += 1) {
        await nextTick()
    }
}

/** @returns {Promise<string[]>} 违规摘要，空数组 = 干净 */
async function scan() {
    const {violations} = await axe.run(document.body, AXE_OPTIONS)
    return violations
        .filter((v) => BLOCKING.has(v.impact))
        .map((v) => `[${v.impact}] ${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

/** 浮层用例：`template` 里的组件全部来自根桶，`open` 负责把面板打开 */
function host(template, data = {}) {
    return {components: {...ui}, data: () => ({...data}), template}
}

const SECTIONS = {
    '展示区 · 动作': DsActions,
    '展示区 · 展示': DsDisplay,
    '展示区 · 表单': DsForms,
    '展示区 · 导航与数据': DsNavigation,
    '展示区 · 浮层（闭合态）': DsOverlays,
}

describe('axe · 展示区整段', () => {
    it.each(Object.keys(SECTIONS))('%s 一条 axe 违规都没有', async (name) => {
        render(SECTIONS[name])
        await settle()
        expect(await scan()).toEqual([])
    }, 30000)
})

const OVERLAYS = {
    '对话框（有标题有描述）': {
        component: host(`
          <Dialog :open="true" title="移动到文件夹" description="选一个目标文件夹">
            <Field v-slot="{id, describedBy}" label="文件夹">
              <Input :id="id" model-value="收件箱" :aria-describedby="describedBy" />
            </Field>
            <template #footer>
              <Button variant="secondary">取消</Button>
              <Button variant="primary">移动</Button>
            </template>
          </Dialog>`),
    },
    '对话框（无可见标题，靠隐藏标题起名）': {
        component: host('<Dialog :open="true" aria-label="快速操作"><p>正文</p></Dialog>'),
    },
    '确认框（危险动作）': {
        component: host(`
          <AlertDialog :open="true" tone="danger" title="彻底删除 3 封邮件？"
                       description="删除后无法恢复" confirm-text="删除" />`),
    },
    'Sheet（底部升起，带把手）': {
        component: host('<Sheet :open="true" title="筛选"><p>正文</p></Sheet>'),
    },
    'Sheet（右侧抽屉，带关闭按钮）': {
        component: host('<Sheet :open="true" side="right" title="详情"><p>正文</p></Sheet>'),
    },
    'Popover': {
        component: host(`
          <Popover default-open>
            <template #trigger><Button>更多信息</Button></template>
            <p>面板正文</p>
          </Popover>`),
    },
    '下拉菜单（全套菜单项）': {
        component: host(`
          <DropdownMenu default-open aria-label="更多操作">
            <template #trigger><Button aria-label="更多操作">…</Button></template>
            <MenuLabel>邮件</MenuLabel>
            <MenuItem shortcut="R">回复</MenuItem>
            <MenuItem disabled>转发</MenuItem>
            <MenuSeparator />
            <MenuCheckboxItem v-model="starred">加星</MenuCheckboxItem>
            <MenuSeparator />
            <MenuGroup label="排序">
              <MenuRadioGroup v-model="sort">
                <MenuRadioItem value="date">按日期</MenuRadioItem>
                <MenuRadioItem value="from">按发件人</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            <MenuGroup>
              <MenuItem tone="danger">删除</MenuItem>
            </MenuGroup>
            <MenuSub label="移动到">
              <MenuItem>收件箱</MenuItem>
            </MenuSub>
          </DropdownMenu>`, {starred: true, sort: 'date'}),
    },
    '命令面板': {
        component: host(`
          <Command aria-label="命令面板" :items="items" placeholder="搜索命令" />`, {
            items: [
                {label: '邮件', options: [{value: 'reply', label: '回复', shortcut: 'R'}, {value: 'archive', label: '归档'}]},
                {value: 'settings', label: '设置', hint: '偏好'},
            ],
        }),
    },
    'Toast（四种类型同时在场）': {
        component: host('<Toaster :expand="true" />'),
        async open() {
            ui.toast.success('已发送')
            ui.toast.error('发送失败：收件人地址无效')
            ui.toast.loading('上传附件中')
            ui.toast.undo('已删除 3 封', {onUndo: () => {}})
            await settle(4)
        },
    },
    '下拉选择（展开）': {
        component: host(`
          <Select aria-label="视图" :options="options" model-value="all" />`, {
            options: [{label: '视图', options: [{label: '全部邮件', value: 'all'}, {label: '仅未读', value: 'unread', hint: '12'}]}],
        }),
        async open(wrapper) {
            wrapper.get('[role="combobox"]').element
                .dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true}))
            await settle()
        },
    },
    '可搜索选择（展开）': {
        component: host(`
          <Combobox aria-label="收件人" :options="options" />`, {
            options: [{label: 'a@b.com', value: 'a'}, {label: 'c@d.com', value: 'c'}],
        }),
        async open(wrapper) {
            wrapper.get('input').element.click()
            await settle()
        },
    },
    '日期选择（展开日历）': {
        component: host('<DatePicker aria-label="截止日期" model-value="2026-08-14" />'),
        async open(wrapper) {
            await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
            await settle()
        },
    },
    'Tooltip（可见）': {
        component: host(`
          <Tooltip :open="true" text="归档（E）">
            <Button aria-label="归档">E</Button>
          </Tooltip>`),
    },
    'HoverCard（可见）': {
        component: host(`
          <HoverCard :open="true">
            <template #trigger><Button>发件人</Button></template>
            <p>uni@example.com</p>
          </HoverCard>`),
    },
}

describe('axe · 浮层打开态', () => {
    it.each(Object.keys(OVERLAYS))('%s 一条 axe 违规都没有', async (name) => {
        const {component, open} = OVERLAYS[name]
        const wrapper = render(component)
        await settle()
        await open?.(wrapper)
        expect(await scan()).toEqual([])
    }, 30000)
})

describe('axe · 扫描本身可信', () => {
    it('规则集真的跑起来了 —— 故意塞一个无名按钮必须被抓到', async () => {
        render(host('<div><button type="button"><span aria-hidden="true">×</span></button></div>'))
        await settle()
        const found = await scan()
        expect(found.join('\n')).toMatch(/button-name/)
    }, 30000)
})
