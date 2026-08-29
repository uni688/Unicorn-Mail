/goal 依据 `@doc/UI-UX-Redesign-Proposal.md` §10.4 的 **P4 阶段**（管理域 DataTable + 开发者中心 + 后端增量），在 `feat/ui-redesign` 分支上实施。

> 本文是 **v2**。v1 的流程骨架保留，但其中若干前提与本仓库实际不符（Preview 环境、测试命令、`el-table` 数量、迁移函数名、perm 机制、账号闭环）。**第零章是已核实的仓库事实，与 v1 或设计文档冲突时以第零章为准。**

---

## 零、开工前必读：已核实的仓库事实

下面每一条都已在代码里核对过（`feat/ui-redesign` @ `40dffac`）。开工时**自己复验一遍**（仓库可能已前进），但不要用文档的说法去覆盖代码的事实。

### 0.1 `el-table` 是 4 处，不是 6 处；其中 1 处不属于 P4

| 文件 | 行数 | `el-table` 标签数 | P4 处理 |
| --- | --- | --- | --- |
| `mail-vue/src/views/user/index.vue` | 1294 | 29 | ✅ 迁 DataTable |
| `mail-vue/src/views/role/index.vue` | 551 | 10 | ✅ 迁 DataTable |
| `mail-vue/src/views/reg-key/index.vue` | 569 | 5 | ✅ 迁 DataTable |
| `mail-vue/src/views/sys-setting/index.vue` | 2015 | 5 | ❌ **P5 的事**，P4 不碰 |

`sys-setting` 的表格嵌在 9 张卡片里，P5 拆 section 时会连带重写；P4 去动它只会制造一次白干的冲突。

### 0.2 `all-email` 根本没有 `el-table`

`views/all-email/index.vue`（510 行）复用的是**旧 `emailScroll` 虚拟列表**（`type='all-email'` + `show-user-info` + `show-status`），不是表格。见 §4.2 的处理规则——这是 P4 唯一需要你先判断再动手的一项。

### 0.3 没有 Preview 环境；push 本分支不会触发任何 Action

`.github/workflows/deploy-cloudflare.yml` 的实际行为：

- 触发条件只有 `push: branches: [main]`（+ `workflow_dispatch`）。**push `feat/ui-redesign` 不会触发任何 workflow。**
- 它跑 `wrangler deploy -c wrangler-action.toml`，**直接部署生产**，不存在 preview 环境（日志里那句 "Preview URL not available" 是措辞误导，指的是生产 worker URL）。
- worker URL 被 `::add-mask::` 打码、且 `grep -v` 从日志里滤掉了，**Action 日志里读不到 URL**。
- 部署后会 `curl "$WORKER_URL/api/init/$JWT_SECRET"` 跑迁移；`retain_days: 1` 会删除历史 run。

**因此 v1 的第八、九章（等 Action → 拿 Preview URL → 上 Preview 实测）在本仓库无法执行。** 正确做法见 §7：验收全部在**本地 `wrangler dev` + `vite dev`** 上做；合 main / 上生产是**用户的决定**，不由本次执行发起。

### 0.4 ⚠️ `mail-worker` 的 `npm test` 是一次真部署，不要跑

```jsonc
// mail-worker/package.json
"test": "wrangler deploy --config wrangler-test.toml"   // ← deploy，不是 test
```

v1 说的「运行项目现有测试命令」如果照字面在 `mail-worker` 里执行，会**向 Cloudflare 发起一次部署**。

P4 只准用这三条命令（全部在 `mail-vue/` 下执行）：

```bash
cd mail-vue && node node_modules/vitest/vitest.mjs run
```

```bash
cd mail-vue && node node_modules/vitest/vitest.mjs run --project worker
```

```bash
cd mail-vue && node node_modules/vite/bin/vite.js build --mode release
```

原因（见 `mail-vue/vitest.config.js` 顶部注释）：worker 的服务层用例挂在**前端**这份 config 的 `worker` project 下，跑 node + `node:sqlite` 替身库、由真 `dbInit.init()` 建表；`mail-worker/vitest.config.js` 的 `vitest-pool-workers` 在本机起不来（`Failed to import "node:vm"`）。

