import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Unicorn Mail worker', () => {
	it('serves the frontend (unit style)', async () => {
		const request = new Request('http://example.com');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Unicorn Mail</title>');
	});

	it('serves the frontend (integration style)', async () => {
		const response = await SELF.fetch('http://example.com');
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Unicorn Mail</title>');
	});

	it('has a working KV namespace binding', async () => {
		const key = `vitest-kv-${crypto.randomUUID()}`;
		await env.kv.put(key, 'ok');
		expect(await env.kv.get(key)).toBe('ok');
		await env.kv.delete(key);
	});

	it('does not report a bound KV namespace as missing', async () => {
		const response = await SELF.fetch('http://example.com/api/test');
		const body = await response.text();

		expect(body).not.toContain('KV数据库未绑定');
		expect(body).not.toContain('KV database not bound');
	});

	it('reports a genuinely missing KV binding', async () => {
		const request = new Request('http://example.com/api/test');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, kv: undefined }, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('KV数据库未绑定 KV database not bound');
	});
});
