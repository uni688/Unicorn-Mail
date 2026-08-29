import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import apiLogService from './service/api-log-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await r2Service.toObjResp({ env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await oauthService.clearNoBindOathUser({ env })
		await analysisService.refreshEchartsCache({ env })
		// P3 增量 2（决策 9）：回收站满 30 天的邮件物理删除。放在最后，且方法内部自带
		// try/catch —— 清不了回收站不该影响上面几个日常任务
		await emailService.clearTrash({ env })
		// P4（§4.5）：api_log 只留 30 天。同样自带 try/catch，且排在最后一位 ——
		// 没跑过 v3_2DB() 的库上 api_log 还不存在，那种情况下要安静跳过而不是让整个 cron 挂掉
		await apiLogService.clearExpired({ env })
	},
};
