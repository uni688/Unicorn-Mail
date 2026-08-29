import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * P4（§10.5）：开放 API 的请求日志。
 *
 * `keyId` / `userId` 可空：鉴权失败（401）的请求也要留痕，那时候还不知道是谁。
 * 只保留 30 天，由 `index.js` 的 `scheduled()` 清理。
 */
export const apiLog = sqliteTable('api_log', {
	logId: integer('log_id').primaryKey({ autoIncrement: true }),
	keyId: integer('key_id'),
	userId: integer('user_id'),
	method: text('method').notNull(),
	path: text('path').notNull(),
	status: integer('status').notNull(),
	duration: integer('duration').notNull(),
	ip: text('ip'),
	ua: text('ua'),
	err: text('err'),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export default apiLog;
