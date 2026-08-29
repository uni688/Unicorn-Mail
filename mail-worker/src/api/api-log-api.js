import app from '../hono/hono';
import result from '../model/result';
import apiLogService from '../service/api-log-service';
import userContext from '../security/user-context';

/**
 * P4（§4.3 / §10.5）：开放 API 的请求日志。
 *
 * 命名同 `api-key-api.js`：动词式路径，理由见那个文件的注释。
 */

app.get('/apiLog/list', async (c) => {
	const data = await apiLogService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

/**
 * 日志行只存 `key_id`，页面要显示 Key 名称。单独一条轻量接口而不是 join 进列表：
 * 列表是虚拟滚动、每页都要拉，Key 名称字典整个会话只需要一份（含已软删的 Key，
 * 否则删过的 Key 打的历史日志会显示成孤儿 id）。
 */
app.get('/apiLog/keys', async (c) => {
	const list = await apiLogService.keyNames(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});