- 现有用例约 **1268 个**（`web` + `worker`），P4 结束时必须全绿且**数量只增不减**。
- 新增 worker 用例的文件名必须是 `*.node.spec.js`，放 `mail-worker/test/`，否则不会被收集。
- 前端用例可与组件同目录（`src/**/*.spec.js`）或放 `mail-vue/test/`，两种都会被收。

### 0.5 迁移函数名 `v3_1DB()` 已被占用 → P4 用 `v3_2DB()`

`mail-worker/src/init/init.js` 的链已经到 `await this.v3_1DB(c)`（内容是 `ALTER TABLE email ADD COLUMN del_time TEXT`，P3 回收站留下的）。文档 §10.5.2 写的「新增 `v3_1DB()`」**已过期**。

P4 新增 `async v3_2DB(c)`，并在 `init()` 链末尾追加 `await this.v3_2DB(c);`。沿用现有幂等写法：每条 SQL 各自 `try/catch` 吞「列已存在」，只做 `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN`，**不 DROP、不 UPDATE 存量行**。

### 0.6 权限不是注解，是 `security.js` 里的两张手写表

`security.js` 是一个 `app.use('*')` 中间件，靠 **path 前缀匹配**工作：

- `exclude[]`：免登录前缀白名单。
- `requirePerms[]`：需要权限校验的**路径前缀**列表。不在这张表里的路径**只校验登录态**。
- `premKey{}`：`perm key → 路径数组` 映射（变量名就是拼错的 `premKey`，别顺手改）。
- 逃逸口：`authInfo.user.email === c.env.admin` 的账号跳过全部 perm 校验。

新增接口必须同时改三处，漏一处就是越权或永久 403：

1. `requirePerms[]` 加路径前缀；
2. `premKey{}` 加映射；
3. `init/init.js` 的 `v3_2DB()` 里 `INSERT INTO perm (...)` 加行。

`perm_id` 是**硬编码整数**，现已占用 `1–19, 21–36`。P4 从 **37** 起顺序取值，`pid` 指向新建的分组行，`type` 沿用现有语义（0/1 = 分组，2 = 权限点），`name` 与现有行一致为**中文字面量**（这张表没有 i18n，别在这里发明双语）。

前端一侧：`mail-vue/src/perm/perm.js` 用 `permsToRouter(permKeys)` **动态注入**管理页路由，并按权限注入旧路径的 `redirect` 别名；`hasPerm()` 与 `v-perm` 指令做元素级裁剪；`permKeys` 含 `'*'` 时全通。新页面**必须**走这套注入，不能静态注册——没权限的用户访问旧路径时，静态别名会重定向到不存在的目标，vue-router 是**抛错**而不是落 404。

### 0.7 P3 已确立「后端增量落在哪」的先例

文档 §10.5.2 让 P3 新建 `api/email-count-api.js`；实际 P3 把 `counts` / `trashList` / `restore` / `purge` / `markUnread` **追加进了现有 `api/email-api.js`**，并在 `requirePerms` / `premKey` 里就地加注释说明理由。`api/` 目录至今仍是 18 个文件，`hono/webs.js` 也没多 import。

**P4 沿用这个先例**：属于已有资源的路由追加到对应 `*-api.js`；只有**全新资源**（`api-key`、`api-log`、`status`、`dashboard`）才新建文件，并在 `hono/webs.js` 追加 import（否则 Hono 根本注册不到路由——它靠 import 副作用）。

### 0.8 P4 的开发者中心还没有「设置中心壳」可挂

`SettingsShell`（左 220px 分组导航）是 **P5** 的交付物。当前 `perm.js` 里管理页已经搬到 `/settings/admin/*` 这些 path，但**没有壳**——每个页面还是独立整页。

所以开发者中心四个条目在 P4 里就用 `/settings/developer/{keys,logs,console,docs}` 四个独立路由，**页内不做 Tab**（§5.3.5 明确「不再做成页内 Tab」）。四页共用一个轻量 `DeveloperNav`（横向分段控件即可，不要提前造 `SettingsShell`），P5 接壳时把这个 nav 删掉即可。**在总结里把这条列为「P5 需回收的过渡件」。**

### 0.9 「API Key 属于谁」文档自相矛盾，按下述口径实现

