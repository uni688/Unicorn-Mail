import orm from '../entity/orm';
import apiLog from '../entity/api-log';
import apiKey from '../entity/api-key';
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { pageSize } from '../utils/page-utils';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import { apiLogRetainDays, apiLogSkipPaths } from '../const/api-const';

/**
 * P4（§4.3 / §4.4 / §10.5）：开放 API 的请求日志。
 *
 * 三个设计点：
 *
 * 1. **写入永不抛错**。`add()` 由中间件在 `c.executionCtx.waitUntil()` 里调用，
 *    此时响应已经发出去了。这里再抛就是一个没人能接住的 rejection（Workers 会把它
 *    记成一次 unhandled error），所以整个方法自带 try/catch，写失败只 `console.warn`。
 *    日志掉一条不该影响任何请求。
 * 2. **游标分页而不是 offset**。日志页是虚拟列表（§4.3），只会「往下追加」。
 *    offset 分页在持续写入的表上会漏行 / 重行（翻页期间头部插入了新行），
 *    游标（上一页最后一条的 `logId`）不会。和 `all-email` 同一套语义：**不返回 total**。
 * 3. **统计只在第一页算**。`2xx/4xx/5xx` 统计条对应的是「当前筛选条件下的全量」，
 *    与游标无关；每次滚动都重算一遍是白烧 D1 的读配额。
 */

const listColumns = {
	logId: apiLog.logId,
	keyId: apiLog.keyId,
	userId: apiLog.userId,
	method: apiLog.method,
	path: apiLog.path,
	status: apiLog.status,
	duration: apiLog.duration,
	ip: apiLog.ip,
	ua: apiLog.ua,
	err: apiLog.err,
	createTime: apiLog.createTime
};

/** `LIKE` 之前的净化：截断 + 转义通配符，与 `email-service.searchConditions` 同一个写法 */
function likeTerm(value, max = 128) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	return raw.substring(0, max).replace(/[\\%_]/g, ch => `\\${ch}`);
}

/**
 * 筛选谓词。`userId` 恒定参与（§0.9：日志是用户自己的资源，越权在 SQL 层就不成立）。
 *
 * `status` 支持两种形态：精确码（`404`）与区间（`2xx` / `4xx` / `5xx`）——
 * 统计条上点一下就该能筛，让前端自己算 `400..499` 属于把服务端语义漏到前端。
 */
function conditions(params, userId) {

	const list = [eq(apiLog.userId, userId)];

	const keyId = Number(params?.keyId);
	if (Number.isInteger(keyId) && keyId > 0) {
		list.push(eq(apiLog.keyId, keyId));
	}

	const path = likeTerm(params?.path);
	if (path) {
		list.push(sql`${apiLog.path} COLLATE NOCASE LIKE ${'%' + path + '%'} ESCAPE '\\'`);
	}

	if (params?.method) {
		list.push(eq(apiLog.method, String(params.method).trim().toUpperCase().substring(0, 10)));
	}

	const rawStatus = String(params?.status ?? '').trim();
	if (/^[1-5]xx$/i.test(rawStatus)) {
		const base = Number(rawStatus[0]) * 100;
		list.push(gte(apiLog.status, base));
		list.push(lt(apiLog.status, base + 100));
	} else if (/^\d{3}$/.test(rawStatus)) {
		list.push(eq(apiLog.status, Number(rawStatus)));
	}

	if (params?.startTime) {
		list.push(gte(apiLog.createTime, String(params.startTime)));
	}

	if (params?.endTime) {
		list.push(lte(apiLog.createTime, String(params.endTime)));
	}

	return list;
}

