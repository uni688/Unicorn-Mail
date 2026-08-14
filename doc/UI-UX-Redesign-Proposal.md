# Unicorn-Mail UI/UX Redesign Proposal

> **版本** v1.2（终稿候选）· **日期** 2026-08-10 · **阶段** 第一阶段（方案，不含代码改动）
> **代码基线** `22aadb8`（clone from `github.com/uni688/Unicorn-Mail`）
> **审阅范围** `mail-vue/src` 全量 15,176 行 · `mail-worker/src` 接口与服务层

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-08-09 | 首版方案 |
| v1.1 | 2026-08-10 | 按你的 9 条微调意见修订：①粒子背景从「不做」改为「做，站长/用户两级开关」→ §0.3 §4.12 §6.2 §8.5 §9.3 §9.5；②App Shell 侧栏改为 Outlook 式**仅邮件分类且用户可自定义**，管理/开发者迁出侧栏 → §5.1 §5.2 §7.4.1；③登录页从「左 480px 固定表单」改为**浮动毛玻璃卡片** → §5.3.1；④邮件页分类进侧栏、顶部加命令条、搜索移入顶栏 → §5.3.3 §7.5；⑤原附录 B-2/B-3 已确认通过；⑥附录 C 后端安全修复延后至 UI 全部完成后执行；⑦新增 §5.3.2 概览拆分方案、§10.5.1 的 5 项后端增量（文件夹计数、回收站、标记未读、用户偏好落库、外观策略字段）与 §10.5.2 需追加的 6 个现有文件清单；⑧更正 v1.0「不改动任何现有文件」的错误说法；⑨快捷键卡、路线图人日（48 → 53）、验证项按新 IA 更新 |
| **v1.2** | 2026-08-10 | 按你的 5 条审阅回复修订，**作为终稿候选**：①**推翻 v1.1 的「侧栏按邮箱分组」**，改为「侧栏只显示当前邮箱的文件夹 + 顶部 `MailboxPicker` 下拉切换」，理由是账号列表不虚拟化会在几十上百邮箱时拖垮渲染 → 新增 §5.1「邮箱切换器」小节、重写 §5.1 线框与结构性变化表、§5.3.4、§5.4、§6.2 `MailboxPicker`、§7.1/§7.2/§7.4.1、§10.5 增量 6（`GET /account/search`）、§10.6 增加 200 邮箱压测、§10.7 增加风险行；②垃圾邮件文件夹**暂缓**（决策 12）；③用户偏好**落库**（决策 13，`user_setting` + `GET/PUT /user/prefs`）；④管理后台安家 `/settings/admin/*` 的折衷**已确认**（决策 14）；⑤概览一拆二**已确认**，头像菜单常驻 `MiniQuota`（决策 15）；⑥`GET /email/counts` 收窄为按当前邮箱取数，去掉 v1.1 的「一次返回所有邮箱」写法；⑦附录 B 清空为「无待确认项」 |

## 已确认的前置决策

| # | 决策项 | 结论 | 对方案的影响 |
|---|---|---|---|
| 1 | 后端改动边界 | **允许增量新增**：新增只读聚合接口 + 新增 D1 表与迁移，不改动现有表已有列的语义与现有业务逻辑 | Developer 页、Dashboard 状态卡、邮件搜索均为**真功能**而非占位 |
| 2 | 前端技术路线 | **去掉 Element Plus，换 Reka UI + Tailwind v4 全量重写** | 视觉自由度最高；采用 Strangler 渐进替换落地，终态 EP 依赖为 0 |
| 3 | 品牌主色 | **石墨中性 + 深紫罗兰强调 `#6E56CF`** | 界面 95% 中性灰阶，紫罗兰仅用于主操作/选中/焦点 |
| 4 | 落地页 IA | **所有人登录后落到 Inbox** | 概览不占首屏，且不再出现在侧栏（见 #6） |
| 5 | 粒子背景 | **做**，作为增强项：站长可选「关闭 / 用户自选 / 强制开启」，站长选强制时用户侧选项置灰 | 登录页 + 空状态可选粒子层；性能与降级规则见 §8.5 |
| 6 | 侧栏范围 | **仅邮件分类**（收藏夹 + 当前邮箱的 收件箱/已发送/草稿/星标/回收站），**用户可自定义显示与排序**；管理、开发者、系统设置全部迁出侧栏，统一进「设置中心」 | 参考 Outlook 三栏结构；侧栏恒定 8~11 行 |
| 7 | 登录页形态 | **居中浮动毛玻璃卡片**，背景为柔光 + 可选粒子 | 摆脱传统「左表单右插画」登录页 |
| 8 | 真标签体系 | 首版用智能筛选器替代，真标签（`email_label` 表）延后 v2 | 原附录 B-2，已确认 |
| 9 | cron 触发器 | 允许为 `api_log` 清理新增 `wrangler` cron | 原附录 B-3，已确认 |
| 10 | 后端安全修复 | **延后**：`public-service` 的 SQL 拼接与 KV 令牌问题，在 UI 全部完成后单独处理 | 原附录 C，本次不动 |
| **11** | **邮箱切换方式（v1.2）** | **顶部 `MailboxPicker` 下拉**（虚拟滚动 + 按需分页 + 服务端搜索 + 「最近/置顶」分组 + 「全部邮箱」聚合项）；**侧栏只渲染当前邮箱的文件夹**，绝不一次性铺开 N 个邮箱 | 推翻 v1.1 的侧栏邮箱分组；渲染量与邮箱数量解耦 → §5.1 §6.2 §10.5 增量 6 |
| **12** | **垃圾邮件文件夹** | **暂缓**（黑名单邮件在 `email/email.js:53-58` 直接 `setReject()` 不入库，要做必须改收信行为） | 侧栏不出现「垃圾邮件」，列 v2 |
| **13** | **用户偏好存储** | **落库**：新增 `user_setting` 表（JSON 单列）+ `GET/PUT /user/prefs`，localStorage 仅作首帧写透缓存 | 侧栏自定义/密度/窗格/主题/最后使用邮箱跨设备一致 → §10.5 增量 4 |
| **14** | **管理后台位置** | 折衷方案已确认：管理功能安家 `/settings/admin/*`，与个人设置、开发者共用 `SettingsShell`，但左导航分组独立、需 `analysis:query` 等权限 | 侧栏彻底不含管理项 → §5.2 §5.3.6 |
| **15** | **概览页** | **一拆二已确认**：「设置 · 个人用量与配额」`/settings/account/usage` + 「管理 · 系统概览」`/settings/admin/overview`；头像菜单常驻 `MiniQuota`（今日发信 / 存储） | 不与决策 4「统一落 Inbox」冲突 → §5.3.2 §6.2 |

---

## 0. 本方案对原始方针的调整（必读）

原始方针里有 6 处与代码实际情况冲突或需要收敛，逐条说明并给出我的处理。**v1.1 起 §0.3 已按你的裁决改为「做」**，其余 5 条维持。

### 0.1 「优先复用已有组件」与「全量重写」的冲突 → 复用的是逻辑层，不是 UI 层

你同时提出「优先复用已有组件」和「去掉 EP 全量重写」。这两条无法同时成立于 UI 层，我的处理是**把「复用」重新定义到逻辑层**：

- **100% 复用**：`request/*`（13 个请求模块）、`store/*`（9 个 Pinia store）、`utils/*`、`enums/*`、`db/db.js`（Dexie 草稿）、`perm/perm.js`（权限指令与动态路由）、`axios/index.js`（拦截器与错误码约定）、`i18n/*`（336 个 key）、`echarts/*`。
- **重写**：`layout/*`、`views/*`、`components/*` 的**呈现层**，业务函数体逐个搬迁而非重写。
- **不动**：`mail-worker` 现有一切**逻辑**路径。v1.2 更正：会有 7 个后端文件被**追加**内容（新迁移步骤、新列、新方法、新路由注册），但既有函数的行为一律不改，清单见 §10.5.2。

### 0.2 「全量重写」的落地方式 → Strangler 渐进替换，不做一次性大爆炸

1.5 万行视图 + 300+ 处 EP 用法一次性替换必然带来长时间不可用与大量回归。终态仍是「EP 依赖为 0」，但过程分 7 个阶段，**每个阶段结束时 `npm run build` 必须绿灯、应用必须可用、可独立回滚**（详见 §10.4）。过渡期内新旧组件共存，通过一层 EP CSS 变量映射保证旧页面在新配色下不破形。

### 0.3 粒子背景 → **v1.1 已改为「做」，用两级开关约束风险**

v1.0 我建议不做（担心廉价 AI 感与性能）。你的裁决是**做，并且要两级开关**。现按此执行，同时把我原来担心的三件事变成硬性工程约束，而不是靠自觉。

**开关模型（两级，站长优先）**

| 站长设置（设置中心 → 管理 → 外观 → 背景效果） | 用户侧（设置中心 → 个人 → 外观 → 背景效果） | 实际生效 |
|---|---|---|
| `off` 强制关闭 | 置灰，显示「已由站长关闭」 | 关闭 |
| `optional` 用户自选（**默认**） | 可选：关闭 / 柔光 / 柔光+粒子 | 用户选择，默认「柔光」 |
| `on` 强制开启 | 置灰，显示「已由站长统一设置」 | 柔光+粒子 |

- 置灰不是隐藏：控件保留、`aria-disabled="true"`、旁边一行说明写清原因和是谁锁的——比直接消失更容易理解。
- 生效范围：**登录/注册页（全屏）** + **应用内空状态插画区（局部、粒子数减半）**。正文、列表、表单区域永不铺粒子。
- 存储：站长级写 `setting` 表新增列 `bg_effect`；用户级写用户偏好（§10.5 的 `user_setting` 表，localStorage 写透缓存以免首帧闪烁）。

**硬性工程约束（这是我保留的部分，避免变成"廉价 AI 感"）**

1. **自研 Canvas 2D，约 120 行，不引入 tsparticles / three.js / WebGL**——外部粒子库的默认预设（连线、鼠标爆炸、彩色渐变）正是廉价感的来源，而且体积 30~120KB。
2. 粒子形态严格限定：半径 0.6~1.6px 的**单色圆点**，颜色取 `--um-particle-color` / `--um-particle-alpha`（浅色 `#6E56CF` 8% / 深色 `#A9A0FF` 14%），**不连线、不跟随鼠标、不发光、不彩色**；速度 2~6 px/s，做的是「缓慢的星尘漂移」而不是「科技感粒子网络」。
3. 数量按视口面积算：`min(72, 面积/22000)`，桌面上限 72、平板 40、**移动端强制 0（只留柔光）**；`devicePixelRatio` 上限取 2。
4. 生命周期：`requestAnimationFrame` + `document.visibilityState` 暂停 + `IntersectionObserver` 离屏暂停 + 帧预算守卫（连续 20 帧超 8ms 自动降数量，两次降档后自动退化为纯柔光）。
5. `prefers-reduced-motion: reduce` → 只画一次静态帧，不启动动画循环。
6. 电量与低端设备：`navigator.hardwareConcurrency <= 4` 或 `saveData` 为真时直接降级为柔光。
7. **3D 模型仍然不做**（你本轮只放开了粒子）。

底层柔光层（`radial-gradient` 紫罗兰 5%–6% + ≤3% 点阵遮罩、零 JS、< 1KB CSS）保持不变，是粒子关闭时的兜底视觉，也是粒子层的背景（逐主题取值见 §9.5）。

### 0.4 Dashboard 首页要求的 7 类数据 → 4 类现成、3 类需新增后端

| 原方针要求 | 现状 | 处理 |
|---|---|---|
| 邮件状态概览 | `analysis/echarts` 有全站总量，**无个人维度** | 新增 `GET /dashboard/overview` |
| 今日发送统计 | KV `SEND_DAY_COUNT` 有全站当日数 | 复用 + 补个人维度 |
| 收件情况 | `analysis-dao.receiveDayCount` 有 15 日曲线（全站） | 复用，个人维度新增 |
| 系统状态 | **完全没有** | 新增 `GET /status/overview`（D1/KV/R2/Resend/AI/Turnstile 探活） |
| 域名状态 | 仅 `c.env.domain` 字符串数组，无 MX/SPF/DKIM/DMARC 校验 | 新增 DNS-over-HTTPS 校验 + KV 缓存 |
| API 状态 | **完全没有** | 随 `api_log` 表落地 |
| 最近活动 | 无审计流 | 由 `api_log` + 邮件事件合成，**首版仅覆盖已有数据源** |

### 0.5 邮件「搜索 / 筛选」→ 个人邮箱侧后端不支持，需新增参数

`GET /email/list` 的参数只有 `emailId / type / accountId / size / timeSort / allReceive`（`email-service.js:30`），**没有任何关键词或时间范围过滤**。带筛选能力的查询只存在于管理员的 `all-email` 与 `public/emailList`。因此「搜索 / 筛选 / 标签」不可能纯前端实现。

处理：为 `/email/list` **增量新增**可选参数 `keyword`、`hasAtt`、`unread`、`startTime`、`endTime`（全部可选、缺省行为与今天完全一致，向后兼容）；前端另有 Dexie 本地索引兜底最近 500 封的即时搜索。**「标签」在当前数据模型中不存在**（`email` 表无 label/tag 字段），首版以「智能筛选器」（未读 / 带附件 / 含验证码 / 星标 / 发件人）替代，真标签体系列为 v2 —— **此项你已确认通过**（原 §附录 B-2）。

### 0.6 其余调整

- **设置中心的角色变了（v1.1）**：不再只是「个人设置 + 系统设置」，而是承接**所有非邮件功能**的统一容器，含三个分组：个人（7 个 section）/ 开发者（4 个 tab）/ 管理（7 个 section，其中系统设置再拆 9 张卡）。侧栏因此只剩邮件分类，见 §5.1 §5.2。
- **移动端**：按你要求重新设计而非缩放——底部 Tab + 全屏推入式导航 + Bottom Sheet，与桌面共用逻辑但不共用布局组件（§5.4）。
- **i18n 强约束**：现有 zh/en 各 336 key，新增文案一律走 `$t()`，不允许硬编码中文。这一点原方针未提，但不做会直接破坏 en 版本。
- **对 v1.0 一处说法的更正**：v1.0 的 §10.5 标题写的是「不改动任何现有文件」，严格来说做不到。后端增量需要**追加式**修改 7 个现有文件（v1.1 认定 6 个，v1.2 因新增 `GET /account/search` 多一个）：`init/init.js`（按其既有的 `vX_YDB()` 迁移惯例新增一个 `v3_1DB()` 步骤）、`entity/setting.js`（新增 `bg_effect` 列定义）、`service/setting-service.js`（`websiteConfig()` 返回白名单加一个字段，否则未登录的登录页拿不到背景效果策略）、`service/email-service.js`（**新增** `counts()`/`trashList()`/`markUnread()`/`restore()` 四个方法，`list()`、`delete()` 原样不动）、`service/account-service.js`（**新增** `searchByKeyword()`，`list()` 原样不动）、`hono/webs.js`（追加 import）、`index.js`（`scheduled()` 末尾追加清理调用）。除 `websiteConfig()` 那一行外全是纯追加，不改动任何既有逻辑。精确清单见 §10.5.2。
- **邮箱切换器（v1.2 新增，你审阅意见的第 1 点）**：v1.1 曾计划把每个邮箱做成侧栏里的一个可折叠分组（照搬 Outlook）。这在本产品会出问题——用户可以合法持有几十上百个临时邮箱，而现状 `layout/account/index.vue` 本来就是无虚拟化的全量渲染。v1.2 改为「侧栏只显示当前邮箱的文件夹 + 顶部 `MailboxPicker` 下拉切换（虚拟滚动 + 按需分页 + 服务端搜索）」，使渲染量与邮箱数量彻底解耦。这是本次唯一推翻 v1.1 已写方案的改动，涉及 §5.1 §5.3.4 §5.4 §6.2 §7 §10.4 §10.5 §10.6 §10.7。
- **后端安全问题延后（v1.1）**：`public-service.js:138-142` 的 SQL 字符串拼接与 `genToken` 的无过期全局 KV 令牌，按你的要求**放到 UI 全部完成之后**再处理，本次不动（附录 C 保留记录）。

---

## 1. 当前 UI 问题分析

以下全部基于实际代码，不是印象式评价。

### 1.1 视觉层：这是一套 2016 年的 Ant Design Pro 后台

| 症状 | 证据 |
|---|---|
| 深蓝侧栏 + 白色主体的经典后台配色 | `style.css:120` `--aside-backgound: #001529`；侧栏文字硬编码 `text-color="#fff"`（`aside/index.vue:8`） |
| 浅色模式下侧栏是深色、主体是浅色 → 双主题在同屏割裂 | 同上，浅色模式没有对应的浅色侧栏 token |
| 蓝紫渐变胶囊被复制到两处（正是你要避免的东西） | `aside/index.vue:97` 与 `header/index.vue:383` 都是 `linear-gradient(135deg,#1890ff,#3a80dd)` |
| 图标没有统一网格，靠逐个手调 margin 对齐 | `aside/index.vue:12-65`，图标尺寸 18/19/20/22/24 混用，`margin-left` 从 18px 到 22px 逐项微调 |
| 43 个互不相干的硬编码色值散落在视图里 | `views/ layout/ components/` 中 93 处十六进制、43 个不同色值，例如右键选中态 `#FDF6EC`（`email-scroll/index.vue:44`） |
| 阴影只有一处、且是 2010 年代的重投影 | `--aside-right-border: 3px 0 5px rgba(0,21,41,.35)` |
| 字重表达单一，全靠 `font-weight: bold` 二元切换 | 未读态、表头、标题全用 bold，缺 500/600 中间档 |

### 1.2 信息架构层：功能被扁平地摊在一级菜单

- 侧栏 11 个一级入口平铺，只用一条 `manage` 文字分隔（`aside/index.vue:34`）。收件箱、设置、权限、系统设置在视觉权重上完全等价。
- **两条相互独立的「设置」路径**：`/settings`（个人，296 行）与 `/system-setting`（系统，2015 行 / 9 张卡片），命名相近、入口相邻、内容毫不相干。
- **邮箱账号是一个浮层而不是一个页面**：`layout/account/index.vue`（677 行）挂在 main 内部，靠 `uiStore.accountShow` + `position: fixed + translateX(-100%)` 显隐（`main/index.vue:126-144`），且只在 `content/email/send` 三个路由下自动出现（`router/index.js:162`）。用户无法直接访问"我的邮箱"这个概念。
- **域名没有归属页面**：`domainList` 只作为新建邮箱弹窗里的下拉选项存在（`account/index.vue:156`）。
- **邮件详情不是一个可分享的地址**：`/message` 无参数，靠 `emailStore.contentData` 传值（`views/email/index.vue:67-72`），刷新即丢失、无法深链、无法多标签页对比。
- **没有任何仪表盘概念**：`/analysis` 需要 `analysis:query` 权限，普通用户看不到任何自己的数据。

### 1.3 交互层：缺少现代 SaaS 的全部效率入口

- 无命令面板、无快捷键、无 `/` 聚焦搜索——**全站零键盘操作路径**。
- `*:focus { outline: none }`（`style.css:58-60`）**全局抹掉了键盘焦点环**，这是 WCAG 2.4.7 的直接违反，键盘用户无法知道自己在哪。
- 页面转场只有 nprogress 顶部细线（`router/index.js:80-84`），内容区无淡入、无骨架接续。
- 反馈通道单一：87 处 `ElMessage(...)` 全部是同一种 plain toast，成功/失败/网络错误/校验错误同权重同位置。
- 空状态用 `el-empty` 默认插画（4 处），没有引导下一步动作。
- 无乐观更新：星标、已读、删除都等接口返回后才改 UI（`email-scroll` 内），配额类操作有局部乐观（`account/index.vue:273-292`）但没有统一模式。
- 移动端交互靠三层遮罩堆叠模拟（`layout/index.vue:109-124` + `main/index.vue:105-124`），没有 sheet、没有手势。

### 1.4 工程层：样式系统已经失控

| 指标 | 实测值 | 说明 |
|---|---|---|
| `!important` | **108 处** | 全部用于覆盖 EP 内部样式 |
| `:deep()` 穿透 | **81 处** | 组件封装已被击穿 |
| 内联 `style` | 91 处静态 + 20 处动态三元 | 状态表达写在模板里，无法做主题 |
| 响应式断点 | **19 个不同的 max-width** | 767/1024/1025/1366/1620/440/450/456/460/464/500/540/580/840/860/1023/1223/372… |
| CSS 变量 | 36 个，无命名体系，含 3 处拼写错误 | `--aside-backgound`、`--loadding-background`、`--light-ill`（应为 fill） |
| 单文件最大行数 | 2015 行（`sys-setting`）、1367 行（`email-scroll`）、1294 行（`user`） | 无法多人协作，无法安全改动 |

这一层是「彻底摆脱旧版 UI 风格」的真正障碍：**只要还在覆盖 EP，就一定继续产生 `!important` 和 `:deep()`**。这也是选择方案 C（去 EP）的核心理由。

### 1.5 可访问性：当前基本不可用于键盘与读屏

- 焦点环被全局移除（上述）。
- 图标按钮几乎全部无 `aria-label`：侧栏、header 工具栏、邮件行操作均为裸 `<Icon>` + `@click`（`<div>` 不可聚焦、不可回车触发）。
- 对比度不足：`--secondary-text-color: #909399` 在 `#FFFFFF` 上为 2.85:1，低于 AA 的 4.5:1。
- 邮件列表是 `div` 堆叠而非 `role="list"/"listitem"`，勾选框与行的关系未声明。

---

## 2. 产品定位分析

### 2.1 现状定位与目标定位的落差

| 维度 | 现状（代码呈现的） | 目标 |
|---|---|---|
| 产品类型 | 自托管邮箱**管理后台** | 自托管邮件**基础设施控制台** |
| 主张 | 「一个域名开多个邮箱」 | 「你自己的邮件基础设施：收信、发信、API，一处掌控」 |
| 首要用户 | 站长（管理员） | 站长 + 使用者 + 集成开发者，三者界面同源但视图不同 |
| 竞争坐标 | cloud-mail 系自托管项目 | Resend / Postmark 的控制台质感 × Fastmail 的收信体验 |

Unicorn-Mail 实际同时是三个产品，现状把它们压在了同一套后台皮肤下：

1. **一个邮件客户端**（收信、读信、写信、附件、草稿、星标）
2. **一个多租户管理控制台**（用户、角色、配额、邀请码、全站邮件、系统设置）
3. **一个邮件 API 服务**（开放 API、批量建号、邮件查询、TG 推送、验证码识别）

### 2.2 四类用户与核心任务

| 画像 | 占比直觉 | 核心任务（JTBD） | 设计含义 |
|---|---|---|---|
| **个人用户** | 最多 | 「我要拿到那封验证码」「临时邮箱收个注册信」 | 首屏必须是收件箱；验证码要能一键复制（现有 `item.code` 已具备，需提升为一等公民） |
| **开发者** | 高价值 | 「批量开号、程序化取信、把邮件接入我的系统」 | 需要真正的 API Key / 日志 / 可复制 cURL；需要键盘效率 |
| **团队** | 中 | 「给成员分角色、限配额、看谁在用」 | 用户与角色页要能扫读，配额要可视化而非数字 |
| **企业 / 站长** | 少但决策 | 「系统是否健康、域名是否配好、成本与用量」 | Overview 与状态体系；域名 DNS 校验 |

