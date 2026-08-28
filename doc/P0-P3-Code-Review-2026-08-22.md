# P0–P3 UI 重构上线前审计报告

- 日期：2026-08-22
- 分支：`feat/ui-redesign-p0`
- 审阅范围：`git diff main...HEAD`，即 P0 `a92f9b6` → P1 `72f890c` → P2 `adbe2d7` → P3 `5bb391d` `876f0c9`
  共 295 文件 / +37279 −4864
- 方法：10 路独立静态审查（逐行、删除行、跨文件、语言陷阱、包装层、复用、简化、效率、层次、约定）
  → 单票三态验证 → 补漏扫描 → **真实浏览器流程验证**（wrangler dev 8787 + vite dev 3001，本地 D1 fixture）
- 立场：不信任当前实现，主动攻击设计假设

## 结论

**NEED FIX**（审计当天）→ **已全部修复并复验**（2026-08-28，见下方「修复状态」）

审计当天不建议上线：存在 1 个「两次点击即可复现」的 P0 功能性崩溃，以及 2 个会**永久丢失用户邮件**
的 P1 数据安全缺陷。P0 与 P1-1/P1-2 修完后可以再评估。

P0/P1 全部经真实浏览器与真实 worker 验证，非静态推断。

16 项现已在 `fix/audit-p0-p3-2026-08-22` 上修完，并补了 worker 服务层与前端两侧的自动化用例
（82 文件 / 1481 用例全绿）+ 一轮浏览器过审。范围内的缺陷不再阻塞上线；仍未覆盖的部分见文末。

### 严重级别口径

| 级别 | 含义 |
|---|---|
| P0 | 核心功能不可用 / 上线即暴露，必须修 |
| P1 | 数据丢失、跨用户数据残留、主要流程可见错误，必须修 |
| P2 | 特定条件下功能错误或资源风险，建议本次修 |
| P3 | 缺陷成立但影响有限，可排期 |

### 一览

| # | 级别 | 位置 | 问题 | 已验证 |
|---|---|---|---|---|
| P0-1 | P0 | `email-service.js:54` + `useMailboxes.js:227` | 「全部邮箱」使 `/email/list` 返回 code 500 | 浏览器 + API |
| P1-1 | P1 | `email-service.js:1173` | `restore()` 不清 `del_time`，再删的邮件次日即被物理删除 | 代码 |
| P1-2 | P1 | `email-service.js:1194` + `request/email.js:59` | `purge()` 空 id 失败即敞开，清空整个回收站 | 代码 |
| P1-3 | P1 | `MailList.vue` / `useMailList.js` | 切换邮箱不重新拉取列表，角标与列表长期不一致 | 浏览器 |
| P1-4 | P1 | `MailRow.vue:136` | 主题 `shrink-0` 使截断失效并盖住日期列 | 浏览器（含修复验证） |
| P1-5 | P1 | `email-service.js:1127` | 回收站在「全部邮箱」下静默返回空，与角标矛盾 | 浏览器 + API |
| P2-1 | P2 | `email-service.js:38` 等 5 处 | 负数 `size` 绕过分页上限，单请求拉全表 | API |
| P2-2 | P2 | `email-service.js:1261` | cron 全表无界 UPDATE，且异常被降级为 warn | 代码 |
| P2-3 | P2 | `MailWorkspace.vue:205` | keep-alive 下命令条派发到错误的 workspace | 代码 |
| P2-4 | P2 | `email-service.js:1029` | `accountIds` 分支缺 account join，与文档不变量不符 | 代码 |
| P2-5 | P2 | `useCounts.js:118` 等 3 处 | 登出不重置模块级单例，跨账号残留 | 代码 |
| P2-6 | P2 | `axios/index.js:74` | 403 被转成 fulfilled，且无条件 reload 成环 | 代码 |
| P2-7 | P2 | `perm.js:91` | `/mail/sent` 缺 `:emailId?`，深链静默丢弃 | 路由表 |
| P3-1 | P3 | `email-service.js:549` | 站内投递收件人精确匹配，大小写不符即黑洞 | 代码 |
| P3-2 | P3 | `email-service.js:253` | 回复引用的邮件不校验归属 | 代码 |

### 修复状态（2026-08-27，分支 `fix/audit-p0-p3-2026-08-22`）

16 项全部已修。每项的具体修法见下文各章的「修复」段，这里只记落在哪个提交里。

