import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

/* ------------------------------------------------------------------ P3 增量（§10.5）
 * 新增路由都挂在这个文件里，没有为每条路由单开一个 api 文件（那样 webs.js 要多 6 行
 * import，换来 6 个只有一条路由的文件）。上面既有的路由一条都没动。
 */

// 增量 1：侧栏 / Picker 角标。accountId=N | all=1 | accountIds=1,2,3
app.get('/email/counts', async (c) => {
	const data = await emailService.counts(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// 增量 2：回收站。/email/list 的 type 是数字（收/发），不能借它的位，故独立路由
app.get('/email/trash', async (c) => {
	const data = await emailService.trashList(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/email/restore', async (c) => {
	await emailService.restore(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

// 物理删除：security.js 里挂在既有的 email:delete 权限键下，没有新增权限键
app.delete('/email/purge', async (c) => {
	await emailService.purge(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

// 增量 3：标记未读（既有的 /email/read 是单向的）
app.put('/email/unread', async (c) => {
	await emailService.markUnread(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