### 2.3 设计北极星

> **Unicorn-Mail 应该像一台仪器：安静、精确、随手可及。**

三条可判定的验收句：

1. 任何常用动作都能在 **2 次击键**内触达（`⌘K` + 首字母）。
2. 界面上**没有一个色块是装饰性的**——每一处颜色都在传达状态。
3. 一个开发者第一次打开 `/developer`，**5 分钟内能跑通一次 API 调用**。

### 2.4 与参考产品的取舍

| 参考 | 取 | 不取 |
|---|---|---|
| Cloudflare Dashboard | 状态体系、域名健康检查的呈现、密度 | 顶部橙色品牌带、过深的多级导航 |
| Railway | 卡片留白、hairline 边框、单色强调 | 卡片过大导致的低密度 |
| Linear | 命令面板、`g`+键导航、48px 顶栏、无边框表格、**顶部工作区切换下拉**（`MailboxPicker` 的形态原型） | 单一工作区假设（本产品一个用户可有上百邮箱，切换器必须虚拟化 + 服务端搜索） |
| Vercel | 中性色阶、tabular 数字、图表极简、**Team Switcher 的"最近 + 搜索 + 新建"三段式** | 完全无彩带来的辨识度缺失 |
| Notion | 内容优先的阅读排版、行内编辑 | 拖拽块编辑（与邮件语义不符） |
| iOS 新拟态 | 半透明层次（仅浮层）、圆角尺度、弹性 sheet | 大面积毛玻璃（Workers 端移动设备性能代价） |

---

## 3. 新设计理念

### 3.1 三条设计原则

**① Surface over Chrome（表面优先于装饰）**
界面的层次靠**背景色阶 + 1px hairline** 建立，不靠边框粗细、阴影堆叠或渐变。深色模式下阴影几乎不可见，因此层级一律由 `bg-canvas → bg-subtle → bg-surface → bg-surface-raised` 四级色阶承担，阴影只服务于**脱离文档流的浮层**。

**② Color is Signal（颜色即信号）**
中性灰阶承担 95% 的界面。紫罗兰只出现在三处：主操作按钮、当前选中项、焦点环。语义色（成功/警告/危险/信息）只出现在状态本身。**禁止**用颜色做视觉趣味。

**③ Density with Air（有密度，也有呼吸）**
参考 Cloudflare 的信息密度而不是它的拥挤：正文 14px、行高 20px、列表行高 44px（紧凑档 36px），但每个内容分组之间保留 24–32px 的留白。密度可切换（设置 → 外观 → 界面密度：紧凑 / 标准）。

### 3.2 「克制的科技感」的可执行定义

| 做 | 不做 |
|---|---|
| 1px hairline 边框 + 4 级背景色阶 | 发光边框、彩色描边 |
| 单色强调 + 6% 透明度选中底 | 大面积蓝紫渐变 |
| 分层阴影（4 级，最大 alpha 0.16） | 长投影、双色投影 |
| 120–240ms 的位移/透明度过渡 | 弹跳、旋转、缩放炫技 |
| 半透明仅用于 4 个面（登录卡 / 命令面板 / Sheet / 遮罩） | 全局毛玻璃、内容区毛玻璃 |
| tabular-nums 等宽数字 + mono 字体呈现 ID/Key | 装饰性字体 |
| 状态点（6px 圆点）+ 文案 | 徽章色块滥用 |
| 登录页柔光 + ≤14% 透明度的孤立粒子（v1.1 放开，可关） | 粒子连线 / 鼠标吸附 / WebGL / 3D 模型 |

### 3.3 品牌表达

品牌名 Unicorn 的落点是**紫罗兰强调色 + 一枚极简线性独角兽字标**，而不是插画。Logo 在侧栏顶部以 20px 单色线性图标 + 文字呈现，不再使用渐变胶囊（替换 `aside/index.vue:85-121`）。站长可在设置中心 → 管理 → 外观里替换站点名与强调色（§9.3）。

---

## 4. Design System

### 4.1 Token 三层架构

```
Layer 1  Primitive   --um-gray-100 / --um-violet-600 / --um-space-4
         ↓ 只在 Layer 2 被引用，业务代码禁止直接使用
Layer 2  Semantic    --um-bg-surface / --um-fg-muted / --um-accent-solid
         ↓ 主题切换只改这一层，业务代码 95% 用这一层
Layer 3  Component   --um-btn-primary-bg / --um-row-height / --um-sidebar-w
         ↓ 组件内部消费，供站长级定制覆盖
```

落地形式：Tailwind v4 的 `@theme` 块（无 `tailwind.config.js`），`:root` 定义浅色语义值，`.dark` 覆盖。Tailwind 工具类直接消费语义 token（`bg-surface`、`text-muted`、`border-default`）。

### 4.2 Color

#### Primitive — Graphite（中性）

| Token | Hex | 主要用途 |
|---|---|---|
| `gray-0` | `#FFFFFF` | 浅色画布 |
| `gray-25` | `#FCFCFD` | 浅色顶栏滚动态 |
| `gray-50` | `#FAFAFB` | 浅色 subtle 背景、侧栏 |
| `gray-100` | `#F4F4F6` | inset / 输入框底 / hover |
| `gray-200` | `#E8E8EC` | hairline 边框 |
| `gray-300` | `#D8D8DF` | 强边框 / 分隔 |
| `gray-400` | `#B4B4BF` | 禁用文字 |
| `gray-500` | `#8B8B99` | subtle 文字 |
| `gray-600` | `#63636E` | muted 文字（正文次级） |
| `gray-700` | `#46464F` | 侧栏文字 |
| `gray-800` | `#2A2A31` | — |
| `gray-900` | `#1A1A1F` | 浅色主文字 |
| `gray-950` | `#0A0A0B` | 深色画布 |

#### Primitive — Violet（强调）

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `violet-50` | `#F5F2FF` | | `violet-500` | `#8B72F0` |
| `violet-100` | `#EDE9FE` | | `violet-600` | **`#6E56CF`** |
| `violet-200` | `#DDD6FE` | | `violet-700` | `#5B45B0` |
| `violet-300` | `#C4B5FD` | | `violet-800` | `#473688` |
| `violet-400` | `#A48FFB` | | `violet-900` | `#332764` |

`violet-550` = `#7C66DD`（P0 新增）：只为「深色实底 hover」而存在。深色实底静息态必须停在
`violet-600`（白字 5.39:1），提亮一档才有 hover 反馈，但 `violet-550` 上白字只有 4.37:1，
所以它不能当静息态。

#### Semantic — 完整对照表（这张表就是主题方案的全部）

| 语义 Token | Light | Dark | 用途 |
|---|---|---|---|
| `bg-canvas` | `#FFFFFF` | `#0A0A0B` | 最底层画布 |
| `bg-subtle` | `#FAFAFB` | `#101012` | 侧栏、页面次级区 |
| `bg-surface` | `#FFFFFF` | `#141416` | 卡片、表格、面板 |
| `bg-raised` | `#FFFFFF` | `#1A1A1D` | 浮层、下拉、对话框 |
| `bg-inset` | `#F4F4F6` | `#0F0F11` | 输入框、代码块、凹陷区 |
| `bg-hover` | `rgb(10 10 11 / .04)` | `rgb(255 255 255 / .05)` | 中性 hover |
| `bg-active` | `rgb(10 10 11 / .07)` | `rgb(255 255 255 / .08)` | 中性 press |
| `bg-selected` | `rgb(110 86 207 / .07)` | `rgb(124 102 221 / .14)` | 选中行/选中项 |
| `bg-overlay` | `rgb(10 10 11 / .32)` | `rgb(0 0 0 / .60)` | 遮罩 |
| `fg-default` | `#1A1A1F` | `#ECECEF` | 主文字 |
| `fg-muted` | `#63636E` | `#9C9CA6` | 次级文字（AA 5.9:1 / 6.4:1） |
| `fg-subtle` | `#8B8B99` | `#6E6E78` | **非文本专用**：图标、圆点、滚动条滑块（≥3:1，见下方 P1 修订） |
| `fg-disabled` | `#B4B4BF` | `#4A4A52` | 禁用 |
| `fg-on-accent` | `#FFFFFF` | `#FFFFFF` | 强调底上的文字 |
| `border-default` | `#E8E8EC` | `#26262B` | hairline |
| `border-strong` | `#D8D8DF` | `#35353C` | 输入框、可交互边框 |
| `border-focus` | `#6E56CF` | `#8B72F0` | 焦点环 |
| `accent-solid` | `#6E56CF` | `#6E56CF` | 主按钮底（白字 5.39:1，两套主题同值） |
| `accent-hover` | `#5B45B0` | `#7C66DD` | 实底 hover：浅色加深、深色提亮（都朝「远离表面」走） |
| `accent-active` | `#473688` | `#8B72F0` | 实底 press |
| `accent-fg` | `#5B45B0` | `#A48FFB` | **accent 当文字/链接/图标色时用这个**，不要用 `accent-solid`（深色值见 P1 修订） |
| `accent-subtle-bg` | `#F5F2FF` | `rgb(110 86 207 / .14)` | 强调徽章底 |
| `accent-subtle-fg` | `#5B45B0` | `#C4B5FD` | 强调徽章文字 |
| `accent-border` | `#DDD6FE` | `rgb(110 86 207 / .32)` | 强调描边 |
| `sidebar-bg` | `#FAFAFB` | `#0D0D0F` | 侧栏（**不再是深蓝**） |
| `sidebar-fg` | `#46464F` | `#9C9CA6` | |
| `sidebar-indicator` | `#6E56CF` | `#8B72F0` | 选中项左侧 2px 指示条 |

> **P0 实施修订（2026-08-10）**：上表 accent 三档在 P0 落地时改了值，原因是原方案里
> 「深色 `accent-solid` = `#7C66DD`」与「`fg-on-accent` = `#FFFFFF`」组合起来只有 **4.37:1**，
> 达不到正文 AA 4.5。修订后 `accent-solid` 两套主题同为 `#6E56CF`（白字 5.39:1），
> `#7C66DD`（新增 Layer 1 色阶 `violet-550`）降级为深色的 hover。
> 同时新增 `accent-fg`：`accent-solid` 只保证「白字压在它上面」达标，
> 不保证「它压在底色上」达标（深色下 `#6E56CF` 对 `bg-surface` 只有 3.42:1，够描边不够文字）。
> 这些数值由 `mail-vue/test/design-tokens.spec.js` 逐对断言，改色阶会直接测试失败。

> **P1 实施修订（2026-08-14，浏览器双主题实测）**：两处配色规则在 P1 的人工过审里被推翻。
>
> 1. **`fg-subtle` 降级为「非文本专用」，文字只保留两级（`fg-default` / `fg-muted`）。**
>    原表与 §7.9 写的「`fg-subtle` 仅用于 ≥13px 非关键文本」这条豁免不成立：WCAG 2.2 SC 1.4.3
>    的大字豁免线是 **24px（或粗体 18.66px）**，13px 小字照样要 4.5:1，而浅色 `fg-subtle`
>    `#8B8B99` 对白底只有 **3.36:1**（对 `bg-inset` 3.06:1）。浏览器里实测到 300+ 处小字踩线
>    （占位符、快捷键、计数、菜单分组标题、日历弱化日期等），已全部改走 `fg-muted`。
>    近白底上做不出「三级都过 AA 且彼此可辨」的文字阶梯——要过 `bg-inset` 的 4.5:1，第三级
>    得压到 ≈`#6E6E7B`，与 `fg-muted` `#63636E` 几乎看不出差别，所以按 Radix / Primer / Linear
>    的通行做法收敛为两级文字 + 一级非文本。`fg-subtle` 保留给图标、状态圆点、滚动条滑块
>    （SC 1.4.11 的 3:1），`fg-disabled` 更低但 disabled 控件被 1.4.3 豁免。
>    护栏：`legacy-css.spec.js` 扫源码，凡同一行同时出现字号类与 `text-fg-subtle` 即失败。
> 2. **深色 `accent-fg` 由 `#8B72F0`（violet-500）提到 `#A48FFB`（violet-400）。**
>    菜单/下拉的选中行是 `accent-fg` 压在 `bg-selected` 上，而 `bg-selected`
>    `rgb(124 102 221 / .14)` 叠在 `bg-raised` `#1A1A1D` 上把底提亮成 `rgb(40 37 56)`，
>    violet-500 在这一档只有 **4.10:1**（实测），violet-400 是 5.62:1。
>    半透明选中态会「抬高」有效底色这件事，静态只看 token 对是看不出来的，现已补进
>    `design-tokens.spec.js`（`accent-fg` / `fg-default` / `fg-muted` × `bg-selected` 合成到 `bg-raised`）。
>
> 顺带修掉一处误用：`Field` 的必填星号原本用 `--um-danger-solid`（填充色，白底 4.38:1），
> 改为 `--um-danger-subtle-fg`（文字色）。语义色当文字用只能走 `-subtle-fg`，与 accent 同理。
>
> 实测覆盖（`/_ds` 双主题）：整页 939 个文本节点 × 2 套主题 0 失败（各 28 处 disabled 控件
> 属 1.4.3 豁免）；浮层 light 345 / dark 325 个节点 0 失败；Toast 8 种变体 light 39 / dark 16 个节点 0 失败。
> SC 2.5.8（24×24 目标尺寸）另有一批小于线的控件已登记，但不在 P1 验收线内，
> 且给 8px 间距的复选框、12px 的 chip 删除按钮盲目外扩命中区会互相抢点击，留待 P2 随组件重排一起处理。

#### Semantic — 状态色

| 状态 | Light solid / subtle-bg / subtle-fg | Dark solid / subtle-bg / subtle-fg |
|---|---|---|
| success | `#2E9E5B` / `#E8F6EE` / `#1F7444` | `#3DBB70` / `rgb(61 187 112/.14)` / `#7EDCA4` |
| warning | `#C77A0A` / `#FDF3E3` / `#8F5606` | `#E0A32E` / `rgb(224 163 46/.14)` / `#F3CE85` |
| danger | `#D64545` / `#FDECEC` / `#A32E2E` | `#F26D6D` / `rgb(242 109 109/.14)` / `#FCA5A5` |
| info | `#2E7DA6` / `#E9F4FA` / `#1F5C7D` | `#4CA6CE` / `rgb(76 166 206/.14)` / `#A5D8EC` |

#### 数据可视化色板（ECharts 共用，6 系列，色盲可辨）

`#6E56CF` · `#2E9E5B` · `#C77A0A` · `#2E7DA6` · `#9E4B8C` · `#8B8B99`
深色模式统一提亮一档：`#8B72F0` · `#3DBB70` · `#E0A32E` · `#4CA6CE` · `#C06FAD` · `#9C9CA6`
序列型（配额/热度）：`violet-100 → violet-600` 五档。**不使用彩虹色阶。**

### 4.3 Typography

**字体栈**（自托管 Inter Variable 拉丁子集 ≈ 42KB woff2 + JetBrains Mono 子集；**CJK 一律用系统字体，不自托管**，避免 5MB+ 体积）

```
--um-font-sans: "InterVariable", Inter, -apple-system, BlinkMacSystemFont,
  "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB",
  "Microsoft YaHei", "Noto Sans SC", sans-serif;
--um-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono",
  Menlo, Consolas, "Liberation Mono", monospace;
--um-font-feature: "cv05" 1, "cv11" 1, "ss03" 1;   /* 单层 a、直角 l、更窄 @ */
```

**Type scale**（基准 14px，密度导向）

| Token | size / line-height | weight | tracking | 用途 |
|---|---|---|---|---|
| `display` | 28 / 34 | 600 | -0.02em | 登录页标题、空状态大标题 |
| `title-lg` | 20 / 28 | 600 | -0.015em | 页面标题 |
| `title` | 16 / 24 | 600 | -0.01em | 卡片标题、邮件主题（阅读页） |
| `body-lg` | 15 / 24 | 400 | 0 | 邮件正文 |
| `body` | **14 / 20** | 400 | 0 | 全局默认 |
| `body-strong` | 14 / 20 | 550 | 0 | 未读邮件、表头 |
| `label` | 13 / 18 | 500 | 0 | 表单标签、按钮 |
| `caption` | 12 / 16 | 450 | 0 | 时间、辅助说明 |
| `micro` | 11 / 14 | 550 | 0.04em | 分组标题（大写）、徽章 |
| `mono` | 12.5 / 18 | 450 | 0 | API Key、ID、日志 |

**硬规则**
- 数字一律 `font-variant-numeric: tabular-nums`（统计卡、配额、日志时间戳）。
- **未读态不再用 `bold`**，改为 `body-strong`（550）+ 主题色圆点，避免行高跳动。
- 最小字号 11px 且仅用于 `micro`；正文不低于 14px。
- 中英混排统一 `text-wrap: pretty`，标题 `text-wrap: balance`。

### 4.4 Spacing & Layout

**基数 4px**：`0 · 1(4) · 2(8) · 3(12) · 4(16) · 5(20) · 6(24) · 8(32) · 10(40) · 12(48) · 16(64) · 20(80)`

| 布局 Token | 值 | 备注 |
|---|---|---|
| `sidebar-w` | 248px / 收起 56px | 可拖拽记忆（localStorage） |
| `list-col-w` | 380px（邮件列）/ 320px（`MailboxPicker` 下拉最小宽） | ≥1440px 时邮件列 400px |
| `topbar-h` | **48px** | 现状 60px |
| `row-h` | 44px 标准 / 36px 紧凑 | 密度可切 |
| `content-max-w` | 720px（阅读）/ 1280px（表单）/ 无限（表格） | 阅读页测量宽度 |
| `page-px` | 24px（桌面）/ 16px（移动） | |
| `card-p` | 20px | |

**断点收敛为 5 个**（替换现有 19 个）

| Token | min-width | 布局形态 |
|---|---|---|
| `sm` | 640px | 单列 + 底部 Tab |
| `md` | 768px | 双列（列表 + 内容），侧栏为 Drawer |
| `lg` | 1024px | 侧栏常驻 + 双列 |
| `xl` | 1280px | 三列常驻 |
| `2xl` | 1536px | 三列 + 内容区加宽 |

### 4.5 Radius

`xs 4` · `sm 6` · `md 8` · `lg 12` · `xl 16` · `2xl 20` · `full`

按钮/输入框 `md(8)` · 卡片/面板 `lg(12)` · 下拉/浮层 `lg(12)` · 对话框 `xl(16)` · 移动端 Sheet 顶部 `2xl(20)` · 头像/状态点 `full` · 徽章 `sm(6)`

### 4.6 Shadow / Elevation

**核心原则：浅色靠阴影分层，深色靠色阶 + hairline 分层。** 深色模式下阴影几何相同但 alpha ×2.5，并叠加 `inset 0 1px 0 rgb(255 255 255 / .04)` 制造上缘高光。

| Token | Light | 用途 |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgb(10 10 11/.04)` | 静态卡片（仅浅色，深色不用） |
| `shadow-sm` | `0 1px 2px rgb(10 10 11/.05), 0 1px 3px rgb(10 10 11/.04)` | hover 抬起 |
| `shadow-md` | `0 2px 4px -1px rgb(10 10 11/.05), 0 4px 12px -2px rgb(10 10 11/.06)` | 下拉、Popover |
| `shadow-lg` | `0 2px 6px -2px rgb(10 10 11/.06), 0 8px 24px -6px rgb(10 10 11/.10)` | 命令面板、Sheet |
| `shadow-xl` | `0 8px 16px -8px rgb(10 10 11/.08), 0 24px 48px -12px rgb(10 10 11/.16)` | Dialog |

**移除**现有 `--aside-right-border: 3px 0 5px rgba(0,21,41,.35)`，侧栏改为 1px `border-default`。

### 4.7 Focus Ring（修复当前 a11y 缺陷）

```css
/* 删除 style.css:58-60 的 *:focus { outline: none } */
:focus-visible {
  outline: 2px solid var(--um-border-focus);
  outline-offset: 2px;
  border-radius: inherit;
}
```
输入框聚焦态：`border-color: accent-solid` + `box-shadow: 0 0 0 3px accent-solid/12%`（不再是 EP 的 1px 蓝边）。

### 4.8 Motion Token

| Token | 值 | 用途 |
|---|---|---|
| `dur-instant` | 0ms | 选中/勾选 |
| `dur-fast` | 120ms | hover、颜色过渡 |
| `dur-base` | 180ms | 展开/收起、Tooltip |
| `dur-slow` | 240ms | Dialog、页面转场 |
| `dur-sheet` | 320ms | 移动 Sheet |
| `ease-standard` | `cubic-bezier(.2,0,.2,1)` | 默认 |
| `ease-out` | `cubic-bezier(0,0,.2,1)` | 进入 |
| `ease-in` | `cubic-bezier(.4,0,1,1)` | 退出 |
| `spring-sheet` | `{ stiffness: 260, damping: 30 }` | motion-v，Sheet/Drawer |

**上限 320ms**（唯一例外：已存在的主题切换 View Transition 520ms，保留）。

### 4.9 Z-index 分层

`base 0` · `sticky 10` · `sidebar 20` · `dropdown 1000` · `overlay 1100` · `dialog/sheet 1200` · `popover 1300` · `tooltip 1400` · `toast 1500` · `command 1600` · `route-progress 1700`

### 4.10 Icon

- 统一 **Lucide**（`@iconify-json/lucide` + `unplugin-icons`，按需内联为 SVG，构建期解析，运行时零请求）。替换当前 `@iconify/vue` 运行时按需拉取 + 9 个图标集混用（mdi / hugeicons / fluent / solar / ep / si / eos / cil / akar / mynaui / lets-icons / streamline-plump / fluent-color / flat-color-icons）。
- 尺寸只有 **3 档**：`14`（行内）· `16`（默认）· `20`（导航/工具栏）。描边 1.5px。
- 图标一律置于 `20×20` 或 `24×24` 的方形栅格容器内居中，**不再逐个调 margin**。
- 彩色图标（`fluent-color:*`、`flat-color-icons:*`）全部移除，改为单色 + 语义色。
- 每个 icon-only 按钮必须有 `aria-label` 且必须包 `Tooltip`。

### 4.11 Component Variants 矩阵

| 组件 | variant | size | state |
|---|---|---|---|
| Button | `primary` `secondary` `ghost` `danger` `link` | `sm(28)` `md(32)` `lg(38)` `icon` | default / hover / active / focus / loading / disabled |
| Input | `default` `inset` `invalid` | `sm` `md` | + prefix/suffix/clearable |
| Badge | `neutral` `accent` `success` `warning` `danger` `info` | `sm` `md` | solid / subtle / outline |
| Card | `flat` `raised` `interactive` | — | + hover 抬起（仅 interactive） |
| Tabs | `line` `segmented` | `sm` `md` | |
| Dialog | `sm(400)` `md(520)` `lg(680)` `full` | — | |
| Toast | `success` `error` `warning` `info` `loading` | — | + action / undo |
| StatCard | `number` `trend` `gauge` `status` | — | + skeleton |
| Table | `default` `compact` `borderless` | — | + selectable / sortable / sticky-header |

### 4.12 Material：玻璃与粒子（v1.1 新增）

玻璃只有 4 个使用面（登录卡、命令面板、移动端 Sheet/Drawer、模态遮罩——见 §5.1 末），粒子只有 1 个使用面（认证页与设置页的背景层）。为避免"哪里都能糊一层毛玻璃"，材质不做成 utility class，只暴露下面这组 token，并且只允许 `GlassCard` / `Overlay` / `ParticleField` 三个组件读取。

**Glass**

| Token | Light | Dark | 说明 |
|---|---|---|---|
| `--um-glass-bg` | `rgb(255 255 255 / var(--um-glass-alpha))` | `rgb(20 20 22 / var(--um-glass-alpha))` | 底色，透明度单独抽出便于站长调 |
| `--um-glass-alpha` | `0.72` | `0.64` | 登录卡由 `setting.login_opacity` 覆写（§5.3.1） |
| `--um-glass-blur` | `20px` | `24px` | 暗色需要更大半径才能压住背景噪点 |
| `--um-glass-saturate` | `160%` | `140%` | 与 blur 同写在一条 `backdrop-filter` 里 |
| `--um-glass-border` | `rgb(255 255 255 / 0.60)` | `rgb(255 255 255 / 0.08)` | 1px 内描边，暗色用极低白而非灰 |
| `--um-glass-highlight` | `rgb(255 255 255 / 0.50)` | `rgb(255 255 255 / 0.06)` | 顶部 1px 高光（`inset 0 1px 0`） |
| `--um-glass-shadow` | `0 24px 64px -24px rgb(16 16 20 / 0.24)` | `0 24px 64px -24px rgb(0 0 0 / 0.64)` | 只做一层长投影，不叠光晕 |

降级：`@supports not (backdrop-filter: blur(1px))` 时 `--um-glass-alpha` 提到 `0.96 / 0.94`，视觉退化为实色卡片，不做任何 JS 检测。

**Particle**（数值与 §0.3 的硬约束、§8.5 的实现规格保持一致；三者若有冲突，以 §8.5 为准）

| Token | Light | Dark | 说明 |
|---|---|---|---|
| `--um-particle-color` | `110 86 207`（`#6E56CF` 的 RGB 通道值） | `169 160 255`（`#A9A0FF`） | 以空格分隔的通道值，便于在 canvas 里拼 `rgb(... / a)` |
| `--um-particle-alpha` | `0.08` | `0.14` | 单点不透明度。**极低是刻意的**：粒子应该"察觉得到"而不是"看得清" |
| `--um-particle-size` | `0.6px ~ 1.6px` | 同 | 半径随机但恒定，不做呼吸缩放 |
| `--um-particle-density` | `1 / 22000`（每平方 px） | 同 | `count = min(72, w*h/22000)`，平板 40，移动端 0 |
| `--um-particle-speed` | `2 ~ 6 px/s` | 同 | 每个点初始化时取一次，之后恒定；肉眼是"缓慢星尘漂移" |
| `--um-glow-from` | `rgb(110 86 207 / 0.06)` | `rgb(110 86 207 / 0.05)` | 底层柔光层的 `radial-gradient` 起点色（零 JS，粒子关闭时的兜底视觉） |
| `--um-glow-dots` | `rgb(110 86 207 / 0.03)` | `rgb(255 255 255 / 0.03)` | ≤3% 的点阵遮罩 |