| # | 状态 | 提交 |
|---|---|---|
| P0-1 | 已修 | `7de025d`（服务端聚合）+ `8e053fe`（前端不再传 `accountId=0` 之外的空值） |
| P1-1 | 已修 | `7de025d` |
| P1-2 | 已修 | `7de025d`（`all=1` 显式入口）+ `8e053fe`（请求层不再发空 id） |
| P1-3 | 已修 | `5325d35` |
| P1-4 | 已修 | `5325d35` |
| P1-5 | 已修 | `7de025d` |
| P2-1 | 已修 | `7de025d` |
| P2-2 | 已修 | `7de025d` |
| P2-3 | 已修 | `5325d35` |
| P2-4 | 已修 | `7de025d` |
| P2-5 | 已修 | `8e053fe` |
| P2-6 | 已修 | `8e053fe` |
| P2-7 | 已修 | `8e053fe` |
| P3-1 | 已修 | `7de025d` |
| P3-2 | 已修 | `7de025d` |
| 人工审计「邮件行与文档设计不符」 | 已修 | `5325d35` |

---

## P0-1 「全部邮箱」使邮件列表接口崩溃

- **位置**：`mail-worker/src/service/email-service.js:54`（崩溃点）、
  `mail-vue/src/composables/useMailboxes.js:227`（触发源）、同类未加固点 `email-service.js:709`

**问题**

`MailboxPicker` 的「全部邮箱」把 `currentAccountId` 设为 `0`，同时把 `currentAccount` 设为 `{}`。
`views/email/index.vue:40` 从 `currentAccount?.allReceive` 取值得到 `undefined`，axios 直接丢弃该参数。
后端 `list()` 于是 `Number(undefined) → NaN`，`accountService.selectById(c, 0)` 返回 `undefined`
（`account_id` 自增从 1 起，不存在 0），随即无保护地解引用 `accountRow.allReceive` 抛 TypeError。

`useMailboxes.js:199` 的注释写的是「accountId 0 → /email/list 走 allReceive=1，后端不需要改」——
这个约定从未被履行，`currentAccount = {}` 使 `allReceive` 根本没有被发出去。这是一个**基于错误假设的实现**。

**复现**（两次点击）

1. 打开邮箱切换器，选择「全部邮箱」
2. 侧栏点击「已发送」

**实测**

```
GET /api/email/list?accountId=0&emailId=0&timeSort=0&size=5&type=0
→ HTTP 200, body {"code":500,"message":"Cannot read properties of undefined (reading 'allReceive')"}
```

界面进入错误态，文案为「邮件列表没能加载出来 / 可能是网络断了。重试一次通常就好。」——
归因错误且**重试永远不会成功**，因为原因是确定性的服务端崩溃。

**影响**

「全部邮箱」是 P3 新增的核心入口，选中后：

| 视图 | 实测表现 | 侧栏角标 |
|---|---|---|
| 已发送 | 错误态（500） | 6 |
| 回收站 | 静默空列表 | 4 |
| 收件箱 | keep-alive 旧数据 | 36（列表仍是 11 条） |

星标不受影响（`starService` 按用户查，不按邮箱）。
`/email/latest:709` 有同一段无保护代码，长轮询同样会死。

直接违反 §10.5 增量 1 的明文要求：「**计数必须与列表一致**，缓存会造成『点进去数字不对』」。

**修复建议（最小）**

前端补齐既有约定，后端加固：

```js
// useMailboxes.js — select(ALL_MAILBOXES) 时
accountStore.currentAccount = {accountId: 0, allReceive: 1}
```

```js
// email-service.js:52 附近 —— list() 与 latest() 同改
const accountRow = accountId ? await accountService.selectById(c, accountId) : null
if (accountId && !accountRow) throw new BizError(t('noUserAccount'))
allReceive = accountId ? Number(accountRow.allReceive) : 1
```

两处都要改：只改前端则任何直接请求 `accountId=0` 的调用方仍会 500；只改后端则「全部邮箱」
语义依赖 `accountId=0` 的隐式约定，容易再次退化。

---

## P1-1 从回收站还原后再删除，邮件次日即被物理删除

- **位置**：`mail-worker/src/service/email-service.js:1173`（`restore()`）、
  `:140`（`delete()`）、`:920`（批量还原）、`:1261`（cron 判定）

**问题**

`clearTrash()` 的逻辑是「先给 `del_time IS NULL` 的补时间戳，再删满 30 天的」。
但 `restore()` 只写 `isDel: NORMAL`，**不清 `del_time`**；`delete()` 也从不写它。
于是 `del_time` 一旦被 cron 盖上，就永久留在这一行上。

**复现**

