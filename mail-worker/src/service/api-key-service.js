import orm from '../entity/orm';
import apiKey from '../entity/api-key';
import apiLog from '../entity/api-log';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import saltHashUtils from '../utils/crypto-utils';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import { apiAccessPerms, apiKeyConst, apiScopeKeys, apiScopes } from '../const/api-const';
import { isDel, userConst } from '../const/entity-const';
import { t } from '../i18n/i18n';
import userService from './user-service';
import permService from './perm-service';

/**
 * P4（§5.3.5 / §10.5 / §4.4）：开放 API 的 Key 管理。
 *
 * 三条贯穿全文件的规矩：
 *
 * 1. **明文只存在于 `add()` 的返回值里**。库里落 `prefix` + `salt` + `hash`（复用
 *    `crypto-utils` 的 SHA-256(salt+plain)），没有任何一条 select 会把 `hash` / `salt`
 *    带出去 —— 所以下面所有查询都用 `publicColumns` 显式列清单，不用 `{...apiKey}`。
 * 2. **每条查询都带 `eq(apiKey.userId, userId)`**（§0.9 的口径）：Key 是用户自己的资源，
 *    越权在 SQL 层就不可能发生，不依赖 perm 校验。唯一的例外是 `verifyPlainKey()` ——
 *    鉴权时还不知道是谁，它按 `prefix` 查，查到之后由调用方拿 `row.userId` 作为身份。
 * 3. **删除是软删**（`is_del = 1`）：`api_log` 里留着这把 Key 的历史记录，硬删会让
 *    日志页的「Key 名称」列变成一串孤儿 id。
 */

/** 不含 `hash` / `salt` 的列清单。所有对外查询都用它 */
const publicColumns = {
	keyId: apiKey.keyId,
	userId: apiKey.userId,
	name: apiKey.name,
	prefix: apiKey.prefix,
	scopes: apiKey.scopes,
	status: apiKey.status,
	expireTime: apiKey.expireTime,
	lastUsedTime: apiKey.lastUsedTime,
	createTime: apiKey.createTime
};

/**
 * 生成明文：`um_live_` + 32 位十六进制。
 *
 * 用 `crypto.getRandomValues` 而不是 `crypto-utils.genRandomPwd()` —— 后者走
 * `Math.random()`，对密码重置那种「立刻要改」的场景够用，对一把能长期调用 API 的
 * 凭据不够。十六进制而不是 base64：Key 要能出现在 URL、`curl` 命令、shell 变量里，
 * base64 的 `+/=` 在这三处都需要转义。
 */
function genPlainKey() {
	const bytes = new Uint8Array(apiKeyConst.secretLength / 2);
	crypto.getRandomValues(bytes);
	const secret = Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
	return apiKeyConst.prefixNamespace + secret;
}

/** 明文 → 展示/检索用前缀（命名空间 + 随机部分前 8 位）。鉴权靠它命中唯一一行 */
function toPrefix(plainKey) {
	const secret = plainKey.substring(apiKeyConst.prefixNamespace.length);
	return apiKeyConst.prefixNamespace + secret.substring(0, apiKeyConst.prefixLength);
}

/** `'email:read,account:read'` → `['email:read','account:read']`；顺带去重、丢掉未知项 */
function parseScopes(raw) {
	if (Array.isArray(raw)) {
		return [...new Set(raw.map(item => String(item).trim()).filter(item => apiScopeKeys.includes(item)))];
	}
	return [...new Set(String(raw ?? '').split(',').map(item => item.trim()).filter(item => apiScopeKeys.includes(item)))];
}

/** 这个 scope 在站内对应的 perm，当前角色有没有。`rolePerm` 为 null 的 scope 不卡 */
function scopeAllowed(scopeKey, access) {
	if (access.admin) return true;
	const scope = apiScopes.find(item => item.key === scopeKey);
	return !!scope && (!scope.rolePerm || access.permKeys.includes(scope.rolePerm));
}