**没有连线 token，因为不画连线。** 距离连线是"科技感粒子网络"的标志性视觉，也是廉价 AI 感的最大来源（§0.3 约束 2）。粒子层只有孤立的点在漂移，这一条不允许在实现阶段"顺手加上"。

---

## 5. 页面结构规划

### 5.1 全局 App Shell（v1.2 · 参考 Outlook 结构 + 单邮箱上下文）

你指定参考 Outlook，我借鉴它的**结构**而不是它的视觉：

- **借鉴**：顶部通栏搜索；搜索下方一条**命令条**（快捷操作）；左侧「收藏夹 + 文件夹树」且带计数；三栏（文件夹 / 列表 / 阅读窗格）；列表内按日期分组（今天 / 本周 / 更早）；阅读窗格位置可切（右侧 / 底部 / 关闭）。
- **不借鉴**：Ribbon 选项卡（文件 / 主页 / 查看 / 帮助）——那是 Office 的历史包袱，与 Linear/Vercel 式克制冲突；Fluent 的彩色图标与蓝色圆角语言；最左侧塞满全家桶的 L 型应用导轨（我们只有一个应用，不需要）。
- **v1.2 新增的不借鉴项**：Outlook 把**每个账户都展开成一个文件夹组**竖排在侧栏里——那是因为 Outlook 假设你有 1~3 个账户。本产品的核心玩法之一就是"开一堆临时邮箱"（`account` 表按 `user_id` 无硬上限，只受角色 `accountCount` 约束，站长可设 0 = 无限），几十上百个邮箱是正常情况。照搬会让侧栏变成一条无限长的手风琴。**改为：侧栏只呈现「当前邮箱」的文件夹，邮箱切换交给顶部的下拉选择器**（你的第 1 点）。

```
┌──────────────┬──────────────────────────┬──────────────────────────────────┐
│ ☰ ⬡ Unicorn  │  🔍 搜索邮件、邮箱、命令  ⌘K │           🔔   ◐   ⚙   (A)      │ 48
├──────────────┴──────────────────────────┴──────────────────────────────────┤
│ ✎ 新邮件 ▾ │ ✓已读  ☆星标  🗑删除  ⧉复制验证码  ⋯   │      ⇅排序  ▤密度  ⊞窗格 │ 44
├──────────────┬──────────────────────────┬──────────────────────────────────┤
│ ┌──────────┐ │ 全部   未读              ▽ │ 您的验证码是 812394        ☆ ⋮ │ 36
│ │◍ a@mail… ⌄│ │ ────────────────────────  │ Stripe  <no-reply@stripe.com>    │
│ └──────────┘ │ 今天                      │ 发至 a@mail.example.com · 14:02  │
│ ⌄ 收藏夹      │ ● Stripe          14:02  │ ──────────────────────────────── │
│   收件箱   12│   您的验证码 [812394] ⧉  │                                  │
│   星标        │ ────────────────────────  │ 验证码  [ 812394 ]   ⧉ 复制      │
│   含验证码    │   GitHub          13:40  │                                  │
│               │   Security alert          │ 邮件正文（Shadow DOM 隔离）      │
│ ⌄ a@mail.ex…  │ ────────────────────────  │ 测量宽度 720px                   │
│   收件箱   12│ 更早                      │                                  │
│   已发送      │   Vercel          周一    │ ┌────────────────────────────┐   │
│   草稿   本机3│   ...                     │ │ 📎 invoice.pdf    248 KB ↓ │   │
│   回收站      │                           │ └────────────────────────────┘   │
│               │                           │ ──────────────────────────────── │
│ + 新建邮箱    │                           │ [↩ 回复] [↪ 转发] [🗑 删除]      │
│ ⚙ 自定义侧栏  │                           │                                  │
└──────────────┴──────────────────────────┴──────────────────────────────────┘
   240px            380px                            flex-1
```

侧栏行数**恒定在 8~11 行**，与用户拥有 3 个还是 300 个邮箱无关。

#### 邮箱切换器 `MailboxPicker`（v1.2 新增 · 你的第 1 点）

**现状的性能问题（实测代码）**：`mail-vue/src/layout/account/index.vue` 是一个独立的整列面板，用 `v-infinite-scroll` 每次拉 30 条（`GET /account/list` 是游标分页，`size` 上限 30），把结果 `push` 进 `accounts` 数组后**全量渲染 `el-card`**，没有虚拟化。每张卡片含 4 个 `Icon` 组件 + 一个 `el-dropdown`。滚到 300 个邮箱时，这一列就是 300 张卡 ≈ 1200+ 个图标组件实例常驻。这正是你担心的那件事，而且它现在就已经存在。

**新方案**：

```
┌──────────────────────────────┐
│ 🔍 搜索邮箱…                 │   ← 自动聚焦，输入即服务端搜索
├──────────────────────────────┤
│ ◉ 全部邮箱（聚合）      1.2k │   ← 映射现有 allReceive 语义
├──────────────────────────────┤
│ 最近                          │
│ ◍ a@mail.example.com  12  📌 │   ← 当前项打勾 + 左侧 2px 紫条
│ ◍ b@mail.example.com     ⋮  │
├──────────────────────────────┤
│ 全部（238）                   │
│ ◍ c@mail.example.com        │   ← 虚拟滚动，滚到底再拉下一页 30 条
│ ◍ d@mail.example.com        │
│ …                            │
├──────────────────────────────┤
│ + 新建邮箱        管理邮箱 →  │
└──────────────────────────────┘
```

| 维度 | 规格 |
|---|---|
| 触发 | 侧栏顶部 36px 的当前邮箱行（点击）· `⌘⇧E` · 命令面板「切换到 …」· 移动端文件夹 Sheet 顶部同一控件 |
| 组件 | Reka UI `Combobox`（不是 `Select`——必须能打字过滤），`Popover` 宽度对齐触发器且 `min-width 320px` |
| 渲染量 | **虚拟滚动**（复用邮件列表那套虚拟化），可见 ≤12 行 + overscan 4 行 = **DOM 里最多 16 个 option**；无论 238 个还是 2380 个邮箱 |
| 数据加载 | 打开时才拉第一页（不在应用启动时预热）；沿用现有游标分页 `accountId + lastSort`，每页 30；滚动到底 + `IntersectionObserver` 续拉 |
| 搜索 | 输入即**服务端**搜索（120ms debounce）。现有 `/account/list` **没有** keyword 参数，需要 §10.5 增量 6（新增方法，不改 `list()`）。本地过滤不够用——只能过滤已加载的那几页 |
| 「最近」分组 | 最近 5 个切换过的邮箱，存用户偏好；`+ 置顶` 复用现有 `PUT /account/setAsTop` |
| 「全部邮箱」 | 一个特殊项，映射现有 `allReceive` 聚合语义（`email-service.list()` 已支持 `allReceive`），选中后列表跨邮箱聚合、命令条的「新邮件」需先选发件邮箱 |
| 每行右侧 | 未读数（仅「最近」组显示，避免为全量列表拉计数）+ `⋮` 菜单（重命名 / 置顶 / 复制地址 / 删除，全部复用现有接口） |
| 键盘 | 打字过滤 · `↑↓` 移动 · `Enter` 切换 · `Esc` 关闭 · `⌘Enter` 在新标签打开该邮箱的收件箱 |
| 空/错 | 无结果时给「未找到，回车创建 `xxx@域名`」（若有 `account:add` 权限）；加载失败给行内重试，不弹 Toast |
| 状态 | 切换即写 `accountStore.currentAccountId`——**这是现有状态**，`views/email/index.vue:57` 已经 watch 它，所以切换逻辑 100% 复用，零后端改动 |
| 持久化 | 现状 `store/account.js` **没有 persist**，刷新后回落到主邮箱。新方案把"最后使用的邮箱"写进用户偏好（§10.5 增量 4），刷新后停在原处 |

**为什么不把邮箱放侧栏（哪怕折叠）**：折叠只省视觉高度，不省渲染——`Collapsible` 的内容默认仍在 DOM 里；就算 `v-if` 掉，组头本身还是 N 行。而下拉是"按需渲染 + 虚拟滚动"，是唯一与邮箱数量解耦的结构。代价是切换多一次点击，用 `⌘⇧E` 与「最近」分组补偿。

**侧栏只放邮件分类**。可放进去的分类必须有真实数据源，逐项核对如下：

| 分类 | 数据源 | 结论 |
|---|---|---|
| 收件箱 | `GET /email/list type=0` | 现成 |
| 已发送 | `GET /email/list type=1` | 现成（`email:send` 权限） |
| 草稿 | Dexie 本地库（`db/db.js`） | 现成，但**仅当前设备**，侧栏标注「本机」 |
| 星标 | `star` 表 + 独立接口 | 现成 |
| 回收站 | 删除是软删除（`email-service.js:140` 置 `is_del=1`），但个人侧没有查询入口；管理员 `all-email` 已支持 `type=delete` | **需新增**一个查询方法（§10.5 增量 2），成本很低 |
| 未读 / 含验证码 / 带附件 | 依赖 §0.5 新增的 `unread` / `hasAtt` 等参数 | 作为「收藏夹」里的保存搜索 |
| 垃圾邮件 | 黑名单邮件在 `email/email.js:53-58` 直接 `message.setReject()`，**根本不入库** | **暂缓**（你已确认，决策 12）：要做必须改收信行为，列 v2 |
| 归档 | 无对应字段 | 不做，列 v2 |

**用户可自定义的范围**

- 入口两个：侧栏底部「⚙ 自定义侧栏」，以及在任意项上右键（`ContextMenu`）。
- 可做的操作：显示 / 隐藏某个分类、拖拽排序（键盘等价 `Alt+↑/↓`）、加入或移出「收藏夹」、把当前的搜索/筛选**另存为收藏夹项**（例如「未读且带附件」）、重命名（仅本地显示名）。
- 默认值：收藏夹 = [收件箱、星标]；当前邮箱组 = [收件箱、已发送、草稿、回收站]。
- **自定义是全局的，不是按邮箱各存一份**（v1.2）：一套顺序/显隐配置作用于所有邮箱。理由——邮箱是临时资源（随时新建/删除），按邮箱存配置会产生永远清不掉的垃圾数据，而且用户换个邮箱就看到不同的侧栏顺序反而是伤害。收藏夹里的保存搜索可以选择"跟随当前邮箱"或"钉死在某个邮箱"，这是唯一的例外。
- 收件箱与已发送**不可隐藏**（隐藏后无处可去），UI 上直接禁用勾选并给出原因 Tooltip。
- 存储：用户偏好 `sidebar: { favorites[], order[], hidden[], savedSearches[] }`，落 `user_setting` 表（§10.5 增量 4，你已确认存库）并用 localStorage 写透，保证首帧不闪。

**计数的真实情况**：`store/ui.js:14` 有一个 `asideCount: {email, send, sysEmail}`，但我全仓检索后确认**它从未被任何地方写入或读取**，是死代码。所以侧栏计数没有现成来源，需要新增 `GET /email/counts`。

- v1.2 收窄了它的职责：**只按当前邮箱取数**（`?accountId=`），返回该邮箱各分类的未读数与草稿数；选中「全部邮箱」时传 `?all=1` 走聚合。原 v1.1 写的"一次返回各邮箱各分类"在有 300 个邮箱时会退化成一次全表扫描，必须去掉。
- `MailboxPicker` 里只给「最近」分组（≤5 个）显示未读数，靠同一个接口的 `?accountIds=1,2,3` 批量形式取；全量列表不显示计数。
- KV 缓存 15s + 收到新邮件时失效。显示规则：未读 > 0 时用 `body-strong` + 数字，= 0 时不显示数字；> 999 显示 `999+`；草稿显示总数（灰色）；回收站不显示数字。

**命令条（44px，你要的"上方快捷操作"）**

| 区 | 内容 | 说明 |
|---|---|---|
| 左 | `✎ 新邮件` primary + `▾` | `▾` 选发件邮箱（多邮箱时才出现），复用 `MailboxPicker` 的同一份列表逻辑 |
| 中 | `✓ 已读/未读` `☆ 星标` `🗑 删除` `⧉ 复制验证码` `⋯` | **常驻但按选择态 `disabled`**，不再像现在这样按条件 `v-if` 突然出现（`email-scroll:12-21`），位置永不跳动 |
| 右 | `⇅ 排序`（时间 / 发件人 / 未读优先）`▤ 密度`（紧凑 44px / 标准 56px / 舒适 72px）`⊞ 阅读窗格`（右侧 / 下方 / 关闭）`⟳ 刷新` | 全部记忆到用户偏好 |

- 上下文操作全部有现成接口：`PUT /email/read`（批量）、`POST /star/add` / `DELETE /star/cancel`、`DELETE /email/delete`（软删）。
- **「移动到 / 归档」不做**：`email` 表没有文件夹字段，只有 `account_id`，跨文件夹移动在当前模型里无法表达。回收站里该组自动变为 `↺ 恢复`（需 §10.5 的一个小增量：按 emailId 置 `is_del=0`）。
- 「标记未读」也需要一个小增量：现有 `read` 服务只能置为已读（`email-service.js:988`），新增一个 `unread` 布尔参数即可。

**Topbar（48px）**

- 左：`☰`（折叠侧栏）+ 20px 单色字标 + 站点名（站长可换 Logo）。
- 中：**通栏搜索**，`max-width 640px`，聚焦时扩到 720px 并浮出结果面板。搜索与命令面板是**同一个入口**：`⌘K` 或 `/` 唤起，输入普通词 = 搜邮件，输入 `>` = 执行命令，输入 `@` = 找邮箱/联系人，输入 `#` = 跳设置项。Outlook 的搜索只搜邮件，我们合并以少记一个快捷键。
- 右：`🔔` 通知（站长公告 + 系统告警）、`◐` 主题、`⚙` **设置中心**（承接管理与开发者，见 §5.2）、头像菜单（身份 + 角色 + **常驻 MiniQuota：今日发信 / 存储两条，见 §5.3.2 与 §6.2** + 切换邮箱（`⌘⇧E`，唤起同一个 `MailboxPicker`）+ 管理后台 / 开发者快捷入口（按权限）+ 退出）。
- **取消面包屑**（v1.0 曾计划放）：三栏结构下当前位置由侧栏选中态表达，面包屑纯属重复。

**折叠与响应**

| 视口 | 侧栏 | `MailboxPicker` | 列表 | 阅读窗格 |
|---|---|---|---|---|
| ≥ 1280 | 240px 展开 | 侧栏顶部整行（地址 + ⌄） | 380px | 右侧 |
| 1024–1280 | 可折叠 56px 图标态（计数降级为小圆点） | 折叠态降级为 32px 头像按钮，Tooltip 给当前地址 | 340px | 右侧 |
| 768–1024 | 默认 56px 图标态 | 同上 | flex | 自动切「下方」 |
| < 768 | 抽屉（Sheet） | 文件夹 Sheet 顶部 + 列表页标题里的 `a@… ▾`（§5.4） | 全屏 | 推入式全屏（§5.4） |

下拉面板本身**在任何视口都保持 320px 起宽**（不随侧栏折叠而变窄），因为它要放地址全文与搜索框。

**相对现状的结构性变化**

| 现状 | 新方案 |
|---|---|
| 侧栏深蓝 `#001529`，白字，`text-color="#fff"` 硬编码 | 侧栏 `bg-subtle`，选中项左侧 2px 紫罗兰指示条 + 6% 底色 |
| 侧栏顶部渐变胶囊（`aside:97` 的 `linear-gradient(135deg,#1890ff,#3a80dd)`） | 20px 单色线性字标 + 站点名 |
| 11 项平铺，管理项与邮件项混在一起 | **只剩邮件分类 5~7 项**；管理（5）、开发者（4）、系统设置（9）全部迁入设置中心 |
| 每项 `margin-left: 18~22px` 各写各的，图标 18/19/20/22/24 五种尺寸 | 统一 16px 图标 + 8px gap + 一套 `SidebarItem` |
| 账号列是浮层（`account/index.vue` 677 行），`v-infinite-scroll` 无虚拟化，N 个邮箱 = N 张 `el-card` × 4 图标常驻 DOM | **顶部 `MailboxPicker` 下拉**（虚拟滚动 + 按需加载 + 服务端搜索，DOM 恒定 ≤16 行）+ `⌘⇧E` + 设置中心的「我的邮箱」页做批量管理 |
| 侧栏按邮箱分组展开（v1.1 曾计划，已推翻） | 侧栏**只显示当前邮箱**的文件夹，行数与邮箱数量解耦 |
| header 60px，`grid-template-columns` 按权限切列数 | Topbar 48px 三区固定，不因权限改变布局 |
| 用户下拉里塞一个 250px 配额 grid | 头像菜单只放身份 + 一条迷你配额；完整配额进设置中心 |
| 无侧栏计数 | 侧栏计数（数据源需新增 `GET /email/counts`） |

**毛玻璃的使用边界（v1.1 收紧）**：顶栏与命令条常驻、三栏各自独立滚动，顶栏永远不会被内容滚过去，所以**取消 v1.0 的"滚动吸附毛玻璃"**。全站毛玻璃只用于 4 处：登录卡片、命令面板、移动端 Sheet、模态遮罩。

### 5.2 路由与 IA 全表（v1.1 重排：邮件区 + 设置中心两个世界）

**IA 的一句话总结**：侧栏世界 = 邮件；`⚙` 世界 = 其他一切（个人 / 开发者 / 管理三组，共用同一个 `SettingsShell`）。

| 新路由 | 旧路由 | 权限 | 说明 |
|---|---|---|---|
| `/login` `/register` | `/login`（单页双态） | — | 拆两个路由，共用 `AuthLayout`（浮动卡片） |
| `/register/bind` | 内嵌弹窗 `showBindForm` | — | LinuxDo 绑定改独立步骤页 |
| `/oauth/callback` | 内嵌在 login | — | 去掉全屏 loading 遮罩 |
| `/mail/inbox` | `/inbox` | — | **登录后默认落地** |
| `/mail/sent` | `/sent` | `email:send` | |
| `/mail/drafts` | `/drafts` | `email:send` | 本地草稿，侧栏标注「本机」 |
| `/mail/starred` | `/starred` | — | |
| `/mail/trash` | 无 | — | 新增（软删数据已存在，见 §10.5） |
| `/mail/search?q=…` | 无 | — | 搜索结果作为一个虚拟文件夹，可另存为收藏夹项 |
| `/mail/:folder/:emailId` | `/message`（无参数） | — | **新增深链能力**，store 仍走快路径 |
| **设置中心 · 账户组** | | | |
| `/settings/account/profile` | `/settings` 局部 | — | 名称、头像、时区 |
| `/settings/account/security` | 无 | — | 改密码 + 最近登录（`user` 表已有 `os/browser/active_ip`） |
| `/settings/account/mailboxes` | `layout/account` 浮层 | `account:query` | 我的邮箱（列表 + 配额 + 全部收信开关） |
| `/settings/account/usage` | 挤在 header 下拉里 | — | 配额与用量（发送额度、邮箱数、存储） |
| `/settings/account/appearance` | 无 | — | 主题、强调色、密度、字号、**背景效果（粒子）**、减少动效 |
| `/settings/account/notifications` | 无 | — | 站内 + TG 推送偏好 |
| `/settings/account/language` | `/settings` 局部 | — | 语言 + 时区（不再 `reload()`） |
| `/settings/account/integrations` | 无 | — | LinuxDo 绑定、TG 绑定 |
| `/settings/account/danger` | `/settings` 局部 | `my:delete` | 注销账号 |
| **设置中心 · 开发者组** | | | |
| `/settings/developer/keys` | 无 | `api-key:query` | API Key 管理 |
| `/settings/developer/logs` | 无 | `api-log:query` | 请求日志 |
| `/settings/developer/playground` | 无 | — | 调试台 |
| `/settings/developer/docs` | 无 | — | 接口索引 + cURL 生成 |
| **设置中心 · 管理组** | | | |
| `/settings/admin/overview` | `/analysis` | `analysis:query` | **管理后台首页**：全站趋势 + 系统状态 + 域名 + 活动 |
| `/settings/admin/users` | `/all-users` | `user:query` | |
| `/settings/admin/roles` | `/role` | `role:query` | |
| `/settings/admin/invites` | `/invite-code` | `reg-key:query` | |
| `/settings/admin/mail` | `/all-mail` | `all-email:query` | 全站邮件（含 `type=delete` 视图） |
| `/settings/admin/domains` | 无（散在设置里） | `setting:query` | 域名健康（MX/SPF/DKIM/DMARC） |
| `/settings/admin/system/:section` | `/system-setting`（2015 行单页） | `setting:query` | 9 个 section：站点/自定义/邮件/存储/推送/人机验证/公告/Workers AI/关于 |
| `/404` | 同 | — | 重设计 |
| — | `/test` | — | 生产构建剔除 |