1. 6/1 删除邮件 X → `is_del=1`、`del_time=NULL`
2. 当晚 cron → `del_time='2026-06-01'`
3. 6/2 从回收站还原 X → `is_del=0`，`del_time` **仍是 6/1**
4. 8/1 再次删除 X → `is_del=1`，`del_time` 仍是 6/1
5. 当晚 cron：`UPDATE` 跳过它（`del_time` 非空），`SELECT` 命中它
   （`del_time <= datetime('now','-30 day')` 成立）→ **X 与其附件被物理删除**

**影响**

用户在删除后数小时内永久失去邮件，而 UI 与 §10.5 增量 2 都承诺「30 天后自动清除」。
无任何提示、无日志、不可恢复。任何被还原过一次的邮件都进入这个状态，属于静默数据丢失。

**修复建议（最小）**

还原时一并清空时间戳（两处 `restore` 路径都要）：

```js
.set({ isDel: isDel.NORMAL, delTime: null })
```

`del_time` 目前刻意不在 drizzle 实体里，因此这一处需用裸 SQL：

```js
await c.env.db.prepare(
  `UPDATE email SET is_del = 0, del_time = NULL
   WHERE user_id = ? AND is_del = 1 AND email_id IN (${placeholders})`
).bind(userId, ...emailIds).run()
```

更彻底的做法是在 `delete()` 里直接写 `del_time = CURRENT_TIMESTAMP`，让 cron 不再需要
「补时间戳」这一步——这样就不存在「非空即视为已计时」的歧义。

---

## P1-2 `purge()` 在 id 为空时失败即敞开，清空整个回收站

- **位置**：`mail-worker/src/service/email-service.js:1194`、
  `mail-vue/src/request/email.js:59`、`mail-vue/src/components/domain/MailWorkspace.vue:151`

**问题**

```js
emailIds.length > 0 ? inArray(email.emailId, emailIds) : undefined
```

`undefined` 被 `and()` 忽略，条件退化为 `userId + is_del=DELETE`，即选中该用户回收站的**全部**邮件
并交给 `physicsDeleteEmailIds()`。这是刻意设计的「不传 id = 清空回收站」（`:1184` 有注释），
但 `toEmailIds()` **无法区分「没传 id」和「传了 id 但全部非法」**。

前端把这个歧义放大了：

```js
// request/email.js:59
{params: emailIds ? {emailIds: String(emailIds)} : {}}
```

`[]` 在 JS 中为真值，`String([]) === ''`；`String([undefined]) === ''` 同理。
`MailWorkspace.vue:151` 的 `purge(ids)` 没有空数组保护，
`:308` 的 `@purge="purge([active.emailId])"` 在 `active.emailId` 为 `undefined` 时即命中
（`MailReader` 的 `v-if` 只判断 `paneMode`，不判断 `active` 是否存在）。

**复现**

`emailPurge([])` 或 `emailPurge([undefined])`，或直接
`DELETE /email/purge?emailIds=`（同样命中 `emailIds=abc`、`emailIds=0`）。

**影响**

一次意图为「删除这一封」的操作变成「清空整个回收站」，含 R2 附件，不可恢复。
`restore()` 与 `markUnread()` 都在空列表时提前返回；**唯一不可逆的操作反而是失败即敞开**，
安全默认值恰好反了。当前 UI 上 `:220` 的 `if (!ids.length) return` 挡住了命令条那一条路径，
但那是偶然，不是设计。

**修复建议（最小）**

让「清空回收站」成为显式意图，并让空 id 成为无操作：

```js
// email-service.js
async purge(c, params, userId) {
  const emailIds = this.toEmailIds(params.emailIds)
  const purgeAll = Number(params.all) === 1
  if (!purgeAll && emailIds.length === 0) return   // 空 id = 什么都不做
  ...
}
```

```js
// request/email.js
export function emailPurge(emailIds) {
  const ids = (emailIds ?? []).filter(id => Number.isInteger(id) && id > 0)
  return ids.length
    ? http.delete('/email/purge', {params: {emailIds: ids.join(',')}})
    : http.delete('/email/purge', {params: {all: 1}})
}
```

`views/trash/index.vue:48` 的「清空回收站」改为显式调用 `all: 1`。

---

## P1-3 切换邮箱不重新拉取邮件列表

- **位置**：`mail-vue/src/components/domain/MailList.vue:115`（唯一的 watch，只看排序）、
  `mail-vue/src/composables/useMailboxes.js`（`select()` 只写 store）

**问题**

