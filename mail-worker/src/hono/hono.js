import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

const hasMethods = (binding, methods) => binding != null
	&& methods.every(method => typeof binding[method] === 'function');

app.use('*', async (c, next) => {
	if (!hasMethods(c.env.kv, ['get', 'put', 'delete', 'list'])) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound', 502));
	}

	if (!hasMethods(c.env.db, ['prepare', 'batch'])) {
		return c.json(result.fail('D1数据库未绑定 D1 database not bound', 502));
	}

	return next();
});

app.use('*', cors());

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	return c.json(result.fail(err.message, err.code));
});

export default app;