- §10.5 表结构 `api_key.user_id` + §5.3.5 的界面 → Key 是**用户自己的**资源。
- §10.5.2 又说 `api-key:*` / `api-log:query`「默认只给管理员角色」。

两者不能同时成立。P4 采用的口径（**写进偏差说明**）：

- **数据边界**：所有 `api_key` / `api_log` 查询强制 `and(eq(userId, 当前用户))`，与 P3 增量 6 同一套写法。越权在 SQL 层就无从发生，不依赖 perm。
- **权限点**：`api-key:query/add/update/delete`、`api-log:query` 仍然新增并进 `requirePerms`，语义是**「允许使用开放 API 能力」的功能开关**（站长可对某角色整体关掉），不是数据隔离手段。默认只给管理员角色，与 §10.5.2 一致。
- **`status:query`** 是全站探活，属于纯管理员权限，无用户维度。

### 0.10 `/open/*` 的鉴权必须绕开现有登录中间件

`security.js` 的 `app.use('*')` 会对任何不在 `exclude[]` 里的路径要求 `TOKEN_HEADER` 的 JWT。`/open/*` 用的是 `Authorization: Bearer um_live_…`，走 JWT 校验必定 401。

做法：`exclude[]` 追加 `'/open'`，然后**新建** `security/api-key-auth.js`，注册 `app.use('/open/*', …)` 做 Bearer 校验 → 查 `api_key` → 比对 `salt+hash` → 校验 `status`/`expire_time`/`scopes` → `c.set('user', …)`。**注意中间件注册顺序**：`hono/webs.js` 里 `import '../security/security'` 在最前，新中间件的 import 必须在它之后。

### 0.11 现成可复用的东西（写之前先看）

- **L1 组件 41 个**已在 `mail-vue/src/components/ui/`，统一从 `@/components/ui` 桶文件导出。P4 直接可用的：`Pagination`、`Checkbox`、`DropdownMenu`、`Combobox`、`DatePicker`、`Select`、`Skeleton`、`Tooltip`、`Badge`、`Code`、`CopyButton`、`Segmented`、`Dialog`、`AlertDialog`、`Sheet`、`ScrollArea`、`Tree`、`Meter`、`Field`。**`DataTable` 不存在——它是 P4 要造的第一个 L2 组件。**
- **Toast**：`@/components/ui` 的 `toast.js`（vue-sonner）。全库还剩 **13 个文件**用 `ElMessage`，其中 user/role/reg-key 就在 P4 范围内——迁表格时顺手换掉，别新增 `ElMessage`。
- **composables**：`useSelection`（批量选择）、`useVirtualRows`（虚拟滚动）、`useQuota`、`useCounts`、`useSearchQuery`、`useHotkeys`、`useCommandPalette`。DataTable 的选择模型**必须**用 `useSelection`，不要再写一套。

- **`/_ds` 设计系统预览页**（`views/design-system/`）：新 L2 组件的全变体展示挂这里，是 P1 起的既有约定。**DataTable 的四态（loading/empty/error/data）× 双主题必须在 `/_ds` 上可见**，这是人工过审的入口。
- **i18n**：`i18n/zh.js`(617) / `i18n/en.js`(613)。新增文案**两边同时加**，`test/ui-i18n.spec.js` 会校验。
- **既有测试基线**：`test/` 下有 `a11y-axe`、`design-tokens`、`legacy-css`、`router-routes`、`theme-switch`、`ui-barrels`、`ui-i18n` 七个契约测试。**新增路由必须同步 `router-routes.spec.js`，新增 ui 导出必须同步 `ui-barrels.spec.js`，否则红。**

### 0.12 环境三个坑（来自 P0–P3 实测）

- **`C:` 盘会满导致 ENOSPC**：跑 pnpm/vitest/build 前把 `TEMP`/`TMP` 指到 `D:\tmp-build`；长日志写文件再读，不要指望终端回显。
- **只用 corepack pnpm + hoisted**，不要切包管理器或改 `node-linker`。
- **`/_ds` 与任何登录后页面都需要先起 `wrangler dev`**，否则请求全挂、页面白屏。

---

## 一、基准线与红线

