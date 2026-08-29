import app from '../hono/hono';
import result from '../model/result';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

/**
 * P4（§4.4 / §5.3.5）：开放 API。
 *
 * 这些路由**只**能用 `Authorization: Bearer um_live_…` 调用 —— `security.js` 的
 * `exclude[]` 里加了 `/open`，所以登录态的 JWT 中间件不会介入；把关的是
 * `security/api-key-auth.js`（注册顺序见 `hono/webs.js`）。
 *
 * 三条约定：
 *
 * 1. **不新写业务逻辑**。每个 handler 都只是把 `c.get('user').userId` 交给既有 service，
 *    和 `email-api.js` / `account-api.js` 里对应的那条路由走同一个函数。开放 API 复制一份
 *    查询实现的话，两边的越权保护、分页收口、搜索转义就会各自演化。
 * 2. **`userId` 只来自中间件**，永远不从 query / body 取。Key 是谁的，就只能看谁的数据
 *    （§0.9 的数据边界口径）—— 传 `userId=2` 过来不会有任何效果，因为这里根本不读它。
 * 3. **响应形状与内部 API 一致**（`{code, message, data}`）。文档页与调试台是同一套渲染，
 *    额外包一层会让「复制 cURL 到终端跑」和「在调试台里跑」看到不同的结果。
 */

/** 探活。`apiLogSkipPaths` 里列了它，不写日志；也不需要任何 scope */
app.get('/open/ping', (c) => {
	return c.json(result.ok({ pong: true }));
});

/**
 * 邮件列表。参数与 `/email/list` 同名同义（`accountId` / `type` / `size` / `emailId` 游标 / `q` 等）。
 *
 * `type` 默认 0（收件）、`allReceive` 默认 1（全部邮箱）：内部前端每次都会显式传，
 * 但开放 API 的调用方期望 `GET /open/email/list` 裸调就能拿到收件箱 —— 不给默认值的话
 * `eq(email.type, undefined)` 会静默筛成空列表，比报错更难查。
 */
app.get('/open/email/list', async (c) => {
	const query = c.req.query();
	const params = {
		...query,
		type: query.type === undefined ? 0 : Number(query.type),
		allReceive: query.accountId ? query.allReceive : 1
	};
	const data = await emailService.list(c, params, userContext.getUserId(c));
	return c.json(result.ok(data));
});

/**
 * 单封详情。`emailService.selectById()` 不带 `userId`，所以这里**必须**自己核对归属 ——
 * 与 `email-service.js:411` 的回复路径同一个理由：不核对的话任意 `emailId` 都能读到别人的信。
 */
app.get('/open/email/detail', async (c) => {
	const emailId = Number(c.req.query('emailId'));

	if (!Number.isInteger(emailId) || emailId <= 0) {
		throw new BizError(t('notExistEmailReply'), 400);
	}

	const row = await emailService.selectById(c, emailId);

	if (!row || row.userId !== userContext.getUserId(c)) {
		throw new BizError(t('notExistEmailReply'), 404);
	}

	const list = [row];
	await emailService.emailAddAtt(c, list);

	return c.json(result.ok(list[0]));
});

/** 未读数。`accountId=N` | `all=1` | `accountIds=1,2,3`，与 `/email/counts` 同参 */
app.get('/open/email/counts', async (c) => {
	const data = await emailService.counts(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

/**
 * 发信。走的是**完全同一个** `emailService.send()`，所以角色的发件开关、每日额度、
 * 站内/站外判定、附件处理全都照常生效 —— 开放 API 不是一条绕过发件限制的旁路。
 */
app.post('/open/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

/** 邮箱列表（游标：`lastSort` + `accountId`），与 `/account/list` 同参 */
app.get('/open/account/list', async (c) => {
	const list = await accountService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});