P2 之前 `views/email/index.vue` 与 `views/send/index.vue` 各有一条
`watch(() => accountStore.currentAccountId, () => scroll.value.refreshList())`。
P3 用 `MailWorkspace` + `useMailList` 替换 `email-scroll` 时，这两条 watch 被删除且**没有任何地方补回**：

- `MailList.vue:115` 只 watch `prefs.timeSort`
- `MailWorkspace.vue` 的两个 watch 分别管深链与选中数
- `FolderTree.vue:81` 确实 watch 了 `currentAccountId`，但只刷新角标
- `layout/main/index.vue` 是 `:key="route.name"` + keep-alive（含 `email/send/star/trash`），
  切邮箱既不换 key 也不重挂

`select()` 在已处于邮件路由时刻意跳过导航，因此也不会触发重新 setup。

**复现**

1. 收件箱中用 `MailboxPicker` 切到另一个邮箱
2. 观察网络面板

**实测**：切换后只发出 `GET /api/email/counts?all=1`，**没有任何 `/api/email/list` 请求**。
切换器标题变为「全部邮箱」、侧栏角标从 18 变 36，列表前三行与切换前逐字相同。

**影响**

- 角标与列表长期不一致（§10.5 明确禁止）
- 滚动到底时 `useMailList.load()` 以 `mails.at(-1).emailId` 为游标，把新邮箱的一页追加在旧邮箱的行后面，
  **两个邮箱的邮件混在同一张列表里**
- `views/email/index.vue` 的长轮询以 `accountId !== latestEmail.reqAccountId` 为守卫，
  切换后该守卫永不再成立，新邮件停止出现，直到硬刷新
- 命令面板的 `selectMailbox() + go('email')` 同样命中（复用已挂载的路由记录）

**修复建议（最小）**

在 `MailList.vue` 加一条 watch，调用**本地** `refresh()`（该函数会一并 `selection.clear()`、
`cursor = -1`，正好满足 §7.4「切邮箱清空选中」）：

```js
watch(() => accountStore.currentAccountId, () => refresh())
```

同时把 `:115` 的 `list.refresh()` 也换成本地 `refresh()`——当前切换排序会留下一批指向已被替换行的
`selection` id 和错位的键盘光标（`useSelection.prune()` 已实现但无人调用）。两条路径合成一条。

---

## P1-4 主题 `shrink-0` 使单行截断失效并盖住日期列

- **位置**：`mail-vue/src/components/domain/MailRow.vue:136`

**问题**

```html
<span :class="cn('shrink-0 truncate text-body', ...)">{{ email.subject }}</span>
```

`shrink-0`（`flex-shrink: 0`）与 `truncate` 互相抵消：`truncate` 只在盒子被压缩时才产生省略号，
而 `shrink-0` 明确禁止压缩。主题因此按内容固有宽度展开，溢出其父级
`flex min-w-0 flex-1` 容器；父级没有 `overflow-hidden`，文字直接**画在日期列上**。

`:124` 的发件人 `w-32 shrink-0 truncate` 没问题——它有固定宽度作为截断基准。`:136` 没有。

**复现**

任何主题长于列表列宽的邮件（fixture 中即有一封，其注释写明「用来验证列表行在窄屏下的单行截断」）。

**实测**

| 视口 | 列表 clientWidth | scrollWidth | 主题实际宽度 |
|---|---|---|---|
| 375（mobile） | 375 | **898** | 728 |
| 487 | 477 | **898** | 728 |
| 1440（三栏） | 429 | **958** | 728 |

预览文本（`min-w-0 flex-1 truncate`）被挤到 **width: 0**，完全不渲染。

**修复已验证**：把 `shrink-0` 换成 `min-w-0` 后，`scrollWidth` 898 → 477（等于 clientWidth），
溢出完全消除。

**影响**

所有视口、所有长主题邮件：横向滚动条、日期与主题重叠、摘要行消失。移动端最严重（2.4 倍溢出）。

**修复建议（最小）**

```html
<span :class="cn('min-w-0 truncate text-body', ...)">
```

---

## P1-5 回收站在「全部邮箱」下静默返回空

- **位置**：`mail-worker/src/service/email-service.js:1127`

**问题**

`trashList()` 对缺失的 account 行做了保护，但兜底值是 `allReceive = 0`：

```js
const allReceive = accountRow ? Number(accountRow.allReceive) : 0
```

`accountId=0` 时于是查询 `email.account_id = 0`，只可能命中无收件人的孤立行。
`counts()` 走的是另一条分支（`all=1` → `eq(1,1)`，不查 account），所以角标是对的。
两者对同一状态给出不同答案。

**实测**