1. **`doc/UI-UX-Redesign-Proposal.md` 是唯一设计基准线**；§0 是唯一「实现事实」基准线。
2. 动手前完整读：§10.4 的 P4 行、§5.3.5、§6.2 `DataTable`、§7.8 状态矩阵、§7.9 a11y 验收线、§10.5 + §10.5.1 + §10.5.2、附录 C（**冻结中，P4 不实施**）。
3. 禁止脱离文档自创 UI/交互/架构；禁止为省事削减需求或用 Mock 冒充。
4. **最小必要修改 + 最大复用**。P4 无关代码不重构，不删功能，不删测试，不为过测改预期。
5. 附录 C 的安全问题**继续冻结**到 UI 全部完成——除非它正好挡住 P4 的实现，此时按 §3 走偏差流程。

---

## 二、开工前的定向审计（不要泛读全库）

§0 已经替你审完了骨架。剩下的审计**只读这些文件**，读完输出实施计划：

**前端**

- `views/user/index.vue`（1294 行，29 个 `el-table` 标签 —— P4 最大的一块）
- `views/role/index.vue`、`views/reg-key/index.vue`、`views/all-email/index.vue`
- `components/ui/index.js`（桶导出约定）、`components/ui/Pagination/`、`_shared/`（cva 变体写法）
- `composables/useSelection.js`、`useVirtualRows.js`
- `perm/perm.js`、`router/index.js`
- `request/`（请求层：拦截器、错误提示、取消）

**后端**

- `security/security.js`（三张表 + admin 逃逸口）、`security/user-context.js`
- `init/init.js`（`init()` 链、`v3_1DB()`、perm 种子的 `perm_id` 分配）
- `service/user-service.js` / `role-service.js` / `reg-key-service.js` / `all-email` 相关：**逐个确认现有 list 接口的分页契约**（游标 vs offset、`size` 上限、排序字段、筛选参数）
- `service/email-service.js` 的 `counts()` / `trashList()`（P3 的写法样板）
- `utils/crypto-utils.js`（Key 的 salt+hash 复用它）
- `index.js` 的 `scheduled()`（P4 要在末尾追加 `api_log` 30 天清理）
- `entity/orm.js`（Drizzle 表定义约定）

**审计要回答的关键问题**（答不上来就别开工）：

1. `user/role/regKey/allEmail` 四个 list 接口**分别**是什么分页语义？DataTable 的 `Pagination` 能不能直接对上，还是需要 offset 型的新参数？（若需要新参数 → 走「新增可选参数，缺省行为不变」）
2. 现有表格的**排序**是前端排还是服务端排？服务端不支持的排序列，DataTable 上要不要显示排序箭头？（不支持就**不显示**，别给假交互）
3. `views/user/index.vue` 里 29 个 `el-table` 标签具体是几张表？（用户表 / 用户下的邮箱表 / 弹窗内嵌表？）每张的批量操作与权限点分别是什么？
4. `all-email` 的 `emailScroll` 是否还被别的页面共用？（P3 备注里「剩 email-scroll（草稿/管理端）」）

**实施计划的输出格式**（简短，不要长篇）：新增文件清单 / 修改文件清单 / 复用组件清单 / 新增接口清单 / 迁移 SQL / 新增 perm key 与 `perm_id` / 补测清单 / 提交切分方案。

---

## 三、文档与实现冲突的处理

发现下列任一情况**不得静默修改**：文档有错、与代码不一致、API 已变、技术栈不支持、可读性/响应式/可访问性/安全/性能出问题、与 P0–P3 已实现冲突。

必须：判断是否真需要偏离 → 选对原设计影响最小的方案 → **在 `UI-UX-Redesign-Proposal.md` 里加「实施说明 / 偏差说明」** → 记录「原方案 / 实际问题 / 为什么不能照做 / 实际方案 / 影响」→ 在 P4 总结里再列一次。

纯个人偏好**不算**偏离理由。

**§0 里已确认的偏差（0.1 / 0.2 / 0.5 / 0.8 / 0.9）直接按 §0 实现**，但仍要在设计文档里补齐偏差说明并进总结——这不是让你重新论证，是让文档追上代码。

---

## 四、P4 实现要求

### 4.1 `DataTable`（P4 的地基，第一件事）

按 §6.2 实现为 L2 组件：`components/ui/DataTable/`，从 `@/components/ui` 导出，在 `/_ds` 上展示全部状态 × 双主题。

