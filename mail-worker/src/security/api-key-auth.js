import app from '../hono/hono';
import apiKeyService from '../service/api-key-service';
import apiLogService from '../service/api-log-service';
import result from '../model/result';
import { apiScopes } from '../const/api-const';
import { t } from '../i18n/i18n';

/**
 * P4（§0.10 / §4.4）：`/open/*` 的 Bearer 鉴权。
 *
 * 为什么要单独一个中间件：`security.js` 的 `app.use('*')` 对所有不在 `exclude[]` 里的
 * 路径要求 `TOKEN_HEADER` 里的 JWT，而开放 API 用的是 `Authorization: Bearer um_live_…`，
 * 走那条路必定 401。所以 `exclude[]` 里加了 `'/open'`，鉴权改由这里做。
 * **注册顺序**：`hono/webs.js` 里本文件的 import 必须在 `security` 之后、`open-api` 之前 ——
 * hono 按注册顺序组合命中的 handler，反了就变成「先跑业务再鉴权」。
 *
 * 三件和站内接口不一样的事，都是刻意的（写进偏差说明）：
 *
 * 1. **返回真的 HTTP 状态码**。站内接口全走 `app.onError` → `c.json(result.fail(...))`，
 *    HTTP 永远是 200、错误码在 body 里（前端请求层读 body）。开放 API 的调用方是
 *    `curl` / SDK / 监控系统，它们看的是状态行 —— §4.4 的验收写的就是「返回 401」。
 *    所以本文件自己接住异常并显式给状态码，不让它冒到 `onError`。
 * 2. **失败也要落日志**。`apiKeyService.verifyPlainKey()` 返回 `{ok,reason}` 而不是抛错，
 *    正是为了让这里能先写 `api_log` 再返回。401 时 `key_id` / `user_id` 可能为空
 *    （连是谁都不知道），`api_log` 那两列因此可空。
 * 3. **日志与 `last_used_time` 都在 `waitUntil` 里写**（§4.4）：不进响应的关键路径。
 */

/** `reason` → 文案。四种失败都回 401：不区分「不存在 / 停用 / 过期」，避免枚举出有效前缀 */
const REASON_MESSAGE = {
	malformed: 'apiKeyMalformed',
	notFound: 'apiKeyInvalid',
	disabled: 'apiKeyDisabled',
	expired: 'apiKeyExpired'
};

/**
 * 这条路径需要哪些 scope 里的任意一个；没有任何 scope 声明它就返回 null。
 *
 * null 的语义是「只要 Key 有效就能调」，给 `/open/ping` 这类探活用。
 * 顺带让未知路径落到 hono 的 404 而不是被 403 挡住 —— 打错路径时收到「权限不足」
 * 比收到「不存在」更难排查。
 */
function requiredScopes(path) {
	const keys = apiScopes
		.filter(scope => scope.paths.some(item => path === item || path.startsWith(item + '/')))
		.map(scope => scope.key);
	return keys.length > 0 ? keys : null;
}

/**
 * `waitUntil` 在 `wrangler dev` / 线上都有；拿不到时退化成「不登记的后台 promise」。
 *
 * `c.executionCtx` 是一个**会抛**的 getter（`hono/dist/context.js`：没有 ExecutionContext
 * 就 `throw Error('This context has no ExecutionContext')`），所以 `c.executionCtx?.waitUntil`
 * 挡不住它 —— `?.` 只处理 null/undefined，不处理取值本身抛错。必须 try 起来，
 * 否则 `app.fetch(req, env)` 这种不带 ctx 的调用会在**鉴权成功之后**炸掉整个请求。
 */
function background(c, promise) {

	const task = promise.catch(e => console.warn(`open api 后台任务失败：${e.message}`));

	let ctx = null;

	try {
		ctx = c.executionCtx;
	} catch {
		ctx = null;
	}

	if (typeof ctx?.waitUntil === 'function') {
		ctx.waitUntil(task);
	}

	return task;
}

/**
 * 异常 → 开放 API 的状态码与对外文案。
 *
 * - `BizError` 是业务校验（发件人不存在、额度不够…），文案本来就是给用户看的，原样返回。
 *   它没显式给 code 时默认是 501（`error/biz-error.js`），而 HTTP 501 的意思是「服务端没实现
 *   这个方法」，调用方会以为接口坏了 —— 这一类当 400。
 * - 其余异常（`TypeError` 之类）是我们自己的 bug：对外只给一句「服务端出错」，原始信息只进
 *   `api_log.err` 供用户在日志页排查，不把 `Cannot read properties of undefined` 这种内部细节
 *   甩给第三方程序。
 */
function toFailure(err) {
	if (err?.name === 'BizError') {
		const code = Number(err.code);
		const status = code === 501 || !Number.isInteger(code) || code < 400 || code > 599 ? 400 : code;
		return { status, message: err.message };
	}
	return { status: 500, message: t('apiServerError') };
}