```
GET /email/counts?all=1            → trash: 4
GET /email/trash?accountId=0       → {"list":[],"total":0}
GET /email/trash?accountId=1&allReceive=1 → total: 4
```

**影响**

侧栏显示「回收站 4」，点进去是空状态，**且不报错**——比 P0-1 的错误态更难被用户和监控发现。
同样违反 §10.5「计数必须与列表一致」。

**修复建议**

与 P0-1 同一处修复：`accountId` 为 0 时视为全邮箱（`allReceive = 1`），不要退化为 0。

---

## P2-1 负数 `size` 绕过分页上限

- **位置**：`email-service.js:38`（`list`）、`:1117`（`trashList`）、`:781`（`allList`）、
  `star-service.js:64`（完全无 clamp）、`account-service.js:114` `:291`

**问题**

所有 clamp 都是单边的：只挡 falsy、NaN 和过大值，不挡负数。
SQLite 把负 LIMIT 当作「无限制」，drizzle 也不报错。

**实测**

```
size=50    → 50 行
size=9999  → 50 行（上限生效）
size=-1    → 82 行  ← 整个邮箱
```

**影响**

一次已认证的廉价请求即可拉取调用方全部邮件（含完整 HTML 正文），
`emailAddAtt()` 随后对全部结果做附件查询。50 行的接口变成全表扫描，
撞 Worker 的 128MB / CPU 预算。属于可用性风险，非跨用户泄露。

**修复建议（最小）**

统一收口成一个双边 clamp，五处共用：

```js
function pageSize(raw, def = 50, max = 50) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def
}
```

---

## P2-2 cron 全表无界 UPDATE，异常被降级为 warn

- **位置**：`mail-worker/src/service/email-service.js:1261`、`:1271`

**问题**

`UPDATE email SET del_time = CURRENT_TIMESTAMP WHERE is_del = 1 AND del_time IS NULL`
无 LIMIT、无用户范围，跨全部用户。紧随其后的 SELECT 却限制在 500 行。
v3.1 首次部署后的第一次 cron 会一次性改写全部历史软删行。

`catch` 把任何失败都报成「缺少 email.del_time 列」，并 `return 0`。
`physicsDeleteEmailIds()` 也在同一个 try 内——100 个 id 一批的循环不是原子的，
中途失败会留下已删附件 / 未删邮件行的孤立状态，而日志只显示一条 schema 警告。

**影响**

存量大的实例上首次 cron 可能超出 D1 单语句预算；失败被静默，回收站清理**永远不执行**且无人知晓。
`ALTER TABLE` 处（`init.js` 的 `v3_1DB`）有同样的吞异常问题。

**修复建议**

给 UPDATE 加同样的 500 行上限（用子查询限定 id 范围），并把「列不存在」与其它异常分开处理：

```js
} catch (e) {
  if (/no such column/i.test(e.message)) {
    console.warn(`回收站清理跳过：缺少 email.del_time，请重新执行 /api/init/:secret`)
    return 0
  }
  console.error(`回收站清理失败：${e.message}`)
  throw e     // 让 scheduled 的失败可见
}
```

---

## P2-3 keep-alive 下命令条派发到错误的 workspace

- **位置**：`mail-vue/src/components/domain/MailWorkspace.vue:205`

**问题**

`registerMailActions()` 只在 setup 执行一次，注销挂在 `onUnmounted`。
`layout/main/index.vue:8` 让 `email/star/send/trash` 常驻 keep-alive，
`onUnmounted` **永不触发**，因此 `state.handlers` 始终指向最后一个**挂载**过的 workspace，
而不是当前可见的那个。

**复现**

1. 进入回收站（workspace B 注册）
2. 返回收件箱（缓存组件被激活，setup 不重跑）
3. 在收件箱选中若干邮件，点命令条的「删除」

收件箱自己的选中 watcher 仍在调 `setMailSelection()`，所以命令条数字与可用状态看起来是对的，
但按下去执行的是 B 的 handler，其 `props.trashMode` 为真 → `purge(trashIds)`。

**影响**

回收站里的邮件被物理删除，而用户实际选中的收件箱邮件毫发无损。与 P1-2 叠加时后果更重。

**修复建议（最小）**

改用 `onActivated` / `onDeactivated` 注册与注销（keep-alive 下这两个钩子才会成对触发）：

```js
onActivated(() => registerMailActions(handlers))
onDeactivated(() => unregisterMailActions())
```

---

## P2-4 `accountIds` 分支缺 account join

- **位置**：`mail-worker/src/service/email-service.js:1029`

**问题**