- **旧路径全部保留为 `redirect` 别名**（`/inbox`→`/mail/inbox`、`/analysis`→`/settings/admin/overview` 等），避免书签与 PWA 快捷方式失效。
- `permsToRouter()` 的映射关系不变，只改目标 path：现有 7 条 perm→route 规则（`perm/perm.js`）逐条改写即可，动态注入机制原样保留。
- **无权限用户看不到分组标题**：设置中心左导航按权限过滤，开发者组/管理组整组消失（不是禁用），普通用户看到的设置中心只有「账户」8 项。
- **当前邮箱不进 URL（v1.2）**：路由里只有文件夹与邮件 id，邮箱上下文放在 `accountStore` + 用户偏好里。理由有三：① 现状就是这样（`views/email/index.vue` watch `currentAccountId`），不改动等于零风险；② 邮箱 id 是数字自增，写进 URL 等于把内部 id 暴露在地址栏并被分享出去；③ 用户的心智是"我在收件箱"，不是"我在 12 号邮箱的收件箱"。
- **深链的邮箱归属自动纠正**：打开 `/mail/inbox/8231` 时，若该邮件不属于当前邮箱，前端读返回体里的 `accountId` **自动切到所属邮箱**并在顶部给一条 `info` 行内提示「已切换到 b@mail.example.com 以显示这封邮件」。不静默切换，也不报错拒绝。

### 5.3 六大页面详细设计

#### 5.3.1 登录 / 注册（v1.1 重做 · 浮动毛玻璃卡片）

v1.0 的「左侧 480px 固定表单 + 右侧品牌区」是很多 SaaS 的标准做法，但你说得对——它仍然是"传统登录页"的骨架。改为**居中浮动卡片**，卡片是有材质的一块玻璃，浮在会动的背景之上。

```
      ░░░ 底层：柔光渐变 +（可选）粒子层 + 站长背景图 ░░░
                                                    ◐ 主题   文A 语言
              ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
              │   毛玻璃卡片  420px · r20         │
              │                                   │
              │   ⬡ Unicorn Mail                  │
              │   登录到你的邮箱                   │
              │                                   │
              │   ┌─────────────────────────────┐ │
              │   │ 邮箱              @域名 ▾   │ │
              │   └─────────────────────────────┘ │
              │   ┌─────────────────────────────┐ │
              │   │ 密码                     👁 │ │
              │   └─────────────────────────────┘ │
              │   [ Turnstile · 固定高度占位 ]     │
              │   ┌─────────────────────────────┐ │
              │   │          登  录             │ │
              │   └─────────────────────────────┘ │
              │   ──────────── 或 ─────────────   │
              │   ┌─────────────────────────────┐ │
              │   │   ◈  使用 LinuxDo 继续      │ │
              │   └─────────────────────────────┘ │
              │                                   │
              │   还没有账号？注册                 │
              └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                    ⓘ 关于 · 服务状态 · 文档
```

**卡片材质（这是这一页的全部重点）**

材质数值**不在这里单独定义**，全部取 §4.12 的 Glass token（一处定义、多处引用，避免同一张卡在两节里写出两套数字）。登录卡只有三处专属偏移：

| 项 | 取值 | 说明 |
|---|---|---|
| 不透明度 | `setting.login_opacity` 覆写 `--um-glass-alpha` | 现有默认 0.88，比其他玻璃面（0.72/0.64）更实——这是**有意的**：登录卡承载表单输入，可读性优先于透感。站长可调 0.55–1.00，1.00 即纯色卡片 |
| 圆角 | 20px（比常规 `radius-lg` 大一档） | 全站唯一一处用 20px 的地方，登录卡需要更"软" |
| 尺寸 | 宽 `min(440px, 100% - 32px)`，垂直居中，内边距 32px | 移动端满宽减 32px |

浅色 / 深色下的底色、模糊、描边、高光、投影一律等于 `--um-glass-*`（Light 白 72% / blur 20px、Dark `#141416` 64% / blur 24px，详见 §4.12 与 §9.5）。

**其余规则**

- **复用现有字段**：`setting` 表已有 `login_opacity`（默认 0.88），正好接管卡片玻璃的不透明度，站长可调 0.55–1.00；调到 1.00 就是纯色卡片（给不喜欢玻璃的站长一个退路）。`background` 字段（站长背景图）作为最底层，上面压一层 scrim 保证文字对比度。
- **兜底**：`@supports not (backdrop-filter: blur(1px))` → 卡片降级为 96% 不透明纯色，视觉退化但完全可用（Firefox 老版本、部分安卓 WebView）。
- **对比度守卫**：玻璃上的正文必须仍 ≥ 4.5:1。做法是卡片不透明度下限 0.55 + 卡片下方 12% scrim + 表单控件本身用不透明底（输入框不做玻璃，只有卡片做）。
- **入场动效**：卡片 `opacity 0→1` + `translateY 8px→0` + `scale .98→1`，240ms `ease-out`；背景柔光延后 120ms 淡入。**禁止**鼠标视差倾斜、禁止边框流光——那是廉价感的两个典型来源。
- 域名后缀选择器：现状是把 `el-select` 透明绝对定位覆盖在 append 上再手动 `toggleMenu()`（`login/index.vue:22-39`，一个明显的 hack）。新方案用 `Combobox` 原生实现输入框内嵌后缀选择。
- Turnstile 容器**预留固定高度**（当前 `v-show` 切换导致布局跳动）。
- 注册页：同一张卡片，字段多时**卡片内滚动**而不是整页滚动；新增密码强度条、邀请码「可选/必填」的显式说明（现状仅靠 placeholder 区分 `regKey===0/2`）。
- LinuxDo OAuth 绑定弹窗（`showBindForm`）改为独立步骤页 `/register/bind`，避免弹窗内再嵌表单。
- 卡片右上角外侧放**主题**与**语言**切换——登录前也要能切，现状做不到。
- 键盘：`Enter` 提交、`Tab` 顺序显式声明、自动聚焦第一个空字段；移动端卡片宽度 `100% - 32px`，键盘弹出时卡片上移而不是被遮挡。
- 删除现有的 `#background-wrap .x1-.x5` 云朵动画（`login/index.vue:3-9`）与登录页 3 秒背景预载超时逻辑（`router/index.js` 的 `loadBackground()`）——后者会让首屏白等 3 秒，改为背景图异步淡入、不阻塞表单。

#### 5.3.2 概览（v1.2 · 一拆二已确认，决策 15）

侧栏只放邮件分类之后，v1.0 的「概览」一级入口没有了。它按受众拆成两块，各归其位：

| 原「概览」内容 | 去处 | 可见性 |
|---|---|---|
| 我的今日收/发、发送配额、邮箱数、存储占用 | 设置中心 → 账户 → **用量与配额**（`/settings/account/usage`）；同时在**头像菜单**里常驻一条迷你配额，零点击可见 | 所有人 |
| 全站趋势、系统状态、域名健康、最近活动 | 设置中心 → 管理 → **概览**（`/settings/admin/overview`），即管理后台首页 | `analysis:query` |

下面的线框是**管理后台首页**；账户侧的「用量与配额」只取前两张卡 + 一条 15 天曲线，不含系统状态。

```
概览                                              [今日 ▾] [⟳]
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 今日收信     │ 今日发送     │ 我的邮箱     │ 存储占用     │
│ 24          │ 3 / 50      │ 7 / 20      │ 128 MB      │
│ ▁▂▄▇▅▃▂ 15d │ ▇▇▇░░░ 6%   │ ●●●●●●●○○○  │ ▇▇▇░░ 12%   │
└─────────────┴─────────────┴─────────────┴─────────────┘
┌───────────────────────────────┬───────────────────────┐
│ 收发趋势（15 天）              │ 系统状态               │
│  ╱╲   ╱╲                      │ ● D1        12ms      │
│ ╱  ╲_╱  ╲__╱                  │ ● KV        8ms       │
│ ── 收 ── 发                    │ ● R2        正常       │
│                               │ ● Resend    正常       │
│                               │ ◐ Workers AI 未配置    │
│                               │ ● Turnstile 正常       │
├───────────────────────────────┼───────────────────────┤
│ 域名状态                       │ 最近活动               │
│ mail.example.com              │ 14:02 收到 3 封邮件    │
│  MX ✓  SPF ✓  DKIM ✓  DMARC ⚠ │ 13:40 API 调用 /list  │
│ alt.example.com               │ 12:11 新增邮箱 a@…     │
│  MX ✓  SPF ⚠ 缺 include      │ 11:58 用户注册 b@…     │
└───────────────────────────────┴───────────────────────┘
```

- 4 张 `StatCard`（`number` / `gauge` / `trend` 变体）+ 2 张图 + 2 张列表。
- **配额用 gauge/dots 而不是 `3/50` 纯数字**——把 `header/index.vue:98-157` 那段 60 行的 `sendType`/`sendCount` computed 逻辑收进 `useQuota()` composable，界面上变成一条进度条 + 一句人话（「今日还可发送 47 封」/「不限量」/「未授权」）。
- 图表复用现有 ECharts 实例与 `analysis/echarts` 数据结构，只换主题（`echarts/index.js` 注入 token 色板 + `grid` 去边框 + 去 tooltip 阴影）。
- 系统状态 / 域名状态 / 最近活动依赖新增后端（§10.5）；**未配置的能力显示为 `◐ 未配置` 而不是红色错误**。
- 状态点语义：`●` 绿=正常 / `◐` 灰=未配置 / `▲` 黄=降级 / `✕` 红=故障。带 `aria-label`，不单靠颜色传达。

#### 5.3.3 邮件（列表 + 阅读 · v1.1 按 Outlook 结构重排）

三栏骨架见 §5.1。本轮相对 v1.0 的四处变化：**①分类全部移到侧栏**（列头不再有 `全部/未读/星标/附件/验证码` 那排 Segmented）；**②搜索移到 Topbar 通栏**；**③批量操作移到顶部命令条**（移动端仍保留底部 ActionBar，因为拇指可达性）；**④列表按日期分组并吸顶**。

```
列表列内部（380px）                          阅读窗格：右侧 / 下方 / 关闭
┌────────────────────────────┐
│ 全部  未读        ▽筛选  ⇅ │ ← 列头 36px：只留视图控制，分类在侧栏
│ ────────────────────────── │
│ 今天                       │ ← 日期分组，sticky 吸顶
│ ☐ ● Stripe          14:02 │
│     您的验证码 [812394] ⧉  │
│     Your verification co…  │
│ ────────────────────────── │
│ ☐   GitHub          13:40 │
│     Security alert     📎  │
│ ────────────────────────── │
│ 本周                       │
│ ☑   Vercel          周一   │
│ ☑   Railway         周日   │
│ ────────────────────────── │
│ 更早                       │
│     ...                    │
└────────────────────────────┘
  已选 2 项 → 顶部命令条中段点亮，列头左侧出现「已选 2 项 · 取消」
```

- **不做 Outlook 的「重点 / 其他」**：那需要一个重要性判定模型，我们没有，硬做出来只会误导。改为诚实的「全部 / 未读」两段。
- **密度三档**（紧凑 44 / 标准 56 / 舒适 72px），切换后虚拟列表 `itemHeight` 同步——现有 `UseVirtualList` 已按 `itemHeight` 工作（`email-scroll/index.vue`），只需把常量提成响应式。
- **日期分组**在虚拟列表里的实现：把分组头作为列表数据的一种 item 类型参与虚拟化（不能用 CSS `position:sticky` 直接套在虚拟容器里），分组头高 28px 计入 `itemHeight` 计算。
- **「全部邮箱」聚合态下多一行信息（v1.2）**：当 `MailboxPicker` 选中「全部邮箱」时，`MailRow` 的时间左侧追加一枚 `micro` 尺寸的收件邮箱 Chip（截断到 12 字符，Tooltip 全称），否则不显示——单邮箱视图里每行都写同一个地址是纯噪音。此态下命令条的「新邮件」必须先选发件邮箱（`▾` 自动展开）。

**改进点（对应你列的 6 项）**

1. **邮件列表**：保留现有 `UseVirtualList` 虚拟滚动与增量拉取逻辑（`email-scroll/index.vue`），重写行组件为 `MailRow`：三行结构（发件人+时间 / 主题 / 摘要），未读用 `body-strong` + 6px 圆点（不再改 `font-weight: bold` 导致的行高抖动），验证码升级为可点击复制的 `Badge`（现有 `item.code` 能力）。
2. **搜索**（v1.1 位置改到 Topbar）：`⌘K` 或 `/` 聚焦顶部通栏搜索；输入即本地 Dexie 命中最近 500 封（即时出结果面板），300ms debounce 后请求服务端新增的 `keyword` 参数；支持 `from:`、`has:att`、`is:unread`、`after:2026-08-01` 语法糖，解析为普通 query 参数。回车 → 进入 `/mail/search?q=…`，结果作为一个虚拟文件夹展示，可「另存为收藏夹项」。
3. **筛选**（v1.1 位置改到列头漏斗）：分类已在侧栏，列头只留 `▽ 筛选` Popover（未读、星标、带附件、含验证码、时间范围、发件人、目标邮箱）与 `⇅ 排序`。筛选态写入 URL query，可分享、可后退；有筛选生效时列头显示一枚可一键清除的 Chip。
4. **标签**：数据模型不支持真标签（§0.5），首版以上述智能筛选器覆盖 90% 场景；v2 再加 `email_label` 表。
5. **批量操作**（v1.1 位置改到顶部命令条）：勾选后命令条中段从 `disabled` 点亮，列头左侧出现「已选 N 项 · 取消」。支持 `x` 勾选、`Shift+x` 区间、`a` 全选、`Esc` 取消。删除走乐观更新 + Toast「已删除 3 封 · 撤销」（撤销 = 回收站恢复）。**移动端例外**：仍用底部浮出的 ActionBar，顶部命令条在窄屏折叠为 `⋯`。
6. **阅读体验**：`shadow-html` 的 Shadow DOM 隔离保留并加固（注入 reset + 强制 `img{max-width:100%}` + 深色模式下不反转邮件正文，仅调容器）；远程图片默认阻断并给出「显示图片」条；正文测量宽度 720px；附件区改为文件卡片（类型图标 + 大小 + 下载）；`[`/`]` 上下封切换；`r` 回复。**阅读窗格位置三态**（右侧 / 下方 / 关闭）记忆在用户偏好里：右侧适合宽屏扫读，下方适合读长信，关闭则是「列表全宽 + 点开进详情页」，接近现在的行为，给习惯旧版的人一条退路。

#### 5.3.4 我的邮箱（v1.2 位置：设置中心 → 账户 → 我的邮箱）

把现在的浮层账号列拆成**两层职责**：`MailboxPicker` 负责"切到哪个邮箱"（高频、轻量、虚拟滚动，§5.1）+ 本页负责"管理这些邮箱"（低频、重量、增删改、配额、开关）。下面线框里的**域名段移到管理组** `/settings/admin/domains`。

**不能因为进了设置中心就变远**，所以留三条近路：`MailboxPicker` 底部的 `+ 新建邮箱`（`account:add` 时显示）与「管理邮箱 →」、头像菜单里的「我的邮箱」。

```
我的邮箱                                    [+ 新建邮箱]  ⌘⇧E 快速切换
┌──────────────────────────────────────────────────────────────────┐
│ 已用 7 / 20                    ●●●●●●●○○○○○○○○○○○○○               │
└──────────────────────────────────────────────────────────────────┘
🔍 搜索邮箱…                                    [全部 ▾] [排序 ⇅]
┌────────────────┬──────────┬────────┬───────┬──────────┬─────────┐
│ 邮箱            │ 名称      │ 收信   │ 未读  │ 最近活动 │         │
├────────────────┼──────────┼────────┼───────┼──────────┼─────────┤
│ a@mail.ex.com  │ 主邮箱    │ 全部 ✓ │ 12    │ 2 分钟前 │ ⧉  ⋮   │
│  主账号 · 置顶  │          │        │       │          │         │
│ b@mail.ex.com  │ 注册用    │ —      │ 0     │ 3 天前   │ ⧉  ⋮   │
└────────────────┴──────────┴────────┴───────┴──────────┴─────────┘

域名                                                （管理员可见）
┌──────────────────────────────────────────────────────────────────┐
│ mail.example.com    ● 正常   MX ✓ SPF ✓ DKIM ✓ DMARC ⚠  [查看]   │
│ alt.example.com     ▲ 降级   MX ✓ SPF ⚠ 缺 include      [修复]   │
└──────────────────────────────────────────────────────────────────┘
```

- 「全部收信」这个开关现在是一个黄色/蓝色的彩色图标（`account/index.vue:16-17`），语义完全靠猜。改为列内明确的 `Switch` + 「接收本域全部未匹配邮件」说明 + 互斥提示（只能一个账号开启，现有逻辑保留）。
- 配额从数字变为 dots 进度 + 「还可创建 13 个」。
- **本页也必须虚拟化 + 服务端搜索**（v1.2）：`DataTable` 走 `TanStack Virtual`，沿用现有游标分页每页 30 + 搜索用 §10.5 增量 6。300 个邮箱时表格 DOM 行数恒定 ≤ 20。这是现状 `account/index.vue` 最大的性能债，不能平移过来。
- 支持多选批量操作（批量删除 / 批量重命名前缀），复用现有单条接口串行 + 失败逐条回滚提示。
- 新建邮箱弹窗：前缀最小长度校验、域名 Combobox、Turnstile 高度预留，输入即校验（现状是提交后 4 个 `ElMessage` 依次拦截）。
- 域名卡片的 DNS 校验结果点击展开，给出**可复制的建议 DNS 记录**。
- `⌘⇧E` 在任何页面都能唤起 `MailboxPicker`，选中后跳回 `/mail/inbox`。

#### 5.3.5 开发者中心（v1.1 位置：设置中心 → 开发者）

参考 Cloudflare API Tokens 页。四项内容：**API Keys / 请求日志 / 调试台 / 文档**——它们是设置中心左导航「开发者」分组下的 4 个条目，**不再做成页内 Tab**（左导航 + 页内 Tab 双层导航是冗余，只留一层）。

```
开发者                                                    [+ 创建 Key]
API Keys │ 请求日志 │ 调试台 │ 文档
┌──────────────────────────────────────────────────────────────────┐
│ 名称        │ 前缀        │ 权限          │ 最近使用 │ 状态 │     │
├─────────────┼─────────────┼───────────────┼──────────┼──────┼─────┤
│ CI 取信     │ um_live_7f… │ email:read    │ 2 分钟前 │ ●    │ ⋮   │
│ 批量建号    │ um_live_a2… │ user:write    │ 3 天前   │ ●    │ ⋮   │
│ 旧脚本      │ um_live_c9… │ email:read    │ 90 天前  │ ○停用│ ⋮   │
└─────────────┴─────────────┴───────────────┴──────────┴──────┴─────┘

创建后一次性展示（Dialog）：
┌──────────────────────────────────────────────────────────────────┐
│ ⚠ 此密钥只显示一次                                                │
│ ┌──────────────────────────────────────────────────────┐  ⧉ 复制 │
│ │ um_live_7f3a9c2b8e1d4056a7b9c3e5f8012345             │        │
│ └──────────────────────────────────────────────────────┘        │
│ curl -H "Authorization: Bearer um_live_…" \                      │
│   https://mail.example.com/open/email/list?size=20    ⧉ 复制     │
└──────────────────────────────────────────────────────────────────┘
```

- **创建流程**：名称 → 权限勾选（scopes，映射到现有 perm key 体系）→ 过期时间（30/90/365/永不）→ 一次性展示明文 + cURL。密钥只存 `salt+hash`（复用 `crypto-utils`），列表只显示前缀。
- **请求日志**：虚拟列表 + 行展开显示请求/响应摘要；筛选（Key、路径、状态码、时间范围）；状态码用语义色点；`2xx/4xx/5xx` 分组统计条在顶部。
- **调试台**：纯前端。左侧选择接口（从内置 OpenAPI 描述表生成）、填参数、选 Key；右侧显示响应 JSON（折叠树）+ 耗时 + 等价 cURL / JS fetch / Python requests 三种代码片段。**默认不发真实请求，需显式点「发送」**，且对写操作（建号、发信）二次确认。
- **文档**：内置接口索引（method + path + 参数表 + 示例），并链接外部部署文档 `doc.skymail.ink`。同时**标注 `/public/*` 为 Deprecated**，引导迁移到 `/open/*` + Bearer Key。
- 兼容：现有 `/public/genToken` 全局单令牌保留可用（标记弃用），新体系并行。

#### 5.3.6 设置中心（v1.1 扩为三组，承接所有非邮件功能）

Linear 式：左侧 220px 分组导航 + 右侧 max 720px 内容列，每个 section 独立路由、独立保存态。**这是本轮 IA 调整的落点**——侧栏腾出去的东西全在这里。

```
设置                                                  ⌘K 搜索设置项
┌──────────────┬──────────────────────────────────────────────────┐
│ 账户          │  外观                                            │
│  个人资料     │                                                  │
│  安全         │  主题  ┌────────┐┌────────┐┌────────┐            │
│  我的邮箱     │       │ ☀ 浅色 ││ ☾ 深色 ││ ⚙ 跟随 │            │
│  用量与配额   │       └────────┘└────────┘└────────┘            │
│  外观 ●       │                                                  │
│  通知         │  强调色   ● ● ● ● ●       （站长可锁定）          │
│  语言与时区   │  界面密度 ( )紧凑 (•)标准 ( )舒适                 │
│  集成         │  字号     ( )小 (•)标准 ( )大                     │
│  危险操作     │  减少动效 [ ]  （默认跟随系统）                    │
│               │                                                  │
│ 开发者        │  背景效果                                         │
│  API Keys     │  ( ) 关闭   (•) 柔光   ( ) 柔光 + 粒子            │
│  请求日志     │  ⓘ 移动端自动只保留柔光                            │
│  调试台       │  ⓘ 站长当前设置为「用户自选」                       │
│  文档         │                                                  │
│               │                                                  │
│ 管理          │                                                  │
│  概览         │                                                  │
│  用户         │                                                  │
│  角色权限     │                                                  │
│  邀请码       │                                                  │
│  全站邮件     │                                                  │
│  域名         │                                                  │
│  系统 ▸       │  ← 展开 9 项：站点 / 自定义 / 邮件 / 存储 / 推送 / │
│               │     人机验证 / 公告 / Workers AI / 关于           │
└──────────────┴──────────────────────────────────────────────────┘
      220px                       内容列 max 720px
```