- **四态齐备**（§7.8）：`loading`（Skeleton 行，不是转圈遮罩）/ `empty`（EmptyState + 主行动）/ `error`（ErrorState + 重试）/ `data`。
- **选择**用 `useSelection`，遵守 §7.4：不允许「全选其实只选了当前页」。跨页选择要么不做，要么明示「已选 N 项（跨 M 页）」。
- **排序/筛选服务端优先**；服务端不支持的列**不显示**排序控件。
- **分页**复用 `Pagination`。
- **列定义**走 `columns` 配置数组（`key/label/width/align/sortable/formatter/slot`），不要靠一堆具名插槽拼装。
- **a11y**：真 `<table>` 语义 + `scope`、行选择框有可访问名、键盘可达、focus ring 用 §4.7 的 token。
- **响应式**：窄屏折叠为卡片式行或横向滚动容器（择一，写进偏差说明），不允许出现横向溢出撑破布局。

### 4.2 管理域三张表 + `all-email`

**必须真替换**，不是新增一个没人用的组件。迁完 `grep -rn "el-table" src/views/{user,role,reg-key}` 必须为 0。

每张表逐项验：分页 / 排序 / 筛选 / 批量操作 / loading / empty / error / 响应式 / 双主题 / 权限裁剪 / **原有业务动作一个不少** / i18n（zh+en 同步）。

**`all-email` 的处理规则（唯一需要判断的一项）**：它现在是 `emailScroll` 虚拟列表。先回答「这一屏的用户任务是逐条读信，还是按用户/域名/状态批量筛查」。

- 若判断为**表格任务** → 迁 DataTable，但必须解决大数据量：DataTable 需支持虚拟行（复用 `useVirtualRows`）或明确改服务端分页；**不允许**一次渲染上万行。
- 若判断为**列表任务** → 保留 `emailScroll`，只做视觉对齐（token、状态色、行高、右键菜单换 `ContextMenu`），并在偏差说明里写清「§10.4 的 all-email 迁表不执行」的理由。

两条路都可以，**但必须在实施计划里先说结论再动手**，不要写一半再换。

### 4.3 开发者中心四页（§5.3.5）

路由 `/settings/developer/{keys,logs,console,docs}`，走 `perm.js` 动态注入，**页内不做 Tab**（§0.8）。

- **API Keys**：列表（名称 / 前缀 / 权限 / 最近使用 / 状态 / 行菜单）；创建流程「名称 → scopes 勾选 → 过期时间 30/90/365/永不 → 一次性明文 + cURL 片段」；明文**只在 POST 响应里出现一次**，库里只存 `prefix` + `salt` + `hash`（复用 `crypto-utils`）。
- **请求日志**：虚拟列表（`useVirtualRows`）+ 行展开摘要；筛选 Key/路径/状态码/时间范围；状态码用语义色点；顶部 `2xx/4xx/5xx` 统计条。
- **调试台**：纯前端，从内置 OpenAPI 描述表生成表单；**默认不发请求**，显式点「发送」；写操作二次确认；右侧响应 JSON 折叠树 + 耗时 + cURL/fetch/requests 三种片段。
- **文档**：内置接口索引（method/path/参数/示例），标注 `/public/*` 为 Deprecated 并引导到 `/open/*` + Bearer。

### 4.4 API Key 闭环（P4 的验收核心）

必须跑通真实链路，**任一环用假数据都算 P4 未完成**：

> 创建 Key → 落库（只存 `salt+hash`）→ 一次性明文 + 复制 → 用该 Key 请求 `/open/email/list` → `api_log` 落一条 → 请求日志页看到它 → 停用 Key 后同一请求返回 401 → 过期 Key 同样 401

配套的负面用例（必须有自动化测试，不能只手测）：

- 错误 Key / 缺 `Authorization` 头 / `Bearer` 格式不对 → 401
- Key 有效但 scopes 不含该资源 → 403
- Key 属于用户 A，去读用户 B 的数据 → 查不到（SQL 层已限定 `user_id`）
- `api_log` 写入用 `c.executionCtx.waitUntil(...)`，**不阻塞响应**；探活接口不记日志

### 4.5 后端与数据库

**新增表** `api_key` / `api_log`（SQL 与索引见 §10.5），放进 **`v3_2DB()`**。