`:1004` 的注释声明「谓词逐条对齐 `list()`（含 `leftJoin(account)` + `account.isDel`）」，
但 `accountIds` 分支只 `.from(email)`，没有 join，也没有 `account.isDel` 条件。
另外两个分支（`:1070`）都有。

**影响**

已软删邮箱下的未读邮件仍被计入 `MailboxPicker`「最近」分组的小徽标，而列表会过滤掉它们。
实际触发需要前端持有一个已软删的 accountId（例如 `prefs.recent` 里的旧快照，见 P2-5），
因此定为 P2 而非 P1。

**修复建议**

补上与另两个分支一致的 join 与条件。

---

## P2-5 登出不重置模块级单例，跨账号残留

- **位置**：`mail-vue/src/composables/useCounts.js:118`、`useMailboxes.js`、`useMailPrefs.js:69`

**问题**

`resetCounts()` / `resetMailboxes()` / `resetPrefs()` 三个函数**没有任何生产调用方**。
登出路径（`Topbar.vue:119`、`useCommandPalette.js:278`、`views/setting/index.vue:149`、
`axios/index.js:36` 的 401 分支）都只 `removeItem('token')` 并路由到 `/login`，**不刷新页面**，
因此模块级状态全部存活。

**复现**

用户 A 登出 → 同一标签页登录用户 B。

- `useMailboxes.ensureFirstPage()` 见 `mailboxes.length > 0` 且未超 60s TTL，**不发请求**，
  直接渲染 A 的邮箱地址
- `useCounts.fetchNow()` 复用 scopeKey `{"all":1}`，跳过 `Object.assign(counts, EMPTY)`，
  B 看到 A 的未读 / 回收站角标直到新响应落地
- `um-mail-prefs` 是单一全局 localStorage key，`prefs.recent` 里 A 的
  `{accountId, email, name}` 快照**永久**留在 Picker 与命令面板的「最近」分组里

**影响**

跨账号信息残留（邮箱地址属于用户数据），且点击 A 的残留项会把 `currentAccountId` 设成 A 的 account。
共享设备场景下是隐私问题。

**修复建议（最小）**

登出集中到一个函数，调用三个 reset；或在 `/login` 路由守卫里统一调用。
`prefs.recent` 应按 userId 分键存储。

---

## P2-6 403 被转成成功，且无条件 reload 成环

- **位置**：`mail-vue/src/axios/index.js:74`

**问题**

拒绝处理器在 HTTP 403 分支返回 `undefined` 而非重新抛出。
从 `onRejected` 返回值会**使 promise 链变为 fulfilled**，调用方收到 `undefined` 当作成功。
`useMailList.load()` 的 `await fetch(...) ?? {}` 于是得到 `list=[]`、`noLoading=true`、`total=0`。

**影响**

边缘层 403（WAF、Cloudflare Access、限流——worker 自身总是回 200 + body code）
被渲染成「这个邮箱确实没有邮件」，而不是该 composable 专门实现的 `ErrorState`。
叠加同分支的无条件 `location.reload()`，持续 403 会变成**无限刷新循环**，且永不显示原因。

**修复建议**

403 分支 `return Promise.reject(error)`，并给 reload 加上「同一会话只重载一次」的哨兵。

---

## P2-7 `/mail/sent` 缺 `:emailId?`，深链静默丢弃

- **位置**：`mail-vue/src/perm/perm.js:91`

**问题**

`router/index.js` 里 `/mail/inbox/:emailId?`、`/mail/starred/:emailId?`、`/mail/trash/:emailId?`
都带可选段，只有 `/mail/sent` 没有。
`MailWorkspace.syncUrl`（`:83`）的 `router.replace({name, params: {...route.params, emailId}})`
会被 vue-router 按 matcher 的 key 过滤，`emailId` 被丢弃，URL 不变。

**实测**：在 `/mail/sent` 打开一封邮件后 URL 仍是 `/mail/sent`（收件箱则正确变为 `/mail/inbox/87`）。

**影响**

已发送邮件无法深链 / 分享 / 刷新恢复。
更麻烦的是 `MailWorkspace.vue:110` 的 watcher 同时监听 `mails.length`——
下一页分页或 `removeIds` 会以 `id === undefined` 触发它，命中 `active.value = null`，
**用户正在阅读已发送邮件时阅读窗格会自己关闭**。

**修复建议**

`path: '/mail/sent/:emailId?'`。

---

## P3-1 站内投递收件人精确匹配

- **位置**：`mail-worker/src/service/email-service.js:549`