- **分组按权限整组显示/隐藏**：普通用户只看到「账户」8 项，看不到「开发者」「管理」两个标题。
- 现有 2015 行的 `sys-setting` 9 张卡片 → 9 个 section 路由，**逐张卡片 1:1 搬迁**（站点/自定义/邮件/OSS/推送/Turnstile/公告/Workers AI/关于），字段与提交逻辑不变；新增「背景效果」策略字段挂在「自定义」section 下。
- 个人设置从 296 行 3 个区块扩为 8 个 section：个人资料、安全（改密码 + 最近登录设备，`user` 表已有 `os/browser/active_ip`）、我的邮箱、用量与配额、外观、通知、语言与时区、集成、危险操作。
- 表单模式统一：**每个 section 底部固定「保存」条，仅在有变更时浮出**（现状是每张卡片各自一个保存按钮，且部分即时生效）。
- `⌘K` 在设置中心内可直接搜设置项（输入 `#` 前缀全站可用），解决「9 张卡片 60 多个字段找不到」的问题。
- 移动端：左导航变成一级列表页，点击推入二级内容页（§5.4）。
- 语言切换不再 `window.location.reload()`（`setting/index.vue:125-134`），改为 `i18n.locale` 热切换 + dayjs locale 同步。

### 5.4 移动端 IA（独立设计，非缩放）

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ ☰ 收件箱 · a@… ▾  ⌕ │   │ ←  Stripe       ☆ ⋮ │   │ ═══════════════════ │
│ 全部  未读        ▽ │   │ 您的验证码是 812394  │   │ ┌─────────────────┐ │
│ ─────────────────── │   │ no-reply@stripe.com │   │ │◍ a@mail.ex…   ⌄│ │
│ 今天                │   │ 14:02               │   │ └─────────────────┘ │
│ ● Stripe      14:02 │   │ ─────────────────── │   │  ⌄ 收藏夹           │
│   验证码 [812394] ⧉ │   │                     │   │    收件箱        12 │
│ ─────────────────── │   │  正文               │   │    星标             │
│   GitHub      13:40 │   │                     │   │  ⌄ a@mail.ex…       │
│   Security alert    │   │                     │   │    收件箱        12 │
│ ─────────────────── │   │                     │   │    已发送           │
│   ...               │   │                     │   │    草稿      本机 3 │
│                     │   │ ─────────────────── │   │    回收站           │
│              ✎      │   │  ↩ 回复    🗑 删除   │   │  ─────────────────  │
│ ─────────────────── │   └─────────────────────┘   │  ⚙ 自定义           │
│  ✉     ⌸     ⚙     │                             └─────────────────────┘
│ 邮件   邮箱   设置   │                                 Bottom Sheet
└─────────────────────┘                              (vaul-vue, 手势关闭)
```

- **底部 Tab 改为 3 项（v1.1）**：邮件 / 邮箱 / 设置。「概览」不再是 tab（已拆进设置中心，§5.3.2）；开发者与管理在「设置」里。三项都落在拇指热区，比四项更好点。
- **文件夹切换用 Sheet，不用侧滑抽屉**：点顶部标题条（`☰` 或当前文件夹名）从底部升起「文件夹 Sheet」，内容与桌面侧栏完全一致（含自定义入口）。不做左侧滑抽屉——它与系统返回手势天然冲突，现状 `main/index.vue:126-144` 那套 `translateX(-100%)` 抽屉正是这个问题。
- **邮箱切换器在移动端有两个入口（v1.2）**：① 文件夹 Sheet 顶部的当前邮箱行（点击后**在同一个 Sheet 内二级推入**邮箱列表，不叠第二层 Sheet——叠层 Sheet 的手势关闭会打架）；② 列表页顶部标题里的 `a@… ▾`。移动端列表同样虚拟滚动，`min-height 48px` 满足触控目标。
- **推入式导航**：列表 → 详情为整页横向推入（`motion-v`，240ms），返回手势与浏览器后退一致。
- **Bottom Sheet 承载**：文件夹、筛选、邮箱切换、批量操作、更多菜单（`vaul-vue`，支持拖拽关闭、snap points）。
- **写信**：全屏页而不是弹窗（现状 `layout/write` 788 行的弹窗在移动端极难用）；富文本工具条吸附在键盘上方，折叠为一行。
- **虚拟列表行高**：移动端 88px（两行 + 摘要），紧凑档 72px。
- **触控目标** ≥ 44×44；滑动手势：左滑删除（进回收站，带 undo Toast）、右滑标记已读。**不做「归档」手势**——没有归档字段（§5.1）。
- `env(safe-area-inset-*)` 全面适配；PWA `theme-color` 随主题切换（复用现有 `switchDark` 中的逻辑）。

---

## 6. 组件设计规范

### 6.1 组件清单（三层）

**L1 Primitive（21 个，全部基于 Reka UI 无样式原语 + cva 变体）**

| 组件 | Reka UI 基座 | 替换掉的 EP 用法 |
|---|---|---|
| `Button` | 原生 `<button>` | `el-button` ×71 |
| `Input` / `Textarea` / `NumberInput` | 原生 / `NumberField` | `el-input` ×45, `el-input-number` ×11 |
| `Select` / `Combobox` | `Select`, `Combobox` | `el-select` ×26 + `el-option` ×53 |
| `Checkbox` / `Radio` / `Switch` | `Checkbox`, `RadioGroup`, `Switch` | ×3 / ×2 / ×13 |
| `TagsInput` | `TagsInput` | `el-input-tag` ×10 |
| `Dialog` / `AlertDialog` | `Dialog`, `AlertDialog` | `el-dialog` ×30, `ElMessageBox` |
| `Sheet`（移动端） | `vaul-vue` | 现有 fixed+translateX 抽屉 |
| `DropdownMenu` / `ContextMenu` | 同名 | `el-dropdown` ×8 + `el-dropdown-item` ×31 |
| `Popover` / `Tooltip` / `HoverCard` | 同名 | `el-popover` ×1, `el-tooltip` ×14 |
| `Tabs` / `Segmented` | `Tabs`, `ToggleGroup` | `el-radio-group/button` ×7 |
| `Collapsible` | `Collapsible` | 无（侧栏「收藏夹 / 当前邮箱」分组折叠新增） |
| `Badge` / `Avatar` / `Separator` | `Avatar`, `Separator` | `el-tag` ×23, `el-avatar` ×3 |
| `Progress` / `Meter` | `Progress` | 自制 |
| `Skeleton` | 自制 | `el-skeleton` ×8 + `el-skeleton-item` ×13 |
| `ScrollArea` | 原生 + 自定义滚动条 | `el-scrollbar` ×9 |
| `Toast` | `vue-sonner` | `ElMessage` ×87, `ElNotification` |
| `Command` | Reka `Listbox` + 自制过滤 | 无（新增） |
| `Tree` | `TreeRoot` | `el-tree` ×1（权限树） |
| `DatePicker` | `Calendar` + `Popover` | `el-date-picker` ×2 |
| `Pagination` | `Pagination` | `el-pagination` ×3 |
| `Kbd` / `Code` / `CopyButton` | 自制 | 无（新增） |
| `VisuallyHidden` / `FocusRing` | Reka | 无（a11y 新增） |

**L2 Composite（17 个 · v1.1 新增 5 个）**
`AppShell` · `Sidebar` · `SidebarItem` · **`SidebarGroup`** · `Topbar` · **`CommandBar`** · **`SettingsShell`** · `PageHeader` · `SectionCard` · `DataTable` · `EmptyState` · `ErrorState` · `StatCard` · `StatusDot` · `SaveBar` · **`GlassCard`** · **`ParticleField`**

**L3 Domain（18 个 · v1.1 新增 4 个 · v1.2 把 `AccountSwitcher` 明确为 `MailboxPicker`）**
`MailList`（虚拟） · `MailRow` · `MailReader` · `MailComposer` · `AttachmentCard` · **`FolderTree`** · **`SidebarCustomizer`** · **`MailboxPicker`** · `AccountCard` · `DomainHealthCard` · `QuotaMeter` · **`MiniQuota`** · **`SavedSearchItem`** · `ApiKeyTable` · `ApiKeyCreateDialog` · `RequestLogTable` · `CodeSnippet` · `ActivityTimeline`

### 6.2 关键组件规范

#### Button

| variant | 静态 | hover | active | focus-visible |
|---|---|---|---|---|
| `primary` | `bg accent-solid` / `fg on-accent` | `bg accent-hover` | `bg accent-active` | + ring 2px `border-focus` offset 2 |
| `secondary` | `bg surface` / `border border-strong` / `fg default` | `bg bg-hover` | `bg bg-active` | 同上 |
| `ghost` | 透明 / `fg muted` | `bg bg-hover` + `fg default` | `bg bg-active` | 同上 |
| `danger` | `bg danger-solid` / `fg #fff` | 提亮 8% | 压暗 8% | ring danger |
| `link` | 无底 / `fg accent-fg` | 下划线 | — | 同上 |

尺寸：`sm 28px / px-10 / label 13` · `md 32px / px-12 / label 13` · `lg 38px / px-16 / body 14` · `icon 32×32`。
`loading` 态：图标位替换为 12px spinner，文字保留，宽度不跳动，`aria-busy="true"`，禁止重复提交。
过渡：`background-color 120ms ease-standard`。**不做位移、不做缩放。**

#### DataTable（替换 6 处 `el-table`）

- 结构：`<table>` 语义 + `thead` `sticky top-0` + `bg-surface/85 backdrop-blur`。
- 行高 44/36（跟随密度），行间 1px `border-default`，**无竖向网格线**。
- hover 整行 `bg-hover`；选中 `bg-selected` + 左侧 2px accent 条。
- 列：支持 `sortable`（点击表头，箭头仅在 hover/激活时显示）、`sticky`（首列）、`align`、`width`、`truncate`、`cell` 插槽。
- 选择：表头 tri-state 复选框，`Shift+click` 区间选择，选中后浮出 `ActionBar`。
- 键盘：`↑/↓` 移动行焦点，`Space` 选中，`Enter` 打开，`Home/End` 首尾。
- 状态：`loading`（骨架行 ×8）、`empty`（`EmptyState`）、`error`（`ErrorState` + 重试）。
- 响应式：`<md` 自动降级为 `CardList`（每行变成一张卡片，主字段 + 键值对），**这是「移动端重新设计」在表格上的落点**。

#### MailRow

```
[☐] [☆]  Stripe                                          14:02
         您的验证码是 812394   [验证码 812394 ⧉]
         Your verification code for signing in to…      📎 2
```
- 三行网格：`grid-template: auto auto / 20px 20px 1fr auto`。
- 未读：`body-strong` + 主题色 6px 圆点（前置于主题），**不改字重以外的任何几何**。
- 验证码 `Badge`（`accent subtle`）点击复制并 Toast，`stopPropagation`。
- 星标：hover 才显示空心星，已加星常显实心（`accent`，不用彩色图标）。
- 右键 → `ContextMenu`（标记已读/未读、星标、删除、复制发件人、在新标签打开）。取代现有 `rightChecked` + 硬编码 `#FDF6EC` 背景。
- 摘要文本 `line-clamp: 1`，`fg-muted`（`fg-subtle` 已按 P1 修订降级为非文本专用）。
- 行高 44px（桌面标准）/ 36px（紧凑）/ 88px（移动）。

#### CommandPalette

- `⌘K` / `Ctrl+K` 唤起；`Esc` 关闭；输入即模糊过滤（自实现 fuzzy，无需额外依赖）。
- 分组顺序：**动作 → 导航 → 邮件搜索结果 → 设置项**。空输入时显示「最近访问」+ 5 个高频动作。
- 每项右侧显示快捷键 `Kbd`；`↑↓` 移动，`Enter` 执行，`Tab` 进入子命令（如「切换到邮箱 →」）。
- 邮件搜索结果异步注入（Dexie 即时 + 服务端 debounce 300ms），带 loading 行。
- 尺寸 `640×min(420, 60vh)`，`bg-raised` + `shadow-lg` + `radius-lg`，遮罩 `bg-overlay` + `backdrop-blur(4px)`。
- 进入动画：`opacity 0→1` + `scale .98→1`，160ms `ease-out`。退出 120ms。

#### Toast（替换 87 处 ElMessage）

- 位置：桌面右下、移动端顶部（避开底部 Tab）。最多堆叠 3 条，其余排队。
- 类型：`success`（2.5s）/ `error`（4s，可手动关闭）/ `warning`（3s）/ `info`（2.5s）/ `loading`（受控）。
- **带 action 的 Toast 是撤销的唯一载体**：删除、归档、批量操作后出现「撤销」按钮，5s 窗口。
- 网络/鉴权错误不再走 Toast 洪水：`axios` 拦截器聚合同类错误（同 code 1s 内只弹一次），401 直接跳登录并给一条说明。

#### EmptyState / ErrorState / Skeleton

- `EmptyState`：24px 线性图标（`fg-subtle`）+ 标题（`title`）+ 一句说明（`fg-muted`）+ **一个主行动按钮**。禁止使用 `el-empty` 的默认插画。
  - 收件箱空 → 「还没有邮件」+「复制我的邮箱地址」
  - 搜索无结果 → 「没有匹配 “xxx” 的邮件」+「清除筛选」
  - 无 API Key → 「创建第一个 Key」+ 文档链接
- `Skeleton`：形状必须与真实内容同尺寸同位置（避免 CLS）；动画为 1.6s 的 `background-position` 微光，浅色 `gray-100→gray-50`，深色 `#1A1A1D→#141416`；`prefers-reduced-motion` 下静态。
- 首屏 `index.html` 内联骨架（复用现有 `loading-first` 移除机制，`router/index.js:176-183`），避免白屏。

#### FolderTree / SidebarItem（v1.1 新增）

```
SidebarItem: h 32px · pl 12 + icon16 + gap8 + label + 右侧计数
  default   : fg-muted, 无底
  hover     : bg-hover, fg-default
  selected  : bg-selected(6% 紫) + 左侧 2px accent 指示条 + fg-default + body-strong
  dragging  : opacity .5 + 目标位置 1px accent 插入线
  collapsed : 只剩 16px 图标居中，计数降级为右上角 6px 圆点，Tooltip 显示全名
```

- 结构：`nav > ul > li`，分组用 `Collapsible`，选中项 `aria-current="page"`，计数用 `<span aria-label="12 封未读">`。
- 计数不参与点击热区计算，`tabular-nums` 对齐。
- 拖拽排序：Pointer Events 实现（不引依赖），键盘等价 `Alt+↑/↓`，每次落位后即时保存偏好并 Toast「侧栏已更新 · 撤销」。
- 空态：某分类无邮件时不隐藏该项（隐藏会让人以为功能没了），只是不显示计数。
- **v1.2**：`FolderTree` 只渲染两组——「收藏夹」与「当前邮箱」，组头文案取当前邮箱地址（`text-overflow: ellipsis`，Tooltip 给全称）。切换邮箱时**只重取计数与列表，不重建树**（`key` 不绑 `accountId`，避免整棵树掉帧闪一下）。

#### MailboxPicker（v1.2 新增）

```
Trigger（侧栏顶部，h 36px，w 100%-16）
  ┌────────────────────────────────┐
  │ ◍  a@mail.example.com       ⌄ │   ← avatar12 + 地址(truncate) + chevron
  └────────────────────────────────┘
  default : bg-surface + border-default
  hover   : bg-hover
  open    : border-focus + chevron 旋转 180°（160ms）
```

- 基座：Reka UI `ComboboxRoot`（`Popover` + `ListboxRoot` 组合），**不用 `Select`**——`Select` 不支持输入过滤。`Popover` `align="start"` `sideOffset=4`，宽度 `max(trigger, 320px)`，`max-height: min(60vh, 480px)`。
- Props：`modelValue: number`（`accountId`，`0` = 全部邮箱）、`showAggregate: boolean`、`showManageLink: boolean`（按 `account:add` / 路由权限）、`placement`。
- **虚拟滚动是硬性要求**：与 `MailList` 共用同一个虚拟化 composable（`useVirtualList`，行高固定 36px，overscan 4）。验收线：DOM 里的 option 节点数 ≤ 16，与总数无关。
- 数据层 `useMailboxes()`：
  - 首次打开才请求（不在 `AppShell` 挂载时预热），`GET /account/list?size=30`；滚动到倒数第 4 项时用现有游标（`lastSort` + `accountId`）续拉下一页。
  - 输入 ≥1 字符 → 走 `GET /account/search?keyword=&size=20`（§10.5 增量 6），120ms debounce，输入变化时 `AbortController` 取消上一发。
  - 结果按 `[全部邮箱] → [最近 ≤5] → [全部]` 三段渲染，搜索态只渲染一段扁平结果并高亮匹配子串。
  - 缓存 60s；执行新建 / 删除 / 重命名 / 置顶后失效。
- 每行：`avatar12`（地址首字母，色相由 `accountId` 哈希，饱和度压到 12% 以免变彩虹）+ 地址 + 未读 Badge（仅「最近」段）+ `⋮` 菜单 + 当前项 `Check` 图标与左侧 2px accent 条。行高 36px，移动端 48px。
- 状态四态齐备（§7.8）：加载 = 6 行 shimmer；空（无搜索结果）= 「未找到 `xxx`」+ 「创建 `xxx@域名`」按钮（有权限时）；错误 = 行内一行「加载失败，重试」；无邮箱 = 「你还没有邮箱」+ 新建 CTA。
- 键盘/a11y：`role="combobox"` + `aria-expanded` + `aria-activedescendant`；`↑↓` 移动、`Home/End` 首尾、`Enter` 选中、`Esc` 关闭并回焦 Trigger、`⌘Enter` 新标签打开；焦点锁在 Popover 内；选中后向 `aria-live="polite"` 播报「已切换到 a@mail.example.com」。
- 选中副作用：写 `accountStore.currentAccountId`（现有状态）→ 现有 `watch` 自动重取邮件列表 → 同时 `PATCH` 用户偏好里的 `lastAccountId` 与「最近」队列（fire-and-forget，失败不打扰）。
- 关闭动效：`opacity + translateY(-4px)`，160ms `ease-standard`，`prefers-reduced-motion` 下只留 opacity。

#### CommandBar（v1.1 新增）

- 高 44px，`bg-canvas`，`border-bottom 1px border-default`；左中右三段用 `Separator` 分隔。
- **上下文操作常驻 + `disabled`**，不用 `v-if`。`disabled` 态 `fg-disabled` + `cursor-not-allowed` + Tooltip 说明为什么不可用（「先选择邮件」）。
- 窄屏（< 1024）中段自动折叠进 `⋯` DropdownMenu；< 768 整条隐藏，操作移到底部 ActionBar。
- 所有按钮有 `title` + `aria-keyshortcuts`，与 §7.1 快捷键一一对应。

#### GlassCard（v1.1 新增）

- 参数：`opacity`（默认读 `--um-glass-alpha`，登录卡由站长 `login_opacity` 覆写）、`blur`（默认读 `--um-glass-blur`，Light 20px / Dark 24px）、`elevation`（`lg`）。所有默认值来自 §4.12，组件不硬编码数值。
- 三层结构：`::before` 高光内描边 → 内容 → 外投影；`backdrop-filter` 只挂在最外层，避免嵌套模糊叠加。
- `@supports` 兜底为不透明底色；`prefers-contrast: more` 时自动切换到不透明底色 + 实线边框。
- 只允许用于登录卡、命令面板、移动 Sheet、模态遮罩四处（§5.1）。

#### ParticleField（v1.1 新增）

- Props：`mode: 'off' | 'static' | 'animated'`（`static` 用于 `prefers-reduced-motion`，只画一帧后停 RAF）、`density`（默认按面积自动算）、`color`（默认读 §4.12 token）。
- 内部：单个 `<canvas>` + `ResizeObserver` + `requestAnimationFrame`；`aria-hidden="true"`、`pointer-events: none`、不可获焦。
- 自我降级链：帧超预算 → 点数减半 → 再超 → 切 `static` → 上报一条 console.debug（不弹 Toast，不打扰用户）。
- 卸载时必须 `cancelAnimationFrame` + 断开 observer（避免路由切换后残留循环——现有代码里 `views/email/index.vue:77-131` 的 `while(true)` 就是这类问题的前例）。

#### MiniQuota（v1.1 新增）

头像菜单里的一行：`已发 3 / 50` + 2px 进度条 + 一句人话（「今日还可发 47 封」/「不限量」/「未授权发送」）。逻辑来自 `useQuota()`，与 `/settings/account/usage` 共用同一个 composable，不再像 `header/index.vue:98-157` 那样在模板里散着算。

### 6.3 组件 API 约定



- 变体一律用 `class-variance-authority` 声明，`tailwind-merge` 合并外部 `class`，对外暴露 `class` 与 `asChild`（Reka `Primitive`）。
- 所有组件 `defineProps` 带 JSDoc 类型；对外事件用 `defineEmits` 显式声明；**禁止 `:deep()`**（组件内部样式自持，外部只能通过 props/token 定制）。
- 文案零硬编码：组件内所有可见文本走 `props` 或 `$t()`。
- 每个组件必须声明 `aria-*` 与键盘行为；icon-only 必须要求 `label` prop（TS 层面强制）。
- 开发期提供 `/_ds` 预览路由（`import.meta.env.DEV` 下注册），逐组件展示全部 variant × state × 主题，作为视觉回归基线来源。

---

## 7. 交互设计方案

### 7.1 快捷键系统

实现方式：一个全局 `useHotkeys()`（基于 `@vueuse/core` 的 `useEventListener` + 自建序列匹配），**当焦点在 `input/textarea/[contenteditable]` 或 IME 组合中时，单字母键全部失效**（中文输入法必须验证：`event.isComposing`）。

