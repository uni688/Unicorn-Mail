import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { Webhook } from 'svix';
import { t } from '../i18n/i18n';

const resendService = {

	verifyWebhook(c, body) {
		const secret = c.env.resend_webhook_secret;
		if (!secret) {
			throw new BizError(t('resendWebhookSecretMissing'), 500);
		}

		try {
			return new Webhook(secret).verify(body, {
				'svix-id': c.req.header('svix-id'),
				'svix-timestamp': c.req.header('svix-timestamp'),
				'svix-signature': c.req.header('svix-signature')
			});
		} catch (err) {
			throw new BizError(t('resendWebhookInvalid'), 401);
		}
	},

	async webhooks(c, body) {

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