`HandleOnSiteEmail` 用精确 `inArray` 解析站内收件人，既不 `COLLATE NOCASE`（其它所有 account
查询都显式带，如 `account-service.js:103`），也不过滤 `is_del`。
发给 `Alice@example.com` 找不到行 → 邮件以 `userId=0/accountId=0` 存为 NOONE/BOUNCED；
反之软删收件人仍会匹配，邮件写进被 `list()`/`trashList()` 用 `eq(account.isDel, NORMAL)` 过滤掉的
邮箱，成为永久黑洞，而发件人那一行在 `:649` 被标记为 DELIVERED。

**修复**：与 `account-service.js:103` 一致地加 `COLLATE NOCASE` 与 `eq(account.isDel, NORMAL)`。

---

## P3-2 回复引用的邮件不校验归属

- **位置**：`mail-worker/src/service/email-service.js:253`

`selectById`（`:696`）只按 `emailId + isDel` 过滤。
`POST /email/send` 带 `{sendType:'reply', emailId: <他人的 id>}` 会成功，
`emailData.inReplyTo` / `relation` 被设为受害者的 `messageId`（`:328-329`）并随 `emailResult` 返回，
形成可枚举的 id → Message-ID 预言机，也允许把外发邮件挂进攻击者读不到的会话线程。

**修复**：与 `starService.add` 一致，校验 `emailRow.userId === userId`。

---

## 已检查并排除的项

避免下一轮重复排查，以下是本次确认**不是**缺陷的项：

- **列表日期分组乱序**（8月5日 → 8月6日 → 8月15日 → 8月11日）：
  `email.create_time` 的默认值是 `CURRENT_TIMESTAMP`（`entity/email.js:26`，`notNull`），
  生产中与自增 `email_id` 单调相关。本地 fixture 的 `create_time` 是随机播种的，属数据假象。
  分组逻辑本身（`useMailList.js:120-139`，仅在 `groupKey` 变化时插入组头）是正确的。
- **`searchByKeyword` 的 SQL 注入**：模式串走绑定参数，`%`/`_`/`\` 已转义并显式声明 `ESCAPE '\'`，
  `userId` + `isDel` 为硬条件。写得是对的。
- **`/email/restore`、`/email/counts`、`/email/trash`、`/email/unread` 未挂权限键**：
  四者都以 `eq(email.userId, userId)` 收口，不构成越权。
  权限面与 UI 展示略有不一致（UI 把「还原」放在 `email:delete` 之下），属产品口径问题而非漏洞。
- **`followLoading` 在满页后保持为真**：`useMailList.spec.js:100` 明确断言该骨架哨兵行为，是刻意的。
- **`useHotkeys` 对非字母数字键的 shift 折叠**：`normalizeCombo` 与 `eventSignature` 两侧一致。
- **表单校验**：`/mail/compose` 空提交依次给出「收件人邮箱地址不能为空」→「邮件正文不能为空」，
  并停留在当前页，行为正确。
- **控制台错误**：整轮交互（切邮箱、四个文件夹、打开阅读窗格、写信提交）无 console error /
  未捕获拒绝。

## 补做的验证（2026-08-27）

审计当天「未覆盖的范围」里有两条是方法缺口而不是范围取舍，本轮补上：

**一、`useSearchQuery.js` 无生产调用方 → 已接线（§7.5 服务端过滤）**

- `email-service.js` 新增模块级 `searchConditions(params, userId)`，被 `list()`（列表 + `total`
  两条查询）、`trashList()` 与 `starService.list()` 共用：同一份字段口径、同一份通配符转义
  （`COLLATE NOCASE LIKE … ESCAPE '\'`），`hasAtt` / `star` 用 EXISTS 半连接，
  两个附件不会让同一封出现两行。
- `list()` 的 `latestEmailQuery` **刻意不过滤**：它是长轮询的游标（全局最新一封的 id），
  收窄会让轮询从一个偏小的 id 起反复拉回同一批。代价由前端补：收件箱长轮询用
  `matchesQuery()` 把新邮件过一遍同一套条件，搜索态下不会插进一封不符合条件的行。
- 前端：`MailWorkspace` 持有 `useSearchQuery()`，把条件作为**第三个参数**交给视图的
  `fetch`；四个视图各多一行转发。`MailList` 多一个 `searchText` prop（兼作「搜索态」标记与
  重新取数的触发器）+ 头部搜索 Chip + 「没有匹配」的空状态。命令面板补上 §6.2 的「邮件」组
  （一条「搜索邮件：<词>」，带着 `?q=` 进当前邮件视图）。