| 作用域 | 键 | 动作 |
|---|---|---|
| 全局 | `⌘K` / `Ctrl+K` | 命令面板 |
| 全局 | `/` | 聚焦顶栏搜索（v1.1：搜索已移到顶部通栏） |
| 全局 | `c` | 写信 |
| 全局 | `g` `i` / `s` / `d` / `t` / `x` | 去 收件箱 / 已发送 / 草稿 / 星标 / 回收站 |
| 全局 | `,` | 打开设置中心（v1.1：管理、开发者、外观都在这里） |
| 全局 | `g` `m` / `k` / `a` | 去 我的邮箱 / API Keys / 管理后台（后两项按权限，无权限时不响应且不出现在 `?` 面板） |
| 全局 | `⌘⇧E` | 打开 `MailboxPicker`（邮箱切换器，自动聚焦搜索框） |
| 全局 | `⌘⇧E` 连按两次 | 在最近两个邮箱之间来回切（Alt+Tab 语义，v1.2） |
| 全局 | `⌘⇧L` | 切换主题（带 View Transition） |
| 全局 | `?` | 快捷键面板 |
| 全局 | `Esc` | 关闭浮层 / 退出选择 / 返回列表 |
| 侧栏 | `Alt+↑` / `Alt+↓` | 上/下移动当前文件夹（键盘等价的拖拽排序，a11y 必需） |
| 侧栏 | `Alt+←` / `Alt+→` | 折叠 / 展开当前分组 |
| 侧栏 | `Menu` / `⇧F10` | 打开文件夹右键菜单（重命名、隐藏、移出收藏夹） |
| 列表 | `j` / `k` | 下一封 / 上一封 |
| 列表 | `Enter` / `o` | 打开 |
| 列表 | `x` / `⇧x` / `a` | 勾选 / 区间勾选 / 全选 |
| 列表 | `s` / `u` / `#` | 星标 / 切换未读 / 删除 |
| 列表 | `v` / `⇧D` | 循环阅读窗格位置（右 / 下 / 关）/ 循环列表密度 |
| 阅读 | `[` / `]` | 上一封 / 下一封 |
| 阅读 | `r` | 回复 |
| 阅读 | `⧉` `y` | 复制发件人地址 |
| 写信 | `⌘Enter` | 发送 |
| 写信 | `⌘S` | 存草稿 |
| 表格 | `n` | 新建（当前页语义） |
| 对话框 | `⌘Enter` / `Esc` | 提交 / 取消 |

`?` 面板按作用域分组展示，并标注当前页可用项（不可用项置灰）。快捷键可在设置 → 外观中整体关闭。

### 7.2 命令面板内容规划

| 分组 | 条目 |
|---|---|
| 动作 | 写信、新建邮箱、创建 API Key、切换主题、切换语言、切换背景效果（若站长允许）、复制我的邮箱、刷新收件箱、退出登录 |
| 转到 | 文件夹（收件箱 / 已发送 / 草稿 / 星标 / 含验证码 / 回收站 + 用户自建保存搜索） |
| 设置 | 设置中心所有 section（个人 / 外观 / 开发者 / 管理，按权限过滤），直接命中三级项，如「设置 · 域名管理」 |
| 邮箱 | 「切换到 …」子命令，输入即走 `GET /account/search` 服务端搜索（与 `MailboxPicker` 同一个 `useMailboxes()`，结果最多 8 条 + 「更多…」打开完整 Picker）；另有「新建邮箱」「管理邮箱」 |
| 邮件 | 实时搜索结果（最多 6 条，回车直达） |
| 管理 | 用户搜索（`user:query` 时）、角色、邀请码 |

v1.1 说明：因为侧栏不再承载管理/开发者入口（§5.1），命令面板成为这些页面**最快的键盘路径**，所以「设置」分组必须索引到三级 section 而不是只到 `/settings`，否则 IA 收敛的代价会全部转嫁给鼠标。

### 7.3 Optimistic UI 规则

统一封装 `useOptimistic(mutate, { apply, rollback, undoable })`：

| 操作 | 乐观 | 失败处理 |
|---|---|---|
| 星标 / 取消星标 | 立即翻转图标 | 回滚 + `error` Toast |
| 标记已读 / 未读 | 立即改样式与未读计数 | 回滚 |
| 删除邮件（单/批量） | 立即移出列表 | 回滚并恢复原位置 + Toast |
| 置顶邮箱 / 重命名 | 立即改序/改名 | 回滚（现有逻辑已具备，收敛为统一 API） |
| 全部收信开关 | 立即切换 + 互斥处理 | 回滚双方（现有 `account/index.vue:273-292` 逻辑保留） |
| 创建邮箱 / 发信 / 改密码 | **不乐观**（有副作用且需服务端返回） | 按钮 loading + 错误内联 |

删除类操作一律带 5s 撤销窗口（Toast action），撤销即本地恢复；若已过窗口则不提供撤销。

### 7.4 选择模型

- 选择态存于路由无关的局部 `Set<id>`，切换筛选/账号时清空并提示。
- 顶部复选框 tri-state；`ActionBar` 显示「N 项已选」+ 操作 + 「取消」。
- 「全选」只选**已加载**项，若还有更多则显示「选择全部 N 项」二次确认（避免误删）。

### 7.4.1 侧栏自定义交互（v1.1 新增）

侧栏可自定义是你点 2 的明确要求。自定义能力刻意做小——只有**排序、显示/隐藏、收藏夹归属、保存搜索**四件事，不做"新建真实文件夹"（后端 `email` 表无 folder 字段，见 §5.1 数据源审计）。

| 操作 | 鼠标 | 键盘 | 触屏 |
|---|---|---|---|
| 排序 | 拖拽手柄（hover 时在左侧渐显 `⠿`，6px 命中区外扩到 24px） | `Alt+↑/↓` | 长按 400ms 进入排序态，上下拖 |
| 显示 / 隐藏 | 右键 → 隐藏；或设置 → 外观 → 侧栏里勾选 | 右键菜单 → `h` | 设置页勾选（触屏不做右键） |
| 加入 / 移出收藏夹 | 右键 → 加入收藏夹 | 右键菜单 → `f` | 同上 |
| 保存当前搜索为条目 | 搜索结果页「保存此搜索」按钮 | `⌘S`（搜索态下） | 结果页按钮 |
| 恢复默认 | 设置 → 外观 → 侧栏 → 恢复默认排序 | 命令面板 | 同 |

规则：
- **拖拽必须有键盘等价物**，否则直接违反 §7.9 的验收线。拖拽用 HTML5 原生 `draggable` + `dragover` 计算插入位而不引入 dnd 库（依赖预算已锁，§10.1）。
- 排序与显隐是**跨设备偏好**，写入 `user_setting`（§10.5 增量 4），localStorage 同写直读，保证刷新不闪。写入用 300ms debounce 合并，一次拖拽只发一个 `PUT /user/prefs`。
- 「收件箱 / 已发送」**不可隐藏**（隐藏后无处收信，属于把用户锁在门外），右键菜单里这两项置灰并给 tooltip 说明；其余全部可隐。
- 隐藏的条目不是删除：设置页保留一个「已隐藏（3）」折叠区随时恢复。
- 「收藏夹」与「当前邮箱」两个分组本身可折叠，折叠态进偏好；折叠时组头右侧显示该组未读合计（展开时不显示，避免与子项重复）。
- **v1.2**：不再有"每个邮箱一个分组"，所以自定义配置是单份全局配置，切换邮箱后顺序保持一致（理由见 §5.1）。

### 7.5 搜索与筛选（v1.1：搜索移至顶栏，与 ⌘K 同源）

- 搜索框在**顶部通栏居中**（宽 `min(560px, 42vw)`），不再挂在列表上方；这样它同时覆盖"搜邮件 / 搜邮箱 / 搜命令"三种意图，也是 Outlook 的结构选择。
- **一个输入框、两种形态**：顶栏 `Input` 是"入口"，聚焦（`/`）后原地下拉一层结果面板；`⌘K` 打开的命令面板是同一套解析器与结果渲染器的**居中大浮层**形态。两者共享 `useSearch()`，避免出现两个各自维护语法的搜索。
- 语法糖：`from:stripe`、`to:a@`、`subject:发票`、`has:att`、`is:unread`、`is:star`、`has:code`、`in:trash`、`after:2026-08-01`、`before:…`；其余为全文关键词。
- 解析在前端完成，转为 `/email/list` 的普通 query 参数（`keyword/from/hasAtt/unread/startTime/endTime`，`in:trash` → `type=trash`，见 §10.5 增量 2）。
- 筛选态同步到 URL（`?q=is:unread%20from:stripe`），可分享、可后退、`keep-alive` 恢复；搜索结果视图右上角提供「保存此搜索」写入侧栏（§7.4.1）。
- 列表上方只保留 `全部 / 未读` 两段与一个筛选漏斗（分类已下沉到侧栏，见 §5.3.3），漏斗里的条件与语法糖双向同步：勾「有附件」即在输入框写入 `has:att`。
- 输入框下方 `Kbd` 提示可用语法；无结果时给出「去掉 `is:unread` 试试」的可点击建议。

### 7.6 阅读体验加固

- Shadow DOM 隔离保留（`components/shadow-html`），追加：`:host` reset、`img{max-width:100%;height:auto}`、`table{max-width:100%}`、外链 `target=_blank rel="noopener noreferrer"`。
- **远程图片默认阻断**（`loading=lazy` + 占位），顶部条「此邮件包含远程图片 · 显示」，可在设置中改默认；这同时是隐私追踪防护。
- 深色模式下**不反转邮件正文**（HTML 邮件反色必然出错），只把容器设为 `#FFFFFF` 卡片并降低周边亮度；纯文本邮件跟随主题。
- 附件：类型图标 + 文件名 + 大小 + 下载/预览（图片走 `Dialog` 预览，复用现有 R2 URL 转换 `utils/convert.js`）。
- 验证码：识别到 `code` 时在正文顶部固定一条「验证码 812394 ⧉」条，一键复制。

### 7.7 反馈三层

| 层 | 用于 | 载体 |
|---|---|---|
| 内联 | 表单校验、字段级错误 | 字段下方 `caption` + `danger` 色 + `aria-describedby`（**取代现在的 4 连 `ElMessage`**） |
| 瞬时 | 操作结果、撤销 | Toast |
| 阻断 | 破坏性/不可逆 | `AlertDialog`，危险操作需输入确认（删除账号需键入邮箱） |

破坏性动作清单（必须二次确认）：删除邮箱账号、注销用户账号、删除用户、删除角色、批量删除 >20 封、吊销 API Key、清空日志。

### 7.8 状态矩阵（每个数据视图必须四态齐备）

| 视图 | loading | empty | error | partial |
|---|---|---|---|---|
| 邮件列表 | 骨架行 ×8 | 「还没有邮件」+ 复制地址 | 重试按钮 + 错误码 | 「加载更多」失败可重试 |
| 邮件详情 | 骨架（标题+3 段） | — | 「邮件不存在或已删除」 | 附件单独失败态 |
| Overview 卡片 | 每卡独立骨架 | 「暂无数据」 | 卡内重试，不整页失败 | 部分卡失败不影响其余 |
| 表格 | 骨架行 | `EmptyState` | 行内错误条 | — |
| 日志 | 骨架 | 「还没有 API 请求」 | 重试 | — |
| **邮箱切换器（v1.2）** | 6 行 shimmer | 搜索无结果 → 「未找到 `xxx`」+ 创建 CTA；一个邮箱都没有 → 「你还没有邮箱」+ 新建 | **行内**一行「加载失败，重试」（不弹 Toast，浮层里弹 Toast 会盖住自己） | 已加载 N 条 + 底部「继续加载」失败可重试，不清空已有结果 |

### 7.9 可访问性验收线

- 全站 `:focus-visible` 可见；`Tab` 顺序符合视觉顺序；跳转链接「跳到主内容」。
- 对比度：正文（含 13px 小字）≥ 4.5:1，仅 ≥24px / ≥18.66px 粗体可降到 3:1；`fg-subtle` **不用于文本**，只给图标/圆点/滑块，按 SC 1.4.11 收 ≥3:1。判定基准是**合成后的有效底色**（半透明 hover/selected 要叠到实底上算）。
- 所有浮层用 Reka UI 的焦点陷阱 + `aria-modal` + 关闭后焦点归还触发元素。
- 列表用 `role="list"/"listitem"`，虚拟列表声明 `aria-rowcount`。
- **虚拟列表 + `aria-activedescendant` 的组合必须专项验证（v1.2）**：`MailboxPicker` 与 `MailList` 都是虚拟化的，键盘移动到未挂载的项时 `aria-activedescendant` 会指向不存在的 id。规则：先滚动挂载目标项，再设 `activedescendant`，两者同一帧内完成。P1 阶段用 NVDA + VoiceOver 各过一遍。
- 状态**不单靠颜色**：状态点配形状/文案；图表配 tooltip 与数据表切换。
- 目标：axe-core 在 6 个关键页面 0 critical / 0 serious。

---

## 8. 动画规范

### 8.1 允许清单

| 场景 | 属性 | 时长 / 曲线 |
|---|---|---|
| hover / 颜色变化 | `background-color`, `color`, `border-color` | 120ms `ease-standard` |
| 按钮按下 | `background-color` | 0ms（即时反馈） |
| 下拉 / Popover 进入 | `opacity 0→1`, `translateY -4px→0` | 160ms `ease-out` |
| 下拉 / Popover 退出 | 反向 | 120ms `ease-in` |
| Dialog 进入 | `opacity`, `scale .97→1` | 200ms `ease-out`；遮罩 160ms |
| Sheet（移动） | `translateY 100%→0` | spring `{260, 30}` |
| 页面转场 | 内容区 `opacity 0→1` + `translateY 4px→0` | 180ms `ease-out`，仅内容区，shell 不动 |
| 列表项进入（新邮件） | `opacity` + `height` | 200ms `ease-out`，最多同时 3 项，其余瞬时 |
| 列表重排 | FLIP `transform` | 200ms `ease-standard` |
| 数字变化 | `useTransition` 计数 | 500ms `ease-out`，仅「使用量 / 管理概览」首次加载 |
| 骨架微光 | `background-position` | 1600ms linear infinite |
| 主题切换 | View Transition 径向裁剪 | **保留现有 520ms 实现** |
| 侧栏折叠 | `width` | 180ms `ease-standard` |
| 侧栏拖拽排序 | 占位行 FLIP `transform` | 160ms `ease-standard`，拖拽中被拖项不做过渡 |
| 阅读窗格切换位置 | `opacity` 交叉淡入 | 140ms，**不做布局位移动画**（宽高突变做补间必掉帧） |
| 粒子背景 | canvas 内部逐帧绘制 | 见 §8.5，不走 CSS 过渡 |

v1.1 删除：原「顶栏滚动吸附」一行。三栏各自独立滚动后，顶栏永不随内容滚动，这个动画没有触发时机。

### 8.2 禁止清单

弹跳 / 回弹 overshoot（Sheet 除外）· 旋转入场 · 3D 翻转 · 视差滚动 · 逐字打字机 · 装饰性 loading 动画 · 循环发光 / 呼吸边框 · `box-shadow` 动画（改用伪元素 `opacity`）· 任何 > 320ms 的 UI 过渡 · 页面级整屏滑动（移动端详情推入除外）

### 8.3 性能约束

- 只动 `transform` / `opacity` / `filter`；`width`/`height` 动画仅限侧栏与列表项高度且加 `will-change` 临时提升。
- `backdrop-filter` 只允许出现在 §4.12 定义的 4 个面（登录卡、命令面板、移动端 Sheet/Drawer、模态遮罩），且**同一时刻最多 2 个可见**（浮层 + 其遮罩是一对，登录卡是单独场景，不可能与前者共存）。移动端 Sheet 若实测掉帧，按 `--um-glass-alpha → 0.96` 降级为实色。
- 虚拟列表滚动期间禁用行内过渡（`.is-scrolling *{transition:none}`）。
- 粒子层单独计入预算：见 §8.5（目标 <1.5ms/帧，且只出现在认证页与空状态插画区，邮件三栏、列表、表格区域永不绘制）。
- 目标：交互 INP < 200ms；主题切换与路由转场无掉帧（60fps）。

### 8.4 减少动效

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```
外加设置项「减少动效」，默认跟随系统；开启时 View Transition 关闭，**粒子停止运动**（保留静态点阵，见 §8.5），登录卡的入场位移改为纯淡入。

### 8.5 粒子背景（v1.1 新增）

粒子是"增强项"（你点 1），所以它必须满足一条铁律：**关掉它，产品的品质感不下降；开着它，性能与可读性不下降**。为此做如下限制。

**实现**：自写 `ParticleField.vue`（Canvas 2D，约 120 行，**零新增依赖**，见 §10.1）。不引 tsparticles（gzip ~30KB + 配置面过大易被玩坏）、不引 three.js（为了几十个点上 WebGL 是荒谬的）。

| 维度 | 规格 |
|---|---|
| 出现位置 | 仅 `/login`、`/register`、`/reset`（全屏）与应用内**空状态插画区**（局部，粒子数减半）；邮件三栏、列表、表格、表单区域一律不绘制 |
| 点数 | `min(72, w*h/22000)`：1440×900 ≈ 58 个；平板上限 40；**移动端 0**（只留柔光层） |
| 形态 | 半径 0.6–1.6px 的单色圆点，颜色/透明度取 §4.12 token（Light 8% / Dark 14%）；**不连线、不跟随鼠标、不发光、不彩色、不做尺寸呼吸** |
| 运动 | 匀速直线漂移 2–6 px/s（每点初始化时取一次），边界环绕；无加速度、无点击爆炸 |
| 帧率 | `requestAnimationFrame` + 自适应节流至 30fps（对 2–6px/s 的位移，30 与 60fps 肉眼无差） |
| 分辨率 | `devicePixelRatio` 上限取 2 |
| 暂停条件 | `document.visibilityState !== 'visible'`、`IntersectionObserver` 离屏、`prefers-reduced-motion`、窗口失焦 |
| 低端设备 | `navigator.hardwareConcurrency <= 4` 或 `navigator.connection.saveData` 为真 → 直接降级为纯柔光（不启动 canvas） |
| 尺寸变化 | `ResizeObserver` + 200ms debounce 重算点数，不重建实例 |
| 主线程预算 | 目标 < 1.5ms/帧（58 个孤立点的实测量级为 0.2–0.5ms）。**守卫**：连续 20 帧超 8ms → 点数减半；再次触发 → 退化为纯柔光并记一条 `console.debug`，不弹 Toast |
| 卸载 | 必须 `cancelAnimationFrame` + 断开两个 observer（`views/email/index.vue:77-131` 的 `while(true)` 长轮询就是"路由走了循环还在跑"的现成反例） |
| a11y | `<canvas aria-hidden="true" style="pointer-events:none">`，不可聚焦，不承载任何信息；关闭后不留空白布局位移（柔光层仍在） |
| 主题 | 主题切换时不重建 canvas，仅更新绘制颜色 |
| 3D | **不做**（本轮只放开了粒子，§0.3 约束 7） |

**reduced-motion 的选择**：不是"直接不渲染"，而是**渲染一帧静态点阵后停止 RAF**。理由是运动一停就整层消失会让页面出现明显的"空了一块"的落差；静态点阵保留了材质而彻底去掉了运动，符合该媒体查询的语义（减少动效 ≠ 减少装饰）。

**两级开关的运行时判定**（对应 §0.3 的表）：

```
// 站长策略优先；'optional' 时以用户偏好为准，用户默认「柔光」= 粒子关
const pref = admin.bgEffect === 'off' ? 'off'
           : admin.bgEffect === 'on'  ? 'particles'
           : (user.bgEffect ?? 'glow')        // 'off' | 'glow' | 'particles'

const glowVisible  = pref !== 'off'           // 纯 CSS 层
const particleMode = pref !== 'particles' ? 'off'
                   : prefersReducedMotion || isMobile || isLowEnd ? 'static'
                   : 'animated'
// isMobile 时 static 也不渲染：点数为 0，等价于 off
```
`admin.bgEffect` 来自 `setting.bg_effect`（§10.5 增量 5），`user.bgEffect` 来自 `user_setting`（增量 4）。前者进 `websiteConfig` 白名单所以登录页拿得到；后者登录后才有，**未登录时按站长策略 + 默认「柔光」**。当 admin 为 `on`/`off` 时，用户侧的单选组 `aria-disabled` + 置灰 + 下方一行说明「由站长统一设定」——**置灰而不是隐藏**，否则用户会以为功能坏了。

---

## 9. 主题方案

### 9.1 三主题机制

- 存储：`localStorage['um-theme'] = 'light' | 'dark' | 'system'`（迁移现有 `uiStore.dark` 的持久化值）。
- 应用：`<html class="dark">` + `<html data-theme="…">`；`system` 时用 `matchMedia('(prefers-color-scheme: dark)')` 并**监听变化实时切换**（现状不支持 system）。
- **防闪白**：在 `index.html` 内联一段 8 行同步脚本，在 CSS 加载前就写好 `class`，同时设置 `<meta name="theme-color">`（现有 `switchDark` 里的 mobile/desktop 区分逻辑保留）。
- `color-scheme: light dark` 声明，让原生滚动条、表单控件、`::selection` 自动跟随。
- 切换动画：**复用现有 View Transitions 径向扩散**（`style.css:174-212`），这是当前代码里最好的一处实现，保留并接入 `⌘⇧L`。

### 9.2 主题实现结构

```
src/design/
├── tokens.css        # @theme + :root(light) + .dark(dark) 语义 token
├── primitives.css    # Layer 1 原始色阶/间距/字体（供 tokens.css 引用）
├── base.css          # reset、字体、focus-visible、滚动条、::selection
├── compat-ep.css     # 过渡期：把 EP 变量映射到新 token（P6 阶段删除）
└── view-transition.css # 主题切换径向动画（迁移自 style.css）
```

`compat-ep.css` 是渐进迁移的关键——它让**尚未重写的旧页面在第一阶段就换上新配色**：

```css
:root {
  --el-color-primary: var(--um-accent-solid);
  --el-color-primary-light-3: var(--um-violet-400);
  --el-color-primary-light-9: var(--um-accent-subtle-bg);
  --el-bg-color: var(--um-bg-canvas);
  --el-bg-color-overlay: var(--um-bg-raised);
  --el-text-color-primary: var(--um-fg-default);
  --el-text-color-regular: var(--um-fg-default);
  --el-text-color-secondary: var(--um-fg-muted);
  --el-border-color: var(--um-border-default);
  --el-border-color-lighter: var(--um-border-default);
  --el-fill-color-light: var(--um-bg-inset);
  /* 旧变量兼容（含 3 处拼写错误，保留到 P6） */
  --aside-backgound: var(--um-sidebar-bg);
  --loadding-background: var(--um-bg-overlay);
  --light-ill: var(--um-bg-inset);
  --base-fill: var(--um-bg-hover);
  --regular-text-color: var(--um-fg-muted);
  --secondary-text-color: var(--um-fg-muted);   /* P1 修订：旧变量喂的是文字，不能给 fg-subtle */
  --email-hover-background: var(--um-bg-hover);
  --choose-account-background: var(--um-bg-selected);
  /* …其余 36 个旧变量逐一映射 */
}
```

### 9.3 站长级品牌定制

设置中心 → 管理 → 外观（v1.1：位置从"系统设置"改到设置中心，见 §5.3.6）增加：

| 项 | 控件 | 落库 |
|---|---|---|
| 站点名 / Logo | 输入 + 上传 | 复用现有 `setting.title`、R2 |
| **强调色** | 预设 6 色 + 自定义 HEX，实时预览，自动派生 hover/active/subtle 三档，并校验与 `fg-on-accent` 对比度 ≥ 4.5:1，不达标时提示 | 新增列 |
| 默认主题 / 是否允许用户自选 | 单选 + 开关 | 新增列 |
| 登录页背景图 / 卡片不透明度 | 已有 | `setting.background`、`setting.login_opacity`（v1.1 复用为玻璃卡不透明度） |
| **背景效果（粒子）** | 三态单选：关闭 / 允许用户自选 / 强制开启 | 新增 `setting.bg_effect`（§10.5 增量 5） |

`bg_effect` 的三态语义与用户侧的联动判定见 §8.5 末的伪代码。选「强制开启」时，管理页当场给一行提示「用户侧的背景效果选项将被置灰」，避免站长不知道自己刚剥夺了一个用户偏好。

### 9.4 深色模式专项规则

1. 不用纯黑作为卡片色（`#141416` 而非 `#000`），避免 OLED 上的边缘拖影。
2. 层级靠色阶而非阴影（§4.6）。
3. 图片与邮件正文不反色；用户上传的背景图在深色下叠一层 `rgb(10 10 11/.4)`。
4. accent **不整体提亮**：实底静息态两套主题同为 `#6E56CF`（否则白字达不到 AA 4.5），
   只有 hover/active 与「accent 当文字用」时才提亮到 `violet-550/500`。详见 §4.2 表下的 P0 修订说明。