const apiLogService = {

	conditions,

	/**
	 * 写一条。`err` 截到 500 字符 —— 上游异常的 message 可能带整段堆栈，
	 * 30 天 × 每条几 KB 会把 D1 的行大小和存储都吃掉。
	 */
	async add(c, entry) {
		try {

			if (apiLogSkipPaths.some(skip => entry.path === skip || entry.path?.startsWith(skip + '/'))) {
				return;
			}

			await orm(c).insert(apiLog).values({
				keyId: entry.keyId ?? null,
				userId: entry.userId ?? null,
				method: String(entry.method ?? 'GET').substring(0, 10),
				path: String(entry.path ?? '').substring(0, 200),
				status: Number(entry.status) || 0,
				duration: Math.max(0, Math.round(Number(entry.duration) || 0)),
				ip: entry.ip ? String(entry.ip).substring(0, 64) : null,
				ua: entry.ua ? String(entry.ua).substring(0, 200) : null,
				err: entry.err ? String(entry.err).substring(0, 500) : null,
				createTime: formatDetailDate(toUtc())
			}).run();

		} catch (e) {
			console.warn(`api_log 写入失败：${e.message}`);
		}
	},

	/**
	 * 列表。`logId` 是游标（上一页最后一条），不传就是第一页。
	 * 第一页附带 `stats`（当前筛选条件下的 2xx/4xx/5xx 与总数）与 Key 名称字典。
	 */
	async list(c, params, userId) {

		const size = pageSize(params?.size);
		const cursor = Number(params?.logId);
		const where = conditions(params, userId);

		if (Number.isInteger(cursor) && cursor > 0) {
			where.push(lt(apiLog.logId, cursor));
		}

		const list = await orm(c).select(listColumns).from(apiLog)
			.where(and(...where))
			.orderBy(desc(apiLog.logId))
			.limit(size)
			.all();

		if (Number.isInteger(cursor) && cursor > 0) {
			return { list, stats: null };
		}

		return { list, stats: await this.stats(c, params, userId) };
	},

	/**
	 * 统计条。一条 SQL 出四个数，而不是四条 `count()` —— D1 每次查询都算一次读操作。
	 * `1xx` / `3xx` 归到 `other`：开放 API 不会产生重定向，真出现了也只是提示「有异常」。
	 */
	async stats(c, params, userId) {

		const row = await orm(c).select({
			total: sql`COUNT(*)`.as('total'),
			ok: sql`SUM(CASE WHEN ${apiLog.status} >= 200 AND ${apiLog.status} < 300 THEN 1 ELSE 0 END)`.as('ok'),
			clientErr: sql`SUM(CASE WHEN ${apiLog.status} >= 400 AND ${apiLog.status} < 500 THEN 1 ELSE 0 END)`.as('clientErr'),
			serverErr: sql`SUM(CASE WHEN ${apiLog.status} >= 500 THEN 1 ELSE 0 END)`.as('serverErr')
		}).from(apiLog).where(and(...conditions(params, userId))).get();

		const total = Number(row?.total ?? 0);
		const ok = Number(row?.ok ?? 0);
		const clientErr = Number(row?.clientErr ?? 0);
		const serverErr = Number(row?.serverErr ?? 0);

		return { total, ok, clientErr, serverErr, other: total - ok - clientErr - serverErr };
	},

	/** 日志页要显示「哪把 Key 打的」，但 `api_log` 只存 `key_id`（Key 可能已软删） */
	async keyNames(c, userId) {
		const rows = await orm(c).select({ keyId: apiKey.keyId, name: apiKey.name, prefix: apiKey.prefix })
			.from(apiKey).where(eq(apiKey.userId, userId)).all();
		return rows;
	},

	/**
	 * `scheduled()` 的每日清理：只留 30 天。
	 *
	 * 自带 try/catch 并且**不重抛**：和 P3 的 `clearTrash()` 同一个理由 ——
	 * 这是 cron 里最后一个任务，清不掉日志不该影响别的清理项，也不该让整个 cron 失败。
	 * 没跑过 `v3_2DB()` 的库上 `api_log` 表还不存在，这里会安静跳过。
	 */
	async clearExpired(c) {
		try {
			const before = formatDetailDate(toUtc().subtract(apiLogRetainDays, 'day'));
			await orm(c).delete(apiLog).where(lt(apiLog.createTime, before)).run();
		} catch (e) {
			console.warn(`api_log 清理失败：${e.message}`);
		}
	}
};

export default apiLogService;
