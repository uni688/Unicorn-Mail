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
});