const apiKeyService = {

	toPrefix,
	parseScopes,
	scopeAllowed,

	/**
	 * Key 主人**此刻**的状态与权限（鉴权中间件每次调用都查一次）。
	 *
	 * 站内接口靠 KV 里的登录态挡住被封 / 被删的人（`setStatus` 封号时会删 `AUTH_INFO`），
	 * 开放 API 不走 KV，所以这几件事只能在这里重新判一遍：
	 *   - 用户不在了（物理删除）或已注销（`is_del`）→ `gone`；
	 *   - 被封禁 → `banned`；
	 *   - 角色已经没有开发者能力（`apiAccessPerms` 一个都不剩）→ `noAccess`。
	 * `env.admin` 与站内一样是逃逸口：不看角色。
	 *
	 * @returns {Promise<{ok: true, admin: boolean, permKeys: string[]} | {ok: false, reason: 'gone'|'banned'|'noAccess'}>}
	 */
	async ownerAccess(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			return { ok: false, reason: 'gone' };
		}

		if (userRow.status === userConst.status.BAN) {
			return { ok: false, reason: 'banned' };
		}

		if (userRow.email === c.env.admin) {
			return { ok: true, admin: true, permKeys: [] };
		}

		const permKeys = await permService.userPermKeys(c, userId);

		if (!apiAccessPerms.some(key => permKeys.includes(key))) {
			return { ok: false, reason: 'noAccess' };
		}

		return { ok: true, admin: false, permKeys };
	},

	/**
	 * 创建表单用的 scope 清单：每项多一个 `allowed`，告诉前端哪些勾了也没用。
	 * 角色查不到权限（理论上进不来这个接口）时一律 `allowed: false`，不猜。
	 */
	async scopeOptions(c, userId) {
		const access = await this.ownerAccess(c, userId);
		return apiScopes.map(scope => ({
			key: scope.key,
			paths: scope.paths,
			allowed: access.ok ? scopeAllowed(scope.key, access) : false
		}));
	},

	/**
	 * 创建。返回值里的 `key` 是**唯一一次**能拿到明文的机会（§5.3.5）。
	 *
	 * `expireDays` 只认 §10.5 界面上那三个值（30/90/365），其余（含 0 / 不传）当永不过期。
	 * 不接受前端直接传 `expireTime`：那等于让调用方自己决定过期时刻，"永不过期" 会变成
	 * 一个可以随便伪造的字符串。
	 */
	async add(c, params, userId) {

		const name = String(params?.name ?? '').trim();

		if (!name) {
			throw new BizError(t('emptyApiKeyName'));
		}

		if (name.length > apiKeyConst.nameMaxLength) {
			throw new BizError(t('apiKeyNameLengthLimit'));
		}

		const scopes = parseScopes(params?.scopes);

		if (scopes.length === 0) {
			throw new BizError(t('emptyApiKeyScope'));
		}

		// scope 只能收窄角色已有的能力：没有 email:send 的角色不能靠一把 Key 发信
		const access = await this.ownerAccess(c, userId);

		if (!access.ok || scopes.some(scope => !scopeAllowed(scope, access))) {
			throw new BizError(t('apiKeyScopeNotInRole'), 403);
		}

		const { total } = await orm(c).select({ total: count() }).from(apiKey)
			.where(and(eq(apiKey.userId, userId), eq(apiKey.isDel, isDel.NORMAL))).get();

		if (total >= apiKeyConst.maxPerUser) {
			throw new BizError(t('apiKeyLimit'));
		}

		const expireDays = Number(params?.expireDays);
		const expireTime = apiKeyConst.expireDays.includes(expireDays)
			? formatDetailDate(toUtc().add(expireDays, 'day'))
			: null;

		const plainKey = genPlainKey();
		const prefix = toPrefix(plainKey);
		const { salt, hash } = await saltHashUtils.hashPassword(plainKey);

		const row = await orm(c).insert(apiKey).values({
			userId,
			name,
			prefix,
			hash,
			salt,
			scopes: scopes.join(','),
			status: apiKeyConst.status.NORMAL,
			expireTime,
			createTime: formatDetailDate(toUtc())
		}).returning(publicColumns).get();

		return { ...row, key: plainKey };
	},

	/**
	 * 列表。和 `reg-key` 一样返回全量（一个用户最多 20 把，分页反而多一次 count 查询）。
	 * `scopes` 拆成数组给前端，省得前端各自 `split(',')`。
	 */
	async list(c, params, userId) {

		const rows = await orm(c).select(publicColumns).from(apiKey)
			.where(and(eq(apiKey.userId, userId), eq(apiKey.isDel, isDel.NORMAL)))
			.orderBy(desc(apiKey.keyId)).all();

		const now = toUtc();

		return rows.map(row => ({
			...row,
			scopes: row.scopes ? row.scopes.split(',') : [],
			// 过期是「按时间算出来的」而不是一个存下来的状态位：不需要 cron 去翻状态，
			// 也不会出现「已过期但状态还是启用」的中间态
			expired: !!row.expireTime && toUtc(row.expireTime).isBefore(now)
		}));
	},

	/** 启用 / 停用。`status` 只认 0 / 1，其余当非法输入 */
	async setStatus(c, params, userId) {

		const keyId = Number(params?.keyId);
		const status = Number(params?.status);

		if (status !== apiKeyConst.status.NORMAL && status !== apiKeyConst.status.BAN) {
			throw new BizError(t('apiKeyStatusIllegal'));
		}

		const row = await this.selectByIdAndUser(c, keyId, userId);

		if (!row) {
			throw new BizError(t('notExistApiKey'));
		}

		await orm(c).update(apiKey).set({ status })
			.where(and(eq(apiKey.keyId, keyId), eq(apiKey.userId, userId))).run();
	},

	/** 软删。支持批量（`keyIds=1,2,3`），沿用 `reg-key` 的入参形状 */
	async delete(c, params, userId) {

		const raw = params?.keyIds ?? params?.keyId;
		const keyIds = String(raw ?? '').split(',').map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);

		if (keyIds.length === 0) {
			throw new BizError(t('notExistApiKey'));
		}

		await orm(c).update(apiKey).set({ isDel: isDel.DELETE })
			.where(and(inArray(apiKey.keyId, keyIds), eq(apiKey.userId, userId))).run();
	},

	selectByIdAndUser(c, keyId, userId) {
		if (!Number.isInteger(Number(keyId))) {
			return null;
		}
		return orm(c).select(publicColumns).from(apiKey)
			.where(and(eq(apiKey.keyId, Number(keyId)), eq(apiKey.userId, userId), eq(apiKey.isDel, isDel.NORMAL)))
			.get();
	},

	/**
	 * 鉴权入口（`security/api-key-auth.js` 调用）。
	 *
	 * 返回 `{ok:true, row}` 或 `{ok:false, reason}` 而不是抛 `BizError`：中间件要按 reason
	 * 区分 401（认不出来 / 停用 / 过期）和 403（scope 不够），并且要把失败也写进 `api_log`。
	 * 抛异常会被 `hono.js` 的 `onError` 直接接走，日志就落不下来了。
	 *
	 * 比对走 `verifyPassword(明文, salt, hash)`，和登录同一条代码路径。**不做**
	 * 「prefix 查不到就提前 return」之外的短路：查到行之后一定会算一次 hash，
	 * 避免用响应时间区分「前缀存在」与「前缀不存在」。
	 */
	async verifyPlainKey(c, plainKey) {

		const plain = String(plainKey ?? '').trim();

		if (!plain.startsWith(apiKeyConst.prefixNamespace)
			|| plain.length !== apiKeyConst.prefixNamespace.length + apiKeyConst.secretLength) {
			return { ok: false, reason: 'malformed' };
		}

		const row = await orm(c).select().from(apiKey)
			.where(and(eq(apiKey.prefix, toPrefix(plain)), eq(apiKey.isDel, isDel.NORMAL))).get();

		if (!row) {
			return { ok: false, reason: 'notFound' };
		}

		const matched = await saltHashUtils.verifyPassword(plain, row.salt, row.hash);

		if (!matched) {
			return { ok: false, reason: 'notFound' };
		}

		if (row.status === apiKeyConst.status.BAN) {
			return { ok: false, reason: 'disabled', row };
		}

		if (row.expireTime && toUtc(row.expireTime).isBefore(toUtc())) {
			return { ok: false, reason: 'expired', row };
		}

		return { ok: true, row: { ...row, hash: undefined, salt: undefined, scopes: row.scopes ? row.scopes.split(',') : [] } };
	},

	/**
	 * 记一次使用时间。中间件在 `waitUntil` 里调，不阻塞响应。
	 *
	 * 刻意不做「同一分钟内只写一次」的节流：D1 的一次 UPDATE 比维护一份 KV 里的
	 * 节流状态便宜，而且 `last_used_time` 是「最近使用」列的唯一数据源，写漏了看不出来。
	 */
	async touch(c, keyId) {
		await orm(c).update(apiKey).set({ lastUsedTime: formatDetailDate(toUtc()) })
			.where(eq(apiKey.keyId, keyId)).run();
	},

	/**
	 * 单 Key 近 7 日调用量（§10.5 `GET /api-key/:id/usage`）。
	 *
	 * 按天分组用 `date(create_time)`：`create_time` 是 `YYYY-MM-DD HH:mm:ss` 的 UTC 文本，
	 * `substr(...,1,10)` 也行，但 `date()` 顺带能挡住格式不整的历史行。
	 * 没有调用的那几天会缺行，由前端补 0（服务端补零要先知道用户时区，那是 P5 的事）。
	 */
	async usage(c, params, userId) {

		const keyId = Number(params?.keyId);
		const row = await this.selectByIdAndUser(c, keyId, userId);

		if (!row) {
			throw new BizError(t('notExistApiKey'));
		}

		const since = formatDetailDate(toUtc().subtract(7, 'day').startOf('day'));

		const rows = await orm(c).select({
			day: sql`date(${apiLog.createTime})`.as('day'),
			total: count(),
			failed: sql`SUM(CASE WHEN ${apiLog.status} >= 400 THEN 1 ELSE 0 END)`.as('failed')
		}).from(apiLog)
			.where(and(eq(apiLog.keyId, keyId), eq(apiLog.userId, userId), gte(apiLog.createTime, since)))
			.groupBy(sql`date(${apiLog.createTime})`)
			.orderBy(sql`date(${apiLog.createTime})`)
			.all();

		return rows.map(item => ({ day: item.day, total: Number(item.total), failed: Number(item.failed ?? 0) }));
	}
};

export default apiKeyService;
