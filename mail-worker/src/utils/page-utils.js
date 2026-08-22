/**
 * 分页参数的双边收口。
 *
 * 各个 service 原来各写一遍 `if (size > 50) size = 50`，只挡上界。SQLite 把负 LIMIT 当作
 * 「无限制」，drizzle 也不报错，于是 `size=-1` 一个已认证的廉价请求就能把整张表拉走
 * （邮件列表还会带完整 HTML 正文 + 逐条附件查询），直接撞 Worker 的内存 / CPU 预算。
 *
 * 规则只有一条：**不是正整数就用默认值，是正整数就夹到上限**。
 * NaN、0、负数、小数、`'abc'`、`undefined` 全部落到 `def`。
 */
export function pageSize(raw, def = 50, max = 50) {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
}

/** 页码同理：`(num - 1) * size` 里 num 为 0 / 负数会算出负 OFFSET，SQLite 直接报错 */
export function pageNum(raw, def = 1) {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : def;
}

export default { pageSize, pageNum };
