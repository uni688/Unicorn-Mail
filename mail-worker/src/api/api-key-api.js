import app from '../hono/hono';
import result from '../model/result';
import apiKeyService from '../service/api-key-service';
import userContext from '../security/user-context';

/**
 * P4（§5.3.5 / §10.5）：开放 API 的 Key 管理。
 *
 * 路径形状与 §10.5 表格不同，这是一处**有意的偏差**（已写进设计文档的偏差说明）：
 * 文档写的是 `GET/POST /api-key`、`PUT /api-key/status`、`DELETE /api-key/:id`、
 * `GET /api-key/:id/usage`。但 `security.js` 的权限校验是**路径前缀匹配**
 * （`requirePerms.findIndex(item => path.startsWith(item))`）——
 * `/api-key/:id` 这种带路径参数的形状里，`/api-key/7` 无法与 `/api-key/list` 区分，
 * 「查看」和「删除」就必然落进同一个权限键。所以沿用仓库既有的
 * `/regKey/add|list|delete` 动词式命名，每个动作一个独立前缀，权限才能拆得开。
 *
 * 资源是全新的，按 §0.7 的先例新建文件，并在 `hono/webs.js` 追加 import。
 */

app.post('/apiKey/add', async (c) => {
	const data = await apiKeyService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/apiKey/list', async (c) => {
	const list = await apiKeyService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.put('/apiKey/setStatus', async (c) => {
	await apiKeyService.setStatus(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/apiKey/delete', async (c) => {
	await apiKeyService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/apiKey/usage', async (c) => {
	const list = await apiKeyService.usage(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

/**
 * 可选 scope 清单。前端创建表单与文档页都要渲染它，硬编码在前端等于同一份映射维护两遍
 * ——scope 加一个、前端忘了加，用户就永远勾不到那一项。
 */
app.get('/apiKey/scopes', async (c) => {
	// 每项带 `allowed`：角色没有对应站内权限的 scope 勾了也建不出来，前端置灰并说明原因
	return c.json(result.ok(await apiKeyService.scopeOptions(c, userContext.getUserId(c))));
});
