/**
 * P4（§5.3.5 / §10.5）：开放 API 的常量表。
 *
 * 单独一个文件而不是塞进 `entity-const.js`：这里的 `apiScopes` 不只是枚举，它是
 * **scope → 允许访问的 `/open/*` 路径前缀**的唯一映射表，鉴权中间件（`security/api-key-auth.js`）、
 * Key 创建时的合法性校验、前端创建表单与文档页三处都读它。放进 `entity-const.js`
 * 会让那个文件从「表字段枚举」变成「路由表」，语义混掉。
 */

export const apiKeyConst = {

	status: {
		NORMAL: 0,
		BAN: 1
	},

	/** 明文形如 `um_live_` + 32 位十六进制 */
	prefixNamespace: 'um_live_',

	/**
	 * 展示用前缀取明文的前 8 位随机字符（不含命名空间）。
	 *
	 * §10.5 的示例写的是 `um_live_7f3a`（4 位），但那张表上还有
	 * `CREATE UNIQUE INDEX idx_api_key_prefix`：4 位十六进制只有 65536 种，
	 * 全站几千个 Key 就会撞唯一索引、让创建随机失败。取 8 位后空间是 2^32，
	 * 且鉴权时能靠前缀直接命中唯一一行、不必全表比 hash。UI 上仍然截断显示。
	 */
	prefixLength: 8,

	/** 随机部分长度（十六进制字符数） */
	secretLength: 32,

	nameMaxLength: 30,

	/** 允许的过期天数；0 / 不传 = 永不过期 */
	expireDays: [30, 90, 365],

	/** 单用户 Key 上限。防的是「脚本里循环创建」把表刷爆 */
	maxPerUser: 20
};

/**
 * scope 与 `/open/*` 路径前缀的映射。
 *
 * 命名沿用现有 perm key 的 `资源:动作` 形状（§5.3.5「映射到现有 perm key 体系」），
 * 但**不是** perm key 本身 —— perm 控制的是「这个角色能不能用开放 API 这个功能」，
 * scope 控制的是「这一把 Key 能碰哪些资源」，两者维度不同（见 §0.9 的口径）。
 *
 * `rolePerm`：站内对应接口要的 perm key（`security.js` 的 `premKey` 表）。Key 的 scope
 * 只能**收窄**角色本来就有的能力，不能放大 —— 没有 `email:send` 的角色建一把带
 * `email:send` 的 Key，不能因此就能发信。`null` = 站内对应接口本来就不卡权限
 * （`/email/list` 不在 `requirePerms` 里），这里也不额外卡。
 * 创建时（`apiKeyService.add`）和每次调用时（`api-key-auth.js`）都按它校验：
 * 只在创建时查的话，站长事后收回角色权限，旧 Key 照样能用。
 */
export const apiScopes = [
	{
		key: 'email:read',
		paths: ['/open/email/list', '/open/email/detail', '/open/email/counts'],
		rolePerm: null
	},
	{
		key: 'email:send',
		paths: ['/open/email/send'],
		rolePerm: 'email:send'
	},
	{
		key: 'account:read',
		paths: ['/open/account/list'],
		rolePerm: 'account:query'
	}
];

export const apiScopeKeys = apiScopes.map(scope => scope.key);

/**
 * 「这个角色还能不能用开放 API」的功能开关：有其中任意一个 perm 才放行。
 * 站长在角色页把开发者那一组全取消勾选，这个角色名下已有的 Key 就应该一起失效，
 * 而不是要站长再一把一把地去停用（他也看不到别人的 Key）。
 */
export const apiAccessPerms = ['api-key:query', 'api-key:add'];

/**
 * 不写 `api_log` 的路径（§4.4「探活接口不记日志」）。
 * 探活是被监控系统按秒轮询的，记下来只会把 30 天的日志表填满噪声。
 */
export const apiLogSkipPaths = ['/open/ping'];

/** `api_log` 保留天数（`scheduled()` 每日清理） */
export const apiLogRetainDays = 30;

export default { apiKeyConst, apiScopes, apiScopeKeys, apiAccessPerms, apiLogSkipPaths, apiLogRetainDays };