5. 语义色全部换用深色专用值（§4.2），不复用浅色值。

### 9.5 材质在三主题下的差异（v1.1 新增）

玻璃与粒子是**唯二需要按主题手调而不能靠色阶推导**的东西，因此单列一节。

| | Light | Dark | 理由 |
|---|---|---|---|
| 玻璃不透明度 | 0.72 | 0.64 | 深色背景本身噪点低，可以更透而不脏 |
| 玻璃模糊半径 | 20px | 24px | 深色下背景图的高亮点更刺眼，需要更大半径压制 |
| 玻璃描边 | 60% 白 | 8% 白 | 深色用灰描边会显脏；极低白才有"玻璃边缘折射"的观感 |
| 顶部高光 | 明显（50% 白 1px） | 微弱（6% 白 1px） | 浅色下高光是玻璃的主要识别特征，深色下过强就变成"发光边框"（§0.3 禁止项） |
| 粒子色 | `#6E56CF`（accent 本色） | `#A9A0FF`（提亮一档） | 浅色下 accent 在白底上足够暗；深色下必须提亮才可见 |
| 粒子透明度 | 0.08 | 0.14 | 深色底噪点低、对比更弱，需要更高 alpha 才"察觉得到" |
| 柔光层 | 紫罗兰 6% 径向渐变 + 3% 点阵 | 紫罗兰 5% + 3% 白点阵 | 深色下紫罗兰渐变容易发闷，压低一档并把点阵换成白 |

`system` 主题不需要第三套值：它在运行时解析为 light 或 dark，`matchMedia` 变化时 canvas 只更新绘制颜色、不重建（§8.5）。

**验收方式**：登录页在 Light/Dark × 有背景图/无背景图 × 粒子开/关 = 8 种组合下逐一截图比对，卡片内文字对比度全部 ≥ 4.5:1（背景图会影响玻璃后的实际亮度，这是唯一可能踩线的地方）。

---

## 10. 前端实现建议

### 10.1 依赖变更（全部锁定确切版本）

**新增**

| 包 | 版本 | 用途 |
|---|---|---|
| `reka-ui` | `2.10.1` | 无样式可访问原语（Radix Vue 后继） |
| `tailwindcss` | `4.3.3` | 原子样式 + `@theme` token |
| `@tailwindcss/vite` | `4.3.3` | Vite 插件（无需 PostCSS 配置） |
| `class-variance-authority` | `0.7.1` | 组件变体声明 |
| `tailwind-merge` | `3.6.0` | 类名合并 |
| `clsx` | `2.1.1` | 条件类名 |
| `motion-v` | `2.3.0` | 页面/列表/Sheet 动画（按需引入） |
| `vaul-vue` | `0.4.1` | 移动端 Bottom Sheet |
| `vue-sonner` | `2.0.9` | Toast |
| `unplugin-icons` | `23.0.1` | 构建期内联 SVG |
| `@iconify-json/lucide` | `1.2.122` | Lucide 图标数据（仅构建期依赖） |

**升级**：`@vueuse/core` `12.0.0 → 14.4.0`（与已有 `@vueuse/components@14.1.0` 对齐；当前两者大版本不一致）

**移除（P6 阶段）**：`element-plus`、`@iconify/vue`、`nprogress`、`path`（浏览器端无用的 Node polyfill）、`unplugin-vue-components` 的 `ElementPlusResolver`

**保留**：`echarts`（换主题即可）、`dexie`、`pinia` + `persistedstate`、`vue-i18n`、`dayjs`、`axios`、`lodash-es`、`compressorjs`、`vite-plugin-pwa`、TinyMCE（`components/tiny-editor`，通过外部脚本加载，只换其 skin 与 content CSS 以匹配 token）

**v1.1 明确：新增的两个"材质"能力零依赖。**

| 能力 | 是否新增依赖 | 做法 |
|---|---|---|
| 粒子背景 | **不新增** | 自写 `ParticleField.vue`，Canvas 2D，约 120 行（§8.5）。不引 `tsparticles`（gzip ≈ 30KB，且配置面太大，容易被后人调成霓虹）、不引 `three.js`（几十个点上 WebGL 不合理） |
| 玻璃材质 | **不新增** | 纯 CSS `backdrop-filter` + §4.12 的 token，`GlassCard` 只是个 20 行的 `cva` 包装 |
| 侧栏拖拽排序 | **不新增** | HTML5 原生 `draggable` + `dragover` 插入位计算，不引 dnd 库（§7.4.1） |

净体积预估：移除 EP（gzip ≈ 320KB JS + 90KB CSS）后，新增 Reka UI（按需 ≈ 45KB）+ Tailwind 产物（≈ 18KB）+ sonner/vaul/motion（≈ 30KB），**首屏 JS 预计下降 40% 以上**；粒子/玻璃/拖拽三项对该数字无影响。

### 10.2 目录结构

```
mail-vue/src/
├── design/                 # 见 §9.2
├── components/
│   ├── ui/                 # L1 Primitive（21 个，每个一个文件夹 + index.ts）
│   ├── composite/          # L2（AppShell / CommandBar / DataTable / GlassCard / StatCard …）
│   └── domain/             # L3（MailRow / FolderTree / MiniQuota / ApiKeyTable …）
├── composables/
│   ├── useHotkeys.js       # 快捷键 + IME 保护
│   ├── useCommandPalette.js
│   ├── useOptimistic.js
│   ├── useTheme.js         # light/dark/system + View Transition
│   ├── useDensity.js
│   ├── useUserPrefs.js     # v1.1：user_setting 读写 + localStorage 写穿 + 站长策略合并
│   ├── useSidebar.js       # v1.1：文件夹树排序/显隐/收藏夹/保存搜索，含键盘等价物
│   ├── useQuota.js         # 收敛 header 里 60 行配额 computed
│   ├── useMailQuery.js     # 搜索语法解析 + URL 同步（顶栏与 ⌘K 共用）
│   └── useBreakpoint.js    # 5 个断点，替换 19 处 media query 与散落的 innerWidth 判断
├── layouts/
│   ├── AppLayout.vue       # 桌面三栏（顶栏 + 命令条 + 文件夹/列表/阅读窗格）
│   ├── SettingsShell.vue   # v1.1：设置中心二级导航（个人 / 开发者 / 管理）
│   ├── MobileLayout.vue    # 底部 3 Tab + 推入导航
│   └── AuthLayout.vue      # v1.1：粒子层 + 居中玻璃卡
├── views/                  # 按域重组：auth/ mail/ mailboxes/ developer/ admin/ settings/
├── request/ store/ utils/ enums/ i18n/ perm/ db/ echarts/   # 原样保留
└── main.js
```

v1.1 变化说明：`views/overview/` 已删除——原「概览」按受众一拆二（个人使用量进 `settings/account/usage`，系统概览进 `admin/overview`，见 §5.3.2）。新增的 `ParticleField.vue` 放在 `components/composite/`，因为它是布局级背板而非领域组件。

**注意**：现有 `layout/index.vue`、`main/index.vue` 里散落着 4 处 `window.innerWidth` 判断与 resize 监听（`layout:34-45`、`main:93-100`、`router:163-171`），全部收敛进 `useBreakpoint()`，避免继续出现「三处各自判断移动端」的不一致。

### 10.3 Tailwind v4 配置样例

> P0 已落地，实际文件拆成 `design/{index,primitives,tokens,base,compat-ep,view-transition}.css`，
> 下面是 `tokens.css` 桥接层的真实形态（与初稿的两处差异见代码注释与本节末）。

```css
/* design/index.css —— 唯一入口，main.js 只 import 这一个 */
@import "tailwindcss";
@import "./primitives.css";
@import "./tokens.css";
@import "./base.css";
@import "./compat-ep.css";
@import "./view-transition.css";
@source "../../index.html";
@source "../**/*.{vue,js,ts}";

/* design/tokens.css */
@theme inline {
  --color-canvas: var(--um-bg-canvas);
  --color-subtle: var(--um-bg-subtle);
  --color-surface: var(--um-bg-surface);
  --color-raised: var(--um-bg-raised);
  --color-inset: var(--um-bg-inset);
  --color-fg: var(--um-fg-default);
  --color-fg-muted: var(--um-fg-muted);
  --color-fg-subtle: var(--um-fg-subtle);
  --color-accent: var(--um-accent-solid);
  --color-accent-fg: var(--um-accent-fg);
  --color-line: var(--um-border-default);
  --color-line-strong: var(--um-border-strong);
  --color-focus: var(--um-border-focus);
  --font-sans: var(--um-font-sans);
  --font-mono: var(--um-font-mono);
  --shadow-sm: var(--um-shadow-sm);
}

@theme {
  --radius-md: 8px;  --radius-lg: 12px;  --radius-xl: 16px;
  --text-body: 0.875rem;  --text-body--line-height: 1.25rem;
  --ease-standard: cubic-bezier(.2,0,.2,1);
  --breakpoint-sm: 640px; --breakpoint-md: 768px;
  --breakpoint-lg: 1024px; --breakpoint-xl: 1280px; --breakpoint-2xl: 1536px;
}

@custom-variant dark (&:where(.dark, .dark *));

:root      { --um-bg-canvas:#FFFFFF; --um-fg-default:#1A1A1F; /* …§4.2 全表 */ }
:root.dark { --um-bg-canvas:#0A0A0B; --um-fg-default:#ECECEF; /* … */ }
```

两处与初稿不同，都是实现时必须的：

1. **`@theme inline` 而不是 `@theme`**。普通 `@theme` 会把 `--color-canvas: var(--um-bg-canvas)`
   原样挂到 `:root`，其计算值在 `:root` 上求值一次后被继承；`inline` 则把 `var(--um-*)`
   直接内联进工具类，因此将来在任意子容器上加 `.dark` 也能正确解析。
2. **深色选择器用 `:root.dark`（特异性 0,2,0）而不是 `.dark`（0,1,0）**，
   `compat-ep.css` 里进一步用 `:root:root` / `:root:root.dark`（0,2,0 / 0,3,0）压过
   Element Plus 的 `:root` 与 `html.dark`——这样就不需要初稿里的 `!important`，
   也不依赖 `unplugin-vue-components` 注入 EP 组件 CSS 的先后顺序。
   `--color-border-default` 也随之改名为 `--color-line` / `--color-line-strong` / `--color-focus`，
   因为 Tailwind 的 `border-*` 命名空间会和 `border-{width}` 冲突。

`vite.config.js` 增量：加入 `@tailwindcss/vite` 与 `unplugin-icons`（`autoInstall: false`，图标集作为 devDependency 显式安装），`Components` 的 resolver 由 `ElementPlusResolver` 逐步换为本地 `ui/` 目录自动导入。

### 10.4 迁移路线图（7 阶段 · Strangler）

每阶段独立提交、独立可回滚，结束时 `npm run build` 必须通过且应用可用。

| 阶段 | 内容 | 交付物 | 验收 | 人日 |
|---|---|---|---|---|
| **P0 基建** | 装 Tailwind v4 + token 层 + `compat-ep.css`；删除 `*:focus{outline:none}`；断点收敛为 5 个的工具；`useTheme` 支持 system；`/_ds` 预览路由 | 全站换新配色（旧结构不变） | 构建通过；三主题可切；旧页面无破形；键盘焦点可见 | 3 |
| **P1 原语层** | 21 个 L1 组件 + cva 变体 + a11y + i18n；`/_ds` 逐组件展示 | `components/ui/*` | `/_ds` 全变体 × 双主题人工过审；axe 无 serious | 8 |
| **P2 Shell + Auth** | `AppShell`/`Topbar`（居中统一搜索）/`CommandBar` 骨架、命令面板、快捷键、`useBreakpoint`；`GlassCard` + `ParticleField` + `AuthLayout`；登录/注册/OAuth 回调、404 | 新导航壳 + 新入口（登录页即可作为对外展示物） | 全站在新 shell 下可导航；旧页面内容原样嵌入；`⌘K` 可用；登录页 8 种材质组合过审（§9.5） | 6 |
| **P3 邮件域** | `FolderTree`（含排序/显隐/收藏夹 + 键盘等价物）、**`MailboxPicker`（虚拟滚动 + 服务端搜索）**、`MailList`/`MailRow`/`MailReader`/`MailComposer`、命令条实装、阅读窗格三态；替换 `email-scroll`(1367)、`content`(428)、`write`(788)、`account`(677)；`/mail/:folder/:emailId` 深链；搜索与筛选；**后端增量 1/2/3/6**（`/email/counts`、`type=trash`、`unread` 翻转、`/account/search`） | 邮件全流程新 UI | 收/读/写/删/星标/未读翻转/回收站/草稿/附件/自动刷新全通；侧栏计数与列表一致；虚拟滚动 60fps；**200 邮箱压测下 Picker DOM ≤16 行、打开 INP < 200ms**；移动端手势可用 | 14 |
| **P4 管理域 + 开发者** | `DataTable` 替换 6 处 `el-table`（user/role/reg-key/all-email…）；Developer 四页 + 后端新表接口 | 管理页 + 开发者中心 | 权限裁剪正确；分页/筛选/批量正确；Key 创建→调用闭环 | 10 |
| **P5 设置中心** | `SettingsShell` 三分组二级导航；`sys-setting`(2015) 拆 9 个 section 并入「管理」组；个人设置扩为 7 个 section；原「概览」一拆二（`account/usage` + `admin/overview`）+ 图表换主题；`MiniQuota`；**后端增量 4/5**（`user_setting` + `bg_effect`）与两级背景效果开关 | 设置中心（承载全部管理/开发者入口） | 每个设置项与旧版行为逐项对齐（对照清单）；图表双主题正常；偏好跨设备生效；站长强制时用户侧正确置灰 | 8 |
| **P6 清理** | 卸载 `element-plus`/`@iconify/vue`/`nprogress`；删 `compat-ep.css` 与 36 个旧变量；删 `/test`；i18n 补全（zh/en 双语 diff 为 0）；a11y 与视觉回归基线 | 干净代码库 | `grep -r "el-" src` 为 0；`!important` ≤ 5；`:deep(` 为 0；构建体积报告 | 4 |

合计 **≈ 53 人日**（v1.0 为 48；v1.1 因侧栏自定义、设置中心壳、材质层与 5 项后端增量增加 5 人日）。v1.2 的邮箱切换器改动**不改变总人日**：P3 里新增 `MailboxPicker` 与增量 6 约 +1.5 人日，但侧栏不再需要"N 个邮箱分组 + 分组折叠态持久化 + 分组级计数聚合"，抵掉约 1.5 人日；且 `MailboxPicker` 与 `MailList` 共用同一套虚拟化 composable，不是从零写。单人 ≈ 11 周；两人并行 ≈ 6.5 周，P1/P2 可并行，P3 建议单人独占以免冲突。

**风险最高的是 P3**：`email-scroll/index.vue` 1367 行里混着虚拟列表、增量拉取、右键菜单、批量选择、骨架、未读计数、自动刷新轮询（`views/email/index.vue:77-131` 的 `while(true)` 长轮询）。迁移策略是**先抽逻辑再换视图**：第一步把它拆成 `useMailList()` composable（纯逻辑，不动模板），跑通后再替换模板。这样任一步出错都能单独回退。v1.1 又给 P3 加了侧栏自定义与日期分组，因此把 `FolderTree` 排在 `MailList` 之前做——它是纯新增组件、不碰旧逻辑，可以先合并、先看到效果。v1.2 追加一条 P3 内部顺序：**`MailboxPicker` 紧跟 `FolderTree`**，因为侧栏只显示当前邮箱，没有 Picker 就无法切换邮箱，两者必须同一批上线（在此之前保留旧 `account/index.vue` 作为过渡入口）。

### 10.5 后端增量（以新增为主 · 7 个现有文件需追加，见 §10.5.2）

> **v1.0 的说法有误，此处更正**：v1.0 标题写的是"不改动任何现有文件"。实际做不到——D1 的迁移机制是集中式的（`init/init.js` 里按 `v1_1DB() … v3_0DB()` 顺序调用），新增列必然要在这个文件里追加一个新函数；Hono 路由靠 `hono/webs.js` 的 import 副作用注册；未登录页的配置走 `setting-service.websiteConfig()` 的返回白名单。因此准确的边界是：**只做追加，不修改任何既有逻辑分支**。需要追加的 7 个现有文件精确列在 §10.5.2（v1.1 为 6 个，v1.2 因增量 6 多了 `account-service.js`）。

**新增表（D1 迁移 SQL 草案）**

```sql
CREATE TABLE api_key (
  key_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  prefix     TEXT    NOT NULL,           -- um_live_7f3a（展示用）
  hash       TEXT    NOT NULL,           -- 复用 crypto-utils 的 salt+hash
  salt       TEXT    NOT NULL,
  scopes     TEXT    NOT NULL DEFAULT '',-- 逗号分隔，映射现有 perm key
  status     INTEGER NOT NULL DEFAULT 0, -- 0 启用 1 停用
  expire_time  TEXT,
  last_used_time TEXT,
  create_time  TEXT NOT NULL,
  is_del     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_api_key_user ON api_key(user_id, is_del);
CREATE UNIQUE INDEX idx_api_key_prefix ON api_key(prefix);

CREATE TABLE api_log (
  log_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id   INTEGER,
  user_id  INTEGER,
  method   TEXT NOT NULL,
  path     TEXT NOT NULL,
  status   INTEGER NOT NULL,
  duration INTEGER NOT NULL,             -- ms
  ip       TEXT,
  ua       TEXT,
  err      TEXT,
  create_time TEXT NOT NULL
);
CREATE INDEX idx_api_log_time ON api_log(create_time DESC);
CREATE INDEX idx_api_log_key  ON api_log(key_id, create_time DESC);
```

**新增接口**

| 方法 路径 | 说明 |
|---|---|
| `GET/POST /api-key`、`PUT /api-key/status`、`DELETE /api-key/:id` | Key CRUD（明文仅在 POST 响应返回一次） |
| `GET /api-key/:id/usage` | 单 Key 近 7 日调用量 |
| `GET /api-log` | 分页 + 筛选（keyId/path/status/时间范围） |
| `GET /status/overview` | D1/KV/R2/Resend/AI/Turnstile 探活 + 耗时，KV 缓存 60s |
| `GET /status/domains` | 各域名 MX/SPF/DKIM/DMARC（Cloudflare DoH `1.1.1.1/dns-query`），KV 缓存 30min |
| `GET /dashboard/overview` | 个人今日收/发、未读、邮箱数、配额、存储；管理员追加全站字段 |
| `GET /activity` | 最近活动（合成：api_log + 邮件事件） |
| `/open/*` + `apiKeyAuth` 中间件 | 新开放 API 命名空间；`/public/*` 保留并标记弃用 |

**新增参数（向后兼容，缺省行为不变）**：`GET /email/list` 增加可选 `keyword`、`from`、`hasAtt`、`unread`、`startTime`、`endTime`。

#### 10.5.1 因 IA 调整而新增的后端增量（v1.1 的 5 项 + v1.2 的第 6 项）

新 IA（侧栏带计数、回收站、可跨设备的偏好、两级背景效果开关、邮箱切换器）需要下面 6 项。每一项都先说明"为什么现有接口不够"——如果现有接口够用，就不该新增。

**增量 1 · `GET /email/counts` —— 侧栏计数**

- 为什么需要：侧栏每个文件夹要显示未读/条数。前端**没有**这个数据源。`mail-vue/src/store/ui.js:14` 有 `asideCount: { email: 0, send: 0, sysEmail: 0 }`，但全库 grep 后确认它**从未被读或写**（死代码，v1.0 未发现这点）。靠拉列表再 count 只能得到已加载的部分，数字会是错的。
- 入参与返回（**v1.2 收窄**）：`?accountId=N` 返回该邮箱的 `{ inbox, unread, star, code, trash, sent }`；`?all=1` 返回跨邮箱聚合；`?accountIds=1,2,3`（上限 5）用于 `MailboxPicker`「最近」分组的未读小徽标。`draft` 由 Dexie 本地算，不进接口。v1.1 写的"一次返回所有邮箱各分类的计数"**已废除**——有 300 个邮箱时那是一次全表分组扫描，随邮箱数线性劣化。
- 实现：新增 `api/email-count-api.js` + `email-service.counts()`（新方法）。5~6 条 `SELECT COUNT(*)` 用一次 `c.env.db.batch()` 发出；**不做 KV 缓存**（计数必须与列表一致，缓存会造成"点进去数字不对"）。
- 调用时机：进入 `/mail`、切换邮箱、收到新邮件推送、手动刷新；不做轮询（现有长轮询已提供新邮件信号）。

**增量 2 · 回收站：`type=trash` + 单封恢复**

- 为什么可行：删除本来就是软删（`email-service.js:137-145` 只 `set({ isDel: isDel.DELETE })`），数据都在，只是查不出来——`list()` 里硬编码了 `eq(email.isDel, isDel.NORMAL)`。管理端 `allEmailList` 已有 `type === 'delete' → eq(email.isDel, isDel.DELETE)` 的先例（`email-service.js:805-807`），语义一致。
- 做法：**新增 `email-service.trashList()`**（复制 `list()` 的分页/排序逻辑，把 `isDel` 条件取反），而不是给 `list()` 加分支——现有调用方零风险。前端 `in:trash` 映射到 `GET /email/list?type=trash` 由新 handler 分流。
- 恢复：新增 `PUT /email/restore`（body `{ emailIds }`），`set({ isDel: NORMAL })`；批量彻底删除新增 `DELETE /email/purge`。
- 保留期：回收站条目 30 天后由 `scheduled` 真删（与 `api_log` 清理同一个 cron，见下）。UI 在回收站顶部明示"30 天后自动清除"。

**增量 3 · 标记为未读：`PUT /email/unread`**

