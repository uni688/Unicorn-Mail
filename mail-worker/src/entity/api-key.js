import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * P4（§10.5）：开放 API 的 Key。
 *
 * `hash` / `salt` 在实体里声明了，但 service 一律用显式列清单 select（见
 * `api-key-service.js` 的 `publicColumns`）—— `select({...apiKey})` 会把两列一起
 * 带到响应里，等于把校验材料发给前端。
 */
export const apiKey = sqliteTable('api_key', {
	keyId: integer('key_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	prefix: text('prefix').notNull(),
	hash: text('hash').notNull(),
	salt: text('salt').notNull(),
	scopes: text('scopes').notNull().default(''),
	status: integer('status').notNull().default(0),
	expireTime: text('expire_time'),
	lastUsedTime: text('last_used_time'),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`),
	isDel: integer('is_del').notNull().default(0)
});

export default apiKey;
