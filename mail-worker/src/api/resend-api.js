import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const body = await c.req.text();
		const payload = resendService.verifyWebhook(c, body);
		await resendService.webhooks(c, payload);
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, e.code || 500)
	}
})