**新增文件**：`entity/api-key.js`、`entity/api-log.js`、`service/api-key-service.js`、`service/api-log-service.js`、`api/api-key-api.js`、`api/api-log-api.js`、`security/api-key-auth.js`、`api/open/*`（或 `api/open-api.js`）。

**追加的现有文件**（只追加，不改既有分支）：`init/init.js`（`v3_2DB` + perm 种子）、`hono/webs.js`（import）、`security/security.js`（`exclude` 加 `/open`、`requirePerms` + `premKey` 加行）、`index.js`（`scheduled()` 末尾追加 `api_log` 30 天清理）。

**约束**：全部查询用 Drizzle 参数化，**禁止字符串拼 SQL**（附录 C 里那个拼接问题是反例）；`size` 有上限；`keyword` 类参数 `trim` + 长度上限 + 转义 `%` `_`。

**不在 P4 范围**（属 P5，别顺手做）：`/dashboard/overview`、`/status/overview`、`/status/domains`、`/activity`、`user_setting` 表与 `/user/prefs`、`setting.bg_effect`。
> 例外：`status:query` 这个 perm key 如果只有 P5 用到，就 **P5 再加**；P4 不要插入用不到的权限行——`perm_id` 一旦发出去就不好回收。

### 4.6 明确不做

`sys-setting` 拆分、`SettingsShell`、概览一拆二、`MiniQuota`、卸载 element-plus、删 `/test`、附录 C 安全修复。

---

## 五、实施顺序

每一步结束都必须**构建通过 + 全量测试绿 + 应用可用**，且可单独回退。

1. `DataTable` + `/_ds` 展示 + 组件测试 → commit
2. `reg-key`（569 行，最小的一张，用来打磨 DataTable 的 API）→ commit
3. `role`（551 行，含权限树交互）→ commit
4. `user`（1294 行 / 29 个表标签，最重的一块，**建议单独拆 2 个 commit**：主表 → 关联邮箱表/弹窗）→ commit
5. `all-email`（按 §4.2 的判断结果）→ commit
6. 后端：`v3_2DB` + 两张表 + entity + service + api + perm 三处 + worker 层用例 → commit
7. `security/api-key-auth.js` + `/open/*` + `api_log` 写入 + `scheduled` 清理 + 用例 → commit
8. 开发者中心四页 + 路由注入 + i18n + 前端用例 → commit
9. 文档回填（偏差说明 / 实施说明）+ 全量回归 → commit

**先抽逻辑再换视图**（P3 验证过的策略）：`user/index.vue` 这种体量，先抽 `useUserAdmin()` 之类的纯逻辑 composable、保持模板不动跑通，再换模板。任一步出错都能单独回退。

---

## 六、测试要求

每完成一个模块**立即**跑，不要攒到最后。命令只用 §0.4 那三条。

- **前端**：`DataTable` 四态 + 选择模型 + 排序/分页交互 + 权限裁剪（有权限/无权限两种 `permKeys`）+ 三张表的关键动作。
- **后端**：`api-key-service`（创建/hash 比对/停用/过期/scopes）、`api-log-service`（写入/筛选/分页/30 天清理）、`api-key-auth` 中间件的 401/403 分支、`v3_2DB` 幂等（连跑两次不报错）。新文件名 `*.node.spec.js`。
- **契约测试**：新增路由同步 `test/router-routes.spec.js`；新增 ui 导出同步 `test/ui-barrels.spec.js`；新文案两语言同步（`ui-i18n.spec.js`）；a11y 走 `test/a11y-axe.spec.js` 的既有模式，新页面 **0 critical / 0 serious**。

测试失败时：先判断是代码 / 测试 / 环境问题 → **优先修代码** → 不允许简单跳过或改预期 → 确实是环境问题（如 §0.12 的 ENOSPC）在报告里写清。

**基线**：结束时 `web` + `worker` 两个 project 全绿，用例总数 **≥ 1268 且只增不减**。

---

## 七、本地实测（替代 v1 的 Preview 实测）

§0.3 已说明没有 Preview。实测在本地做，两个服务都要起：

```bash
cd mail-worker && node node_modules/wrangler/bin/wrangler.js dev --config wrangler-dev.toml --port 8787
```

```bash
cd mail-vue && node node_modules/vite/bin/vite.js --mode dev
```