- 前端用例：`MailWorkspace.spec.js` 增「搜索（§7.5）」一节（第三个参数、条件变更从头取数、
  Chip 清词、「没有匹配」文案）；新增 `useCommandPalette.mail.spec.js` —— 「邮件」组只在
  `all` 模式 + 有词 + `email` 路由存在时出现，点它在邮件视图里原地加 `?q=` 并清掉 `:emailId`，
  在其它页面回收件箱，其余 query 参数保留。

**二、worker 侧零自动化覆盖 → 补了服务层用例**

跑在真 SQLite 上（`node:sqlite` + D1 形状的 shim，表结构由**真的**迁移链 `dbInit.init(c)` 建），
因为被测行为本身就是 SQL 行为（负 `LIMIT` = 无限制、`COLLATE NOCASE`、`LIKE … ESCAPE`、
`datetime('now', ?)`、`del_time IS NULL` 回填、leftJoin 的 `account.is_del` 可见性）：

- `mail-worker/test/page-utils.node.spec.js`（P2-1 的分页收口）
- `mail-worker/test/email-service.node.spec.js`（P0-1 / P1-1 / P1-2 / P1-5 / P2-2 / P2-4，
  以及本轮新增的搜索条件与 `trashList` 搜索）
- `mail-worker/test/account-service.node.spec.js`（`searchByKeyword` 的排序 / 转义 / 收口）
- `mail-worker/test/star-service.node.spec.js`（星标视图与另外三个视图同源）
- 入口：`mail-vue/vitest.config.js` 里新增 `worker` project（`environment: 'node'`，
  `root: ../mail-worker`，`include: test/**/*.node.spec.js`）。
  `@cloudflare/vitest-pool-workers` 在本机起不来（vitest 跑在 workerd 里要 `node:vm`，
  报 `MiniflareCoreError [ERR_RUNTIME_FAILURE]`），所以走 node + 真 SQLite 这条替代路径。

**三、两个 project 一起跑的结果（2026-08-28）**

`pnpm vitest run`（`web` + `worker`）：82 文件 / 1481 用例全绿。
`email-service.node.spec.js` 里 stderr 打的「跳过字段：no such column: auto_refresh_time」
是 shim 刻意的行为 —— fixture 只建迁移链里的列，`setting` 的新列不参与被测逻辑。

## 浏览器过审（2026-08-28）

`wrangler dev` 8787 + `vite dev` 3001 + 本地 D1 fixture，全程无 console error / 未捕获拒绝。
DOM 侧的数值都是量出来的（`getComputedStyle` / `getBoundingClientRect`），不是看图判断：

| 项 | 期望（文档） | 实测 |
|---|---|---|
| 密度三档行高 | §7.4 紧凑 44 / 标准 56 / 宽松 72 | 44 / 56 / 72，`aria-pressed` 跟着切，`um-mail-prefs` 落盘 |
| 未读态 | §5.3.3 6px 圆点 + 字重，不改底色 | 圆点 5.99px `--accent`，发件人与主题 550，背景 `rgba(0,0,0,0)` |
| 已读行 | 同上取反 | 无圆点、字重 400、背景同样透明 |
| 搜索 `?q=` | §7.5 服务端过滤 | `?q=Security` → `GET /email/list?…&keyword=Security`，12 行全部命中，Chip 显示原词、`aria-label`「清除搜索条件」 |
| 列表键盘作用域 | §7.1 ↑/↓ · x · Shift+↑/↓ · a · Esc | 依次得到 0 → 1 → 2 → 12（表头三态 checked）→ 0 |
| 回收站 | P1-1 / P1-2 | `DELETE /email/delete` → `PUT /email/restore` → `/email/counts` 三条都 200，角标与列表同步 |

`/email/counts` 返回 `{inbox:82, unread:18, star:7, code:16, trash:4, sent:6}`，与侧栏角标逐项一致
（P0-1 当时的症状正是这里对不上）。

## 未覆盖的范围

- 真实 Resend 外发链路（本地无 key，仅覆盖到站内投递分支）。
- 附件上传 / R2 往返。
- 管理端 `views/all-email`、`views/draft` 仍用旧 `email-scroll`，未在本次 P3 范围内。
- `?q=` 里的 `in:` 只解析、不分流：在收件箱里搜 `in:trash` 搜的还是收件箱
  （`toListParams()` 刻意不产出 folder）。要么让入口按 folder 换路由，要么把这个语法糖从 §7.5 删掉。
- 附录 C 的安全工作项（按既定顺序冻结到 UI 收尾之后）。