- 为什么需要：`email-service.js:988` 只有 `set({ unread: READ })` 单向操作，没有反向。命令条与 `u` 快捷键都需要双向翻转。
- 做法：新增独立路由与新方法 `markUnread()`，**不动**现有 `PUT /email/read` 的签名与实现（比给它加可选参数更保守）。

**增量 4 · `user_setting` 表 + `GET/PUT /user/prefs` —— 跨设备偏好**

```sql
CREATE TABLE user_setting (
  user_id     INTEGER PRIMARY KEY,
  prefs       TEXT NOT NULL DEFAULT '{}',   -- JSON
  update_time TEXT NOT NULL
);
```
- 为什么需要：侧栏排序/显隐/收藏夹、阅读窗格位置、密度、主题、背景效果、减少动效、远程图片策略，**以及 v1.2 的「最后使用的邮箱」`lastAccountId` 与「最近邮箱」队列**，都是"换台设备就该跟着走"的东西。现状 `mail-vue/src/store/setting.js` **只持久化 `lang`**，`store/account.js` 连 `persist` 都没有（刷新即回落到第一个邮箱），服务端完全没有用户偏好的存放处。**你已确认存库（决策 13）。**
- prefs JSON 的形状（首版）：
  ```json
  {
    "sidebar":  { "order": [], "hidden": [], "favorites": [], "savedSearches": [], "collapsed": {} },
    "mail":     { "pane": "right", "density": "standard", "sort": "time" },
    "mailbox":  { "lastAccountId": 12, "recent": [12, 7, 3, 21, 5] },
    "appearance": { "theme": "system", "bgEffect": "glow", "reduceMotion": false, "remoteImages": "ask" }
  }
  ```
- 为什么用 JSON 单列而不是宽表：偏好项是纯前端语义、会频繁增删（`setting` 表就是宽表失控的现成教训——56 列且还在加）。JSON 让加一个偏好不需要 D1 迁移。代价是无法按偏好查询——而我们从来不需要。
- 读写策略：登录后随 `websiteConfig`/`my` 一并取回；前端 localStorage 写穿（先落本地再发请求，刷新不闪），`PUT` 用 300ms debounce 合并，**整体覆盖**而非增量 patch（并发写只会丢自己的最后一次点击，可接受）。
- 校验：服务端对 JSON 做长度上限（8KB）与 key 白名单校验后再落库，防止被当成任意 KV 用。

**增量 5 · `setting.bg_effect` —— 站长级背景效果策略**

- 列定义：`bg_effect TEXT NOT NULL DEFAULT 'optional'`，取值 `off | optional | on`（与 §8.5 伪代码一致）。用字符串而非 0/1/2，是因为这张表已经有一堆语义不明的 `integer` 开关，再加一个数字三态没人看得懂。
- 站长保存**无需改后端**：`settingService.set()` 是 `set({ ...params })` 直接展开，加了列就自动通。
- 但**必须**在 `websiteConfig()` 的返回白名单里加一行 `bgEffect`——登录页是未登录状态，只能拿到这个白名单里的字段，否则登录页永远不知道该不该画粒子。

**增量 6 · `GET /account/search` —— 邮箱切换器的服务端搜索（v1.2 新增）**

- 为什么现有接口不够：`account-service.list()`（`account-service.js:106-139`）是**纯游标分页**，`where` 只有 `userId + isDel + (sort, accountId)` 游标条件，**没有任何 keyword 参数**。前端只能过滤"已加载的那几页"，用户搜第 200 个邮箱会搜不到——这不是体验瑕疵，是功能缺失。
- 为什么不给 `list()` 加参数：`list()` 被账号面板、写信选发件人等多处复用，且游标语义与关键字过滤混在一起后分页会变得不可靠（关键字改变时游标失效）。按本方案一贯的边界，**新增方法 `searchByKeyword()` + 新增路由**，`list()` 一个字都不改。
- 契约：
  ```
  GET /account/search?keyword=abc&size=20
  → [{ accountId, email, name, sort, allReceive, createTime }]
  ```
  - `keyword` 服务端 `trim` + 长度上限 64 + 转义 `%` `_`，用 Drizzle 的 `like(account.email, '%'+kw+'%')`（**参数化**，不拼字符串——附录 C 那个 SQL 拼接问题就是反例，不能再犯）。
  - 强制 `and(eq(account.userId, userId), eq(account.isDel, NORMAL))`，越权无从发生；`size` 上限 20（比 `list()` 的 30 更小，因为搜索结果不需要翻页）。
  - 排序 `desc(sort), asc(accountId)`，与 `list()` 一致，保证置顶邮箱在搜索结果里也靠前。
  - 前缀命中优先：先按 `like(kw+'%')` 取，不足 `size` 再用 `like('%'+kw+'%')` 补齐（两条 `batch()` 发出）。这一步纯体验，实现成本约 10 行。
- 索引：`account` 表现有索引足够（结果集受 `user_id` 限定后规模在千级），**不新增索引**，避免为一个搜索框改动现有表结构。
- 前端配套：`MailboxPicker` 与命令面板「邮箱」分组共用 `useMailboxes()`，同一份缓存与同一个 `AbortController` 策略。

#### 10.5.2 需要追加的现有文件（精确清单 · v1.2：6 → 7 个）

| 文件 | 追加内容 | 是否触碰既有逻辑 |
|---|---|---|
| `mail-worker/src/init/init.js` | 新增 `v3_1DB()`（`ALTER TABLE setting ADD COLUMN bg_effect …` + 3 张新表的 `CREATE TABLE IF NOT EXISTS`），并在 `init()` 调用链末尾追加一行 `await this.v3_1DB(c)` | 否（沿用现有 `try/catch` 吞"列已存在"的幂等写法） |
| `mail-worker/src/entity/setting.js` | 追加一行 `bgEffect: text('bg_effect').default('optional').notNull()` | 否 |
| `mail-worker/src/service/setting-service.js` | 在 `websiteConfig()` 返回对象里追加一行 `bgEffect: settingRow.bgEffect` | **轻微**——在现有函数的返回字面量里加一个字段，不改动任何已有字段 |
| `mail-worker/src/service/email-service.js` | 追加 `counts()`、`trashList()`、`markUnread()`、`restore()` 四个新方法 | 否（`list()`/`delete()` 原样保留） |
| `mail-worker/src/service/account-service.js` | **（v1.2）** 追加 `searchByKeyword()` 一个新方法 | 否（`list()`/`add()`/`setAsTop()` 原样保留） |
| `mail-worker/src/hono/webs.js` | 追加 6 行 `import '../api/xxx-api'` | 否（该文件本身就是一串 import） |
| `mail-worker/src/index.js` | 在 `scheduled()` 末尾追加 1–2 行（`api_log` 30 天清理、回收站 30 天真删） | 否（现有 5 个清理调用不动） |

除此之外全部是新增文件：`entity/api-key.js`、`entity/api-log.js`、`entity/user-setting.js`、`service/api-key-service.js`、`service/api-log-service.js`、`service/user-setting-service.js`、`api/api-key-api.js`、`api/api-log-api.js`、`api/status-api.js`、`api/dashboard-api.js`、`api/email-count-api.js`、`api/user-prefs-api.js`、`api/account-search-api.js`、`security/api-key-auth.js`。

**迁移可回滚性**：`v3_1DB()` 只做 `ADD COLUMN` 与 `CREATE TABLE`，不 `DROP`、不 `UPDATE` 存量行。若要回退前端版本，这些新列/新表留在库里不影响老代码（老代码不读它们）。

**工程约束**
- 日志写入必须 `c.executionCtx.waitUntil(...)`，不得阻塞响应；对 `GET` 类高频接口按 1/1 记录、对探活接口不记录。
- 保留策略：`api_log` 仅保留 30 天，回收站邮件同样 30 天后真删，由 `scheduled` handler 每日清理（**你已确认接受新增 wrangler cron**，见决策 9；实现时在现有 `index.js` 的 `scheduled()` 末尾追加调用，不改现有 5 个清理项）。
- 全部新增查询使用 Drizzle 参数化，**不使用字符串拼接 SQL**。
- 新增 perm key：`api-key:query/add/update/delete`、`api-log:query`、`status:query`，通过现有 `perm` 表插入，默认只给管理员角色。
- 增量 1/2/3/4/6 **不新增 perm key**：它们都是"当前用户操作自己的数据"，复用现有登录态中间件与既有的 `email:*` / 账号相关权限即可。给个人功能加权限点只会让站长多一堆需要勾选的开关。

### 10.6 验证策略

**前端（`mail-vue`）当前没有任何测试与静态检查配置**（无 vitest / playwright / eslint）。后端 `mail-worker` **已有** `vitest ~3.0.7` + `@cloudflare/vitest-pool-workers` + `vitest.config.js` + `test/index.spec.js`（走 `wrangler-test.toml`），因此下面的测试基建**只针对 `mail-vue` 新建**，后端沿用既有 vitest 配置追加用例即可。重写 1.5 万行视图而不建立验证网是不可接受的，因此 P0 阶段同时落地：

| 层 | 工具 | 覆盖 |
|---|---|---|
| 构建 | `npm run build`（已有） | 每阶段必过 |
| 静态检查 | `eslint` + `eslint-plugin-vue` + `prettier` | 新代码零 error |
| 单元 | `vitest`（前端新建；后端复用已有配置） | `utils/*`、搜索语法解析、`useQuota`、`useOptimistic`、token 对比度校验 |
| 端到端 | `playwright` | 5 条主链路：登录→收件箱→读信→复制验证码；写信→发送；新建邮箱；创建 Key→调用；改设置→持久化 |
| 视觉回归 | `playwright` 截图 | 6 关键页 × 3 断点 × 2 主题 = 36 张基线 |
| 可访问性 | `@axe-core/playwright` | 6 关键页 0 critical/serious |
| 性能 | Lighthouse CI（可选） | 首屏 JS 预算 < 260KB gzip；INP < 200ms |

E2E 需要一个可跑的后端：用 `wrangler dev` + 本地 D1（`mail-worker` 已有 wrangler 配置），种子数据脚本新增在 `mail-worker/scripts/seed.sql`。你已答复本地环境**理论上已配好**；我会在 P0 阶段第一件事就实跑一次 `wrangler dev` + `d1 migrations` 验证，**如果跑不通我直接问你**（而不是自己改 wrangler 配置去猜）。

v1.1 追加的验证项：

| 项 | 方法 |
|---|---|
| 侧栏自定义 | E2E：拖动改序 → 刷新 → 顺序保持；`Alt+↓` 与拖拽结果一致；隐藏后能从设置页恢复；收件箱/已发送不可隐藏 |
| 侧栏计数 | E2E：读一封 → 未读数 -1 且与列表一致；删一封 → 回收站 +1 |
| 回收站 | E2E：删除 → 回收站可见 → 恢复 → 回原文件夹 |
| 材质组合 | 视觉回归：登录页 Light/Dark × 有图/无图 × 粒子开/关 = 8 张基线；卡内文字对比度 ≥ 4.5:1 |
| 粒子性能 | Playwright + CDP `Performance.getMetrics`：粒子开启时长任务 0 个，帧预算 < 1.5ms；`prefers-reduced-motion` 下 RAF 停止（`requestAnimationFrame` 调用计数 ≤ 2） |
| 两级开关 | E2E：站长设 `on`/`off` → 用户侧单选组 `aria-disabled=true` 且有说明文案；设 `optional` → 用户选择生效并跨设备保持 |
| 偏好跨设备 | E2E：浏览器 A 改密度 → 浏览器 B 登录后一致 |
| **邮箱切换器（v1.2）** | E2E：切换邮箱 → 列表/计数/侧栏组头三处同步更新；`⌘⇧E` → 打字过滤 → `Enter` 全键盘完成切换；刷新后仍停在上次的邮箱；断网时打开 Picker 显示行内重试而非白板 |
| **多邮箱压力（v1.2）** | 脚本向 D1 灌 **200 个邮箱**（`account` 表，直接 `wrangler d1 execute` 造数据，不走 UI），断言：① Picker 打开后 `document.querySelectorAll('[role=option]').length ≤ 16`；② 打开动作 INP < 200ms；③ 搜索输入到结果渲染 < 400ms（本地 D1）；④ 侧栏 DOM 行数与 3 个邮箱时**完全相同**；⑤ 「我的邮箱」表格 DOM 行数 ≤ 20。这条是决策 11 的存在理由，必须有断言兜住，否则以后很容易被改回去 |

### 10.7 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| P3 邮件域回归（虚拟滚动、长轮询、增量合并） | 最高 | 先抽 composable 再换模板；保留旧组件文件至 P6；E2E 覆盖 5 条链路 |
| Reka UI 与 Vue 3.5 / IME 输入兼容 | 中 | P1 阶段先做中文输入法专项验证（Combobox、TagsInput、命令面板） |
| TinyMCE skin 与新主题不协调 | 中 | 自定义 content CSS + 深色 skin 覆写；若成本过高，评估换 `tiptap`（**不在本次范围**，只标记） |
| ECharts 主题切换重绘闪烁 | 低 | 主题变化时 `setOption(theme, notMerge)` 而非重建实例 |
| 一次性移除 EP 导致漏改 | 中 | P6 用 `grep -r "el-\|Element" src` 归零作为门禁 |
| 后端新表在已部署实例上的迁移 | 中 | 迁移 SQL 幂等（`IF NOT EXISTS`）；`init` 流程检测并自动建表（复用现有 `init/init.js` 模式） |
| i18n 漏翻导致 en 版本破碎 | 中 | 脚本对比 zh/en key 集合，差异非空则 CI 失败 |
| **侧栏计数与列表不一致**（v1.1） | 中 | `GET /email/counts` 与列表同源查询条件；乐观更新后以服务端返回校正；E2E 断言"读一封 → 计数 -1" |
| **偏好并发写覆盖**（v1.1） | 低 | `PUT /user/prefs` 整体覆盖 + 300ms debounce；最坏情况是丢失同一秒内另一标签页的一次点击，不影响数据完整性 |
| **粒子在低端设备掉帧**（v1.1） | 低 | 三重降级（点数减半 → 纯柔光 → 不启动 canvas）+ 移动端默认 0 + 用户可一键关；关掉后视觉无残缺（柔光层仍在） |
| **玻璃在背景图上对比度不足**（v1.1） | 中 | 卡片不透明度下限 0.55 + scrim 层 + 8 种组合的视觉回归基线（§10.6） |
| **站长强制开关引发困惑**（v1.1） | 低 | 用户侧置灰而非隐藏 + 说明是谁锁的；管理侧保存时提示"将置灰用户选项" |
| **邮箱切换多一次点击**（v1.2） | 中 | 这是决策 11 的已知代价。缓解：`⌘⇧E` 单键唤起 + 连按两次在最近两个邮箱间来回切 + 「最近」分组置顶 + 命令面板「切换到 …」直达。验收时若发现高频切换用户仍嫌慢，备选是给侧栏顶部加一排"最近 3 个邮箱"的小头像（**渲染量仍是常数**，不会退回 v1.1 的方案） |
| **`GET /account/search` 被当成枚举接口滥用**（v1.2） | 低 | 强制 `userId` 约束（只能搜自己的），`size ≤ 20`，`keyword` 长度 ≤ 64；无 keyword 时直接 400 而不是退化成 `list()` |
| **虚拟滚动 + Combobox 的 a11y 冲突**（v1.2） | 中 | 虚拟列表会让 `aria-activedescendant` 指向未挂载节点。对策：键盘移动时强制把目标项滚进视口后再设 `activedescendant`；P1 阶段就在 `/_ds` 用读屏（NVDA + VoiceOver）验一遍，不留到 P3 |

回滚粒度：每阶段一个 commit（或一个 PR）。任何阶段出问题，`git revert` 该阶段即回到上一个可用状态；`compat-ep.css` 在 P6 前始终存在，保证旧页面永远能渲染。

### 10.8 交付顺序建议

如果你希望**尽早看到效果**而不是等 11 周，建议把 P0 + P2 作为第一个可演示里程碑（约 9 人日）：那时全站已经是新配色、新三栏壳、带粒子的玻璃卡登录页、顶栏统一搜索与命令面板，而内部页面仍是旧版——视觉冲击已经完成 70%，剩余阶段逐页替换。

v1.1 补充一条：`FolderTree` 虽然排在 P3，但它是**纯新增、不碰旧逻辑**的组件，如果你想在第一个里程碑就看到"Outlook 式左栏"，可以把它提前到 P2 末尾（+2 人日，`GET /email/counts` 一并前移）。这是本方案里唯一一处我建议你按"想先看到什么"来排序的地方。

v1.2 补充：若 `FolderTree` 前移，**`MailboxPicker` 必须一起前移**（+2 人日，含增量 6）。原因是侧栏只显示当前邮箱的文件夹，没有 Picker 的话新左栏无法切换邮箱，旧 `account/index.vue` 又已经不在新 shell 的布局位置上。两者是一个不可拆的最小单元。

---

## 附录 A. 快捷键速查卡（`?` 面板内容 · v1.2 按新 IA 更新）

```
全局                          邮件列表                    阅读
⌘K   命令面板                 j / k   下一封 / 上一封      [ ]  上/下一封
/    顶栏搜索                 Enter   打开                r    回复
c    写信                     x       勾选                y    复制发件人
,    设置中心                 ⇧x      区间勾选            #    删除
g i  收件箱                   a       全选                u    切换未读
g s  已发送                   s       星标                s    星标
g d  草稿                     u       切换未读
g t  星标                     #       删除                写信
g x  回收站                   v       阅读窗格位置        ⌘↵   发送
g m  我的邮箱                 ⇧D      列表密度            ⌘S   存草稿
g k  API Keys ※               Esc     取消选择            Esc  关闭
g a  管理后台 ※
⌘⇧E 切换邮箱（连按两次      侧栏                        表格
     = 回到上一个邮箱）      Alt+↑↓  移动文件夹          n    新建
⌘⇧L 切换主题                 Alt+←→  折叠 / 展开         ↑↓   移动行焦点
?    本面板                   ⇧F10    右键菜单            Space 选中 / ↵ 打开
Esc  关闭 / 返回                                        ※ 无权限时不显示
```

v1.1 变化：`g o`（概览）与 `g ,` 取消——概览已按受众拆分（§5.3.2），设置改为单键 `,`；新增 `g x`（回收站）、`g a`（管理后台）、`v` / `⇧D`（窗格与密度）、以及整组侧栏键位（拖拽的键盘等价物，a11y 硬要求）。带 ※ 的两项按权限显示，无权限用户的 `?` 面板里**不出现**该行（而不是置灰——那会告诉普通用户"这里有个你进不去的后台"）。

v1.2 变化：`⌘⇧E` 的语义明确为"打开 `MailboxPicker` 并聚焦其搜索框"，并新增"连按两次 = 在最近两个邮箱间来回切"。因为侧栏不再列出所有邮箱，这个键位从"锦上添花"升级为**主要切换路径**，所以它在 `?` 面板里排在全局区靠前位置。

## 附录 B. 待确认项：无（全部已确认）

**B-1 ~ B-4（v1.0 提出）已全部有结论：**

| 编号 | 问题 | 你的答复 | 落到方案哪里 |
|---|---|---|---|
| B-1 | 登录页粒子背景（我原本建议不做） | **做**，且管理侧/用户侧双层开关，管理强制时用户侧禁用 | §0.3、§4.12、§8.5、§9.3、§9.5、§10.5 增量 4/5 |
| B-2 | 真标签延后 v2，首版用智能筛选器 | 可以 | §5.1 数据源审计、§7.5 |
| B-3 | 允许为 `api_log` 清理新增 wrangler cron | 可以 | §10.5 工程约束（并顺带承担回收站 30 天真删） |
| B-4 | 本地是否具备 wrangler + D1 环境 | 理论上已配好，不行就问你 | §10.6：P0 第一件事实跑验证，失败即提问，不自行改 wrangler 配置 |

**B-5 ~ B-8（v1.1 提出，你已在 v1.2 审阅中全部答复）：**

| 编号 | 问题 | 你的答复 | 落到方案哪里 |
|---|---|---|---|
| B-5 | 垃圾邮件文件夹（黑名单邮件在 `email/email.js:53-58` 直接 `setReject()` 不入库，要做必须改收信行为） | **暂缓** | 决策 12；§5.1 数据源表标注「暂缓」；列 v2 |
| B-6 | 用户偏好存库还是只存 localStorage | **存库** | 决策 13；§10.5 增量 4（`user_setting` + `GET/PUT /user/prefs`），localStorage 降为首帧写透缓存 |
| B-7 | 管理后台安家 `/settings/admin/*` 的折衷（顶栏不再出现独立「管理」按钮，靠 `admin/overview` 做完整控制台 + 头像菜单直达 + `g a`） | **可接受** | 决策 14；§5.2、§5.3.6、附录 A |
| B-8 | 概览页一拆二 + 头像菜单常驻 `MiniQuota` | **接受** | 决策 15；§5.3.2、§6.2 `MiniQuota`、§5.1 Topbar |

**v1.2 新增的待确认项：无。** 本版对你第 1 点的落实（`MailboxPicker` + 侧栏单邮箱）是在既定决策边界内的结构选择，不需要新的取舍授权；唯一的已知代价（切换多一次点击）已写入 §10.7 风险表并给了三条补偿路径与一个备选方案。

如果这一版没有异议，第一阶段即结束，可以按 §10.4 的 P0 开工。

## 附录 C. 顺带发现的后端问题（**按你的要求：UI 全部完成后再动**）

> 状态：**冻结**。你的指示是"彻底完成以上所有内容后再做修改"，因此本次与整个 P0–P6 期间都不碰这三处。此处仅作记录，避免遗忘；等 UI 收尾后重新立项。

1. `mail-worker/src/service/public-service.js:138-142` — `addUser` 用字符串拼接构造 `INSERT` SQL，`email` / `roleName` 直接来自请求体，存在 SQL 注入面。建议改为 Drizzle 参数化批量插入。
2. 同文件 `genToken`（`:163-172`）— 全局单一 UUID 写入 KV，无过期、无作用域、无吊销记录；新 API Key 体系上线后应将其标记弃用并加过期。
3. `mail-vue/src/views/email/index.vue:77-131` — `while(true)` 无退出条件的长轮询，路由离开时靠 `continue` 空转而非停止定时器；建议改为 `watch` 路由 + `AbortController`。
   - 注意：第 3 条是**前端**代码，且 P3 会整体重写 `views/email/`，所以它会在 P3 自然消失，不需要单独立项——冻结只针对第 1、2 条后端修复。
   - **v1.2 提醒**：增量 6 的 `searchByKeyword()` 必须用 Drizzle 的 `like()` 参数化写法，绝不能因为"只是个搜索"而拼字符串，否则等于在冻结第 1 条的同期又新造一个同类问题。这条已写进 §10.5 增量 6 与工程约束。

---

*本文档为第一阶段交付物，v1.2 为终稿候选：附录 B 已无待确认项。你确认后即进入第二阶段，按 §10.4 的 P0 开始实施；P0 第一件事是实跑 `wrangler dev` + 本地 D1，跑不通我会直接问你，不自行改 wrangler 配置。*

