前端 `.env.dev` 已指向 `http://127.0.0.1:8787/api`；`.claude/launch.json` 里有 `mail-worker-dev` / `mail-vue-dev` 两个配置，用 preview 工具起更省事。**先起 worker，否则页面白屏**（§0.12）。

首次需要先访问 `/api/init/<JWT_SECRET>` 让迁移链跑一遍（`wrangler-dev.toml` 里的本地 JWT_SECRET），确认 `v3_2DB()` 建表成功；**再跑第二次**确认幂等。

测试账号：`ai` / `I am an AI!!!`（仅本地库；线上账号不在本次范围）。

实测清单（逐项记录结论，不许写「已验证」了事）：

1. 登录 → 管理域三张表：分页 / 排序 / 筛选 / 批量 / 空数据 / 大量数据
2. 权限裁剪：用一个**缺少 `user:query` 等权限**的角色账号，确认路由未注入、菜单不出现、直接敲 URL 落 404 而不是白屏/报错
3. 开发者四页：创建 Key → 复制明文 → `curl` 打 `/open/*` → 日志页出现该条 → 停用后 401
4. 调试台：不点「发送」时确实零请求；写操作有二次确认
5. Light / Dark / system 三主题；Desktop / Tablet / Mobile 三档
6. 浏览器 console 无**新增**错误；Network 无预期外 4xx/5xx
7. 对比度用 `preview_eval` 做文本测量（截图工具在本机不可用，见 §0.12）

---

## 八、Git 流程

分支：**`feat/ui-redesign`**（P4–P6 都在这条上，本地同名跟踪 `origin/feat/ui-redesign`）。

开工前：

```bash
git status && git branch --show-current && git log --oneline -10
```

注意 `origin` 的 fetch refspec 曾被限成只抓 `main`，`--set-upstream` 可能报错；遇到就先确认 refspec 再处理，**不要**用 `push -f` 之类的手段绕。

提交：按 §5 拆成 9 个左右的逻辑 commit，每个都能单独构建通过。message 用现有风格（`feat(ui):` / `feat(api):` / `test(p4):`），中文正文说清「做了什么 + 为什么」。

push 前 `git diff` / `git status` 逐项过一遍，确认没有夹带无关改动、没有临时文件、没有密钥。

**红线**：

- 不得直接 push `main`；不得合并到 `main`——**合 main 等于部署生产**（§0.3），那是用户的决定。
- 不得 `push -f` / `reset --hard` / `clean -f` / `branch -D`。
- 不得触发 `workflow_dispatch`，不得在 `mail-worker` 里跑 `npm test` 或 `wrangler deploy`。
- 需要用户决策的只有一件事：**P4 验收通过后是否合 main / 上线**。到那一步停下来问。

---

## 九、最终总结必须包含

1. **Checklist 逐项**对应文档 P4：✅ 已完成 / ⚠️ 部分完成 / ❌ 未完成。禁止笼统写「P4 已完成」。
2. **文件清单**：重要新增/修改文件及作用。
3. **偏差说明**：逐项按「原方案 / 问题 / 原因 / 实际方案 / 影响」写；§0 里那 5 项**必须出现**在这里。没有其他偏差就明写「除上述外未发现需要偏离设计文档之处」。
4. **测试结果**：实际执行的命令 + 用例数 + 通过数（前后对比）。
5. **Git**：每个 commit 的 hash + message + 分支 + push 状态。
6. **本地实测**：§7 清单逐项结论（含权限不足账号的表现）。
7. **P5 需回收的过渡件**：`DeveloperNav`、以及任何为绕开缺失 `SettingsShell` 而加的临时结构。
8. **剩余问题**：未解决的一律列出，不许为了给「完成」结论而隐藏。

---

## 十、执行纪律

> 复验 §0 → 定向审计 → 出计划 → 按 §5 逐步实现 → 每步测试 → 每步 commit → 本地双服务实测 → 修复 → 回归 → 文档回填 → 总结 → 问用户是否合 main

不要假设自己完成了。P4 完成的证据是：**四张表 `el-table` 归零**、**Key 闭环在本地真跑通（含 401/403 负面用例）**、**1268+ 用例全绿**、**构建通过**、**权限不足账号表现正确**。缺一条就是「部分完成」，如实写。