app.use('/open/*', async (c, next) => {

	const started = Date.now();

	const entry = {
		method: c.req.method,
		path: c.req.path,
		ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null,
		ua: c.req.header('user-agent') || null,
		keyId: null,
		userId: null
	};

	const deny = (status, message) => {
		background(c, apiLogService.add(c, { ...entry, status, duration: Date.now() - started, err: message }));
		return c.json(result.fail(message, status), status);
	};

	const authorization = c.req.header('authorization');

	if (!authorization) {
		return deny(401, t('apiKeyMissing'));
	}

	// `Bearer` 大小写不敏感（RFC 7235），中间允许多个空格；其余形态（Basic / 裸 key）一律拒
	const matched = /^Bearer[ \t]+(\S+)$/i.exec(authorization.trim());

	if (!matched) {
		return deny(401, t('apiKeyMalformed'));
	}

	const verified = await apiKeyService.verifyPlainKey(c, matched[1]);

	if (!verified.ok) {
		// 停用 / 过期这两种能查到行，把 keyId 记进日志 —— 用户在日志页才看得见「这把 Key 一直在被调」
		entry.keyId = verified.row?.keyId ?? null;
		entry.userId = verified.row?.userId ?? null;
		return deny(401, t(REASON_MESSAGE[verified.reason] ?? 'apiKeyInvalid'));
	}

	const keyRow = verified.row;
	entry.keyId = keyRow.keyId;
	entry.userId = keyRow.userId;

	// Key 本身没问题，还要看主人「此刻」还配不配用它：被删 / 被封 / 角色收回了开发者能力。
	// 站内接口靠 KV 登录态挡这些人，开放 API 不走 KV，不在这里查就等于封号对 Key 无效
	const access = await apiKeyService.ownerAccess(c, keyRow.userId);

	if (!access.ok) {
		if (access.reason === 'gone') return deny(401, t('apiKeyInvalid'));
		if (access.reason === 'banned') return deny(403, t('isBanUser'));
		return deny(403, t('apiKeyRoleNoAccess'));
	}

	const needed = requiredScopes(c.req.path);

	if (needed && !needed.some(key => keyRow.scopes.includes(key))) {
		return deny(403, t('apiKeyScopeDenied'));
	}

	// scope 只能收窄、不能放大：Key 勾了 email:send，但角色已经没有 email:send，照样不给
	if (needed && !needed.some(key => keyRow.scopes.includes(key) && apiKeyService.scopeAllowed(key, access))) {
		return deny(403, t('apiKeyScopeNotInRole'));
	}

	// 下游 service 一律通过 `userContext.getUserId(c)` 取身份，和站内接口同一条路径。
	// 只放 userId：需要更多字段的（`emailService.send` 要 email / type）自己查库，
	// 每个开放请求多查一次 user 表不值得
	c.set('user', { userId: keyRow.userId });
	c.set('apiKey', keyRow);

	/**
	 * `hono/hono.js` 注册了 `app.onError`，而 hono 的 `compose` 在**内层** dispatch 就把下游
	 * 抛出的 Error 消化掉了（`dist/compose.js:23`：catch → `context.error = err` →
	 * `res = await onError(err, context)` → `context.res = res`）。于是这里的 `await next()`
	 * 根本不会 reject —— 只写 try/catch 的话，业务异常会以 onError 的形状
	 * （HTTP 200 + `body.code`）返回，开放 API 的状态行就永远是 200。
	 *
	 * 真正的信号是 `c.error`：compose 在调用 onError 之前把异常挂在了 context 上。
	 * 两个都读：`c.error` 走正常路径，catch 兜住非 Error 抛出物（那种 compose 原样 rethrow）。
	 */
	let err = null;

	try {
		await next();
		err = c.error ?? null;
	} catch (e) {
		err = e;
	}

	const duration = Date.now() - started;

	if (err) {

		const { status, message } = toFailure(err);
		// 日志里记原始信息（用户在日志页能看到具体原因），响应里只给对外文案
		const detail = err?.message ?? String(err);

		background(c, Promise.all([
			apiLogService.add(c, { ...entry, status, duration, err: detail }),
			apiKeyService.touch(c, keyRow.keyId)
		]));

		// **赋值**而不是 return：onError 已经把 `finalized` 置为 true，此时 compose 的
		// `if (res && (context.finalized === false || isError))` 不成立，本中间件 return 的
		// Response 会被直接丢掉。写 `c.res` 是唯一能覆盖掉 onError 那个 200 的方式。
		c.res = c.json(result.fail(message, status), status);
		return;
	}

	const status = c.res?.status ?? 200;

	background(c, Promise.all([
		apiLogService.add(c, { ...entry, status, duration, err: status === 404 ? t('apiPathNotFound') : undefined }),
		apiKeyService.touch(c, keyRow.keyId)
	]));

	/**
	 * hono 默认的 `notFound` 返回**纯文本** `404 Not Found`（`dist/hono-base.js`）。
	 * 站内接口无所谓（前端只调存在的路径），但开放 API 的调用方是 curl / SDK，
	 * 一律按 JSON 解析响应体 —— 路径打错时拿到的是
	 * `Unexpected non-whitespace character after JSON at position 4`，
	 * 比 404 本身更难定位。这里统一换成与其余分支同形状的 `{code, message}`。
	 *
	 * 同样是**赋值**而不是 return（理由见上面 err 分支）。
	 */
	if (status === 404) {
		c.res = c.json(result.fail(t('apiPathNotFound'), 404), 404);
	}
});

export default app;
