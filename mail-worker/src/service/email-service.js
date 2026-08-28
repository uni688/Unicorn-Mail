import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import { pageSize } from '../utils/page-utils';

/**
 * 解析「这次查询要不要跨邮箱聚合」。
 *
 * `accountId = 0` 是前端「全部邮箱」的约定值（`account_id` 自增从 1 起，不存在 0），
 * 所以它只能是聚合语义，绝不能退化成 `email.account_id = 0`（那是必然为空的查询），
 * 更不能拿 `undefined.allReceive` 去解引用（那是 500）。
 *
 * 三种入参各自的归宿：
 *   - 显式传了 `allReceive` → 听前端的
 *   - 没传且 `accountId` 为 0 / 空 → 聚合（1）
 *   - 没传且 `accountId` 有值 → 查这个邮箱的 `allReceive`，查不到就是非法邮箱，报错而不是静默给空
 */
async function resolveAllReceive(c, accountId, allReceive) {
	const explicit = Number(allReceive);
	if (!isNaN(explicit)) return explicit;
	if (!accountId) return 1;
	const accountRow = await accountService.selectById(c, accountId);
	if (!accountRow) throw new BizError(t('noUserAccount'));
	return Number(accountRow.allReceive);
}

/**
 * 给软删 / 还原的行同步 `email.del_time`（回收站 30 天清理的计时列）。
 *
 * 这一列刻意不进 drizzle 实体：`select({...email})` 到处在用，实体里多一列，
 * 没跑过 `v3_1DB()` 的库每一次列表查询都会 500。所以只在这里用裸 SQL 点对点地写它，
 * 并且**吞掉「列不存在」**——删除 / 还原本身必须成功，计时列是附加能力。
 *
 * `stamp` 为 true 表示进回收站（盖时间戳），false 表示还原（清时间戳）。
 * 清时间戳是必须的：不清的话这一行会一直带着上一次删除的日期，
 * 下一次删除时 cron 的「补时间戳」跳过它、「删满 30 天」却命中它 —— 当晚就被物理删除。
 */
async function syncDelTime(c, userId, emailIds, stamp) {
	if (!emailIds || emailIds.length === 0) return;
	const CHUNK = 100;
	try {
		for (let i = 0; i < emailIds.length; i += CHUNK) {
			const chunk = emailIds.slice(i, i + CHUNK);
			const placeholders = chunk.map(() => '?').join(',');
			await c.env.db.prepare(
				`UPDATE email SET del_time = ${stamp ? 'CURRENT_TIMESTAMP' : 'NULL'}
				 WHERE user_id = ? AND email_id IN (${placeholders})`
			).bind(userId, ...chunk).run();
		}
	} catch (e) {
		if (!/no such column/i.test(e.message)) throw e;
		console.warn(`del_time 未同步：缺少 email.del_time 列，请重新执行 /api/init/:secret`);
	}
}

/**
 * 搜索谓词（§7.5 / §10.5「`/email/list` 待新增的过滤参数」）。
 *
 * 参数名逐个对齐前端 `useSearchQuery.toListParams()`（`mail-vue/src/composables/useSearchQuery.js:154`），
 * 那一侧是 `?q=` 的唯一解析器，两边对不上就是「搜了但没过滤」：
 *
 * | 入参 | 语义 |
 * |---|---|
 * | `keyword` | 全文：主题 / 发件地址 / 发件人名 / 收件地址 / 正文纯文本 |
 * | `from` | 发件地址**或**发件人名（`matchesQuery` 的本地兜底也是这两个字段） |
 * | `to` `subject` | 收件地址 / 主题 |
 * | `hasAtt` `hasCode` | 有普通附件 / 有验证码 |
 * | `star` | 自己星标过的 |
 * | `unread` | **列值**（0 未读 / 1 已读，见 `entity-const.js` —— 名字和直觉相反），两侧都不取反 |
 * | `startTime` `endTime` | `create_time` 闭区间，UTC 字符串，前端已按本地日历日转好 |
 *
 * 五件必须做对的事：
 * 1. **参数化**。模式串一律走绑定参数，没有一处字符串拼接（附录 C 第 1 条就是拼出来的洞）。
 * 2. **转义通配符**。用户打进来的 `%` `_` `\` 是字面量，转义后显式声明 `ESCAPE '\'`。
 *    管理端 `allList()` 那几处老写法没转义 —— 在那里一个 `%` 等于「不过滤」，新代码不学它。
 * 3. **`hasAtt` / `star` 用 EXISTS 而不是再 join 一次**。`list()` 已经 leftJoin 了 `star`
 *    用来算 `isStar`，附件更是一对多：join 一封两个附件的邮件会变成两行，翻页游标随之错位。
 *    半连接不改变行数，同一份谓词还能直接用在 `count()` 那条查询上。
 * 4. **`star` 必须带 userId**。星标是「谁标的」，漏了就成了「任何人标过的」。
 * 5. **空参数返回空数组**。没在搜的时候 `and(...[])` 不产生任何谓词，
 *    `list()` / `trashList()` / `starService.list()` 与从前逐字节等价。
 *
 * 刻意**不**作用于 `list()` 的 `latestEmailQuery`：那一条是长轮询的游标（「全局最新一封的 id」），
 * 按搜索条件缩小它，长轮询会从一个偏小的 id 起反复拉回同一批邮件。
 */
function searchConditions(params, userId) {

	const { keyword, from, to, subject, hasAtt, hasCode, star: onlyStar, unread, startTime, endTime } = params ?? {};

	const conditions = [];

	/** `LIKE` 之前的净化：截到 64（与 `accountService.searchByKeyword` 同一个上限）+ 转义通配符 */
	const term = (value) => {
		const raw = String(value ?? '').trim();
		if (!raw) return null;
		return raw.substring(0, 64).replace(/[\\%_]/g, ch => `\\${ch}`);
	};

	const contains = (column, value) => sql`${column} COLLATE NOCASE LIKE ${'%' + value + '%'} ESCAPE '\\'`;

	const keywordTerm = term(keyword);
	if (keywordTerm) {
		conditions.push(or(
			contains(email.subject, keywordTerm),
			contains(email.sendEmail, keywordTerm),
			contains(email.name, keywordTerm),
			contains(email.toEmail, keywordTerm),
			contains(email.text, keywordTerm)
		));
	}

	const fromTerm = term(from);
	if (fromTerm) {
		conditions.push(or(contains(email.sendEmail, fromTerm), contains(email.name, fromTerm)));
	}

	const toTerm = term(to);
	if (toTerm) {
		conditions.push(contains(email.toEmail, toTerm));
	}

	const subjectTerm = term(subject);
	if (subjectTerm) {
		conditions.push(contains(email.subject, subjectTerm));
	}

	if (Number(hasAtt) === 1) {
		conditions.push(sql`EXISTS (SELECT 1 FROM attachments a WHERE a.email_id = ${email.emailId} AND a.type = ${attConst.type.ATT})`);
	}

	if (Number(hasCode) === 1) {
		conditions.push(ne(email.code, ''));
	}

	if (Number(onlyStar) === 1) {
		conditions.push(sql`EXISTS (SELECT 1 FROM star s WHERE s.email_id = ${email.emailId} AND s.user_id = ${userId})`);
	}

	// `unread` 只认 0 / 1；`''`（前端没勾这一项时的空 query 参数）与任何脏值都当没传
	const unreadValue = Number(unread);
	if (unread !== undefined && unread !== null && unread !== '' && (unreadValue === emailConst.unread.UNREAD || unreadValue === emailConst.unread.READ)) {
		conditions.push(eq(email.unread, unreadValue));
	}

	if (startTime) {
		conditions.push(gte(email.createTime, String(startTime)));
	}

	if (endTime) {
		conditions.push(lte(email.createTime, String(endTime)));
	}

	return conditions;
}

const emailService = {

	/** 暴露给 `starService.list()`：星标视图也是四个邮件视图之一，搜索语义必须同源 */
	searchConditions,

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive } = params;

		size = pageSize(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		allReceive = await resolveAllReceive(c, accountId, allReceive);

		// 顶栏 / ⌘K 的 `?q=` 过滤条件；没在搜时是空数组，谓词与从前一模一样
		const search = searchConditions(params, userId);

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					...search
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					...search
				)
		).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));


		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = this.toEmailIds(emailIds);
		if (emailIdList.length === 0) {
			return;
		}
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
		// 进回收站的当下就盖时间戳，cron 不必再靠「补 NULL」这一步猜什么时候被删的
		await syncDelTime(c, userId, emailIdList, true);
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [] //附件
		} = params;

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allInternal = receiveEmail.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			// selectById 只按 emailId 查，必须自己核对归属：否则任意 id 都能回复，
			// 响应里带回受害者的 messageId（inReplyTo / relation），等于一个 id → Message-ID 的预言机
			if (!emailRow || emailRow.userId !== userId) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend
		if (!allInternal) {

			if (useCloudflareEmail) {
				sendResult = await this.sendByCloudflareEmail(c, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			} else {
				sendResult = await this.sendByResend(resendToken, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			}

		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.status = useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, receiveEmail, emailResult, attList);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		//地址大小写不敏感（与 accountService.selectByEmailIncludeDel 一致），且不投递给已软删的邮箱：
		//精确匹配会把发给 Alice@ 的站内信判成「无此收件人」，而软删邮箱会收到一封 list()/trashList()
		//永远过滤掉的邮件 —— 两种都是黑洞，且发件人那一侧仍被标记为 DELIVERED
		let accountList = receiveEmail.length === 0 ? [] : await orm(c).select().from(account).where(
			and(
				or(...receiveEmail.map(addr => sql`${account.email} COLLATE NOCASE = ${addr}`)),
				eq(account.isDel, isDel.NORMAL)
			)).all();

		//查询所有收件人权限身份
		const userIds = accountList.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			// 查询用了 COLLATE NOCASE，这里的回填也必须大小写不敏感，否则查到了却匹配不上
			const accountRow = accountList.find(accountRow => accountRow.email?.toLowerCase() === email.toLowerCase());

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		accountId = Number(accountId);
		allReceive = await resolveAllReceive(c, accountId, allReceive);

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = pageSize(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select().from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				ne(email.status, emailConst.status.SAVING)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({...email, userEmail: user.email}).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
		// 与 restore() 同理：整户还原也要把计时列清空，否则这些行下次被删即到期
		try {
			await c.env.db.prepare(`UPDATE email SET del_time = NULL WHERE user_id = ?`).bind(userId).run();
		} catch (e) {
			if (!/no such column/i.test(e.message)) throw e;
			console.warn(`del_time 未同步：缺少 email.del_time 列，请重新执行 /api/init/:secret`);
		}
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	},

	/* ------------------------------------------------------------------ P3 增量（§10.5）
	 * 以下方法全部是新增，上面的既有函数一个都没动。
	 */

	/**
	 * 增量 1：侧栏与 Picker 的角标计数。三种模式互斥：
	 *
	 * - `accountIds=1,2,3`（最多 5 个）→ `{unreadMap}`，给 Picker「最近」分组的未读角标。
	 *   一条 groupBy 查完，不是 N 次查询。
	 * - `all=1` → 「全部邮箱」聚合。
	 * - `accountId=N` → 单个邮箱。该邮箱若开了「接收全部」，计数跟着 `list()` 一起放宽，
	 *   否则数字会比列表条数小。
	 *
	 * 谓词逐条对齐 `list()`（含 `leftJoin(account)` + `account.isDel`）：§10.5 要求
	 * 「计数必须和列表一致」，所以这里既不加 KV 缓存也不加 status 过滤。
	 * `star` 故意不按邮箱过滤 —— `starService.list()` 是按用户查的，过滤了就对不上。
	 * 草稿不在这里：草稿只存在浏览器 Dexie 里，后端根本没有这张表。
	 */
	async counts(c, params, userId) {

		let { accountId, all, accountIds } = params;

		if (accountIds) {

			const ids = String(accountIds)
				.split(',')
				.map(Number)
				.filter(id => Number.isInteger(id) && id > 0)
				.slice(0, 5);

			const unreadMap = {};

			if (ids.length === 0) {
				return { unreadMap };
			}

			ids.forEach(id => unreadMap[id] = 0);

			const rows = await orm(c).select({ accountId: email.accountId, num: count() })
				.from(email)
				.leftJoin(account, eq(account.accountId, email.accountId))
				.where(
					and(
						eq(email.userId, userId),
						inArray(email.accountId, ids),
						eq(email.type, emailConst.type.RECEIVE),
						eq(email.unread, emailConst.unread.UNREAD),
						eq(email.isDel, isDel.NORMAL),
						eq(account.isDel, isDel.NORMAL)
					))
				.groupBy(email.accountId)
				.all();

			rows.forEach(row => unreadMap[row.accountId] = row.num);
			return { unreadMap };
		}

		all = Number(all);
		accountId = Number(accountId);

		// `accountId=0` 是前端「全部邮箱」的约定值，和 `all=1` 同义（见 resolveAllReceive）
		let allReceive = all === 1 || !accountId;

		if (!allReceive) {

			const accountRow = await accountService.selectById(c, accountId);

			// 越权保护：selectById 不带 userId，必须自己核对归属
			if (!accountRow || accountRow.userId !== userId) {
				throw new BizError(t('noUserAccount'));
			}

			allReceive = !!accountRow.allReceive;
		}

		const scope = (...extra) => and(
			eq(email.userId, userId),
			allReceive ? eq(1, 1) : eq(email.accountId, accountId),
			eq(account.isDel, isDel.NORMAL),
			...extra
		);

		const countQuery = () => orm(c).select({ num: count() })
			.from(email)
			.leftJoin(account, eq(account.accountId, email.accountId));

		// 一次 batch = 一个 D1 往返；6 条 COUNT 分开发就是 6 个往返
		const [inbox, unread, code, trash, sent, starred] = await orm(c).batch([
			countQuery().where(scope(eq(email.type, emailConst.type.RECEIVE), eq(email.isDel, isDel.NORMAL))),
			countQuery().where(scope(eq(email.type, emailConst.type.RECEIVE), eq(email.isDel, isDel.NORMAL), eq(email.unread, emailConst.unread.UNREAD))),
			countQuery().where(scope(eq(email.type, emailConst.type.RECEIVE), eq(email.isDel, isDel.NORMAL), ne(email.code, ''))),
			countQuery().where(scope(eq(email.isDel, isDel.DELETE))),
			countQuery().where(scope(eq(email.type, emailConst.type.SEND), eq(email.isDel, isDel.NORMAL))),
			orm(c).select({ num: count() })
				.from(star)
				.leftJoin(email, eq(email.emailId, star.emailId))
				.where(and(eq(star.userId, userId), eq(email.isDel, isDel.NORMAL)))
		]);

		const num = rows => rows[0]?.num ?? 0;

		return {
			inbox: num(inbox),
			unread: num(unread),
			star: num(starred),
			code: num(code),
			trash: num(trash),
			sent: num(sent)
		};
	},

	/**
	 * 增量 2：回收站列表。删除本来就是软删（`delete()` 只写 `isDel`），所以这里就是
	 * 把 `list()` 的分页原样抄一遍、把 `isDel` 反过来。
	 *
	 * 不去改 `list()` 加分支，也没有做成 `/email/list?type=trash` —— `type` 在 `list()`
	 * 里是数字（收/发），塞一个字符串进去会和既有语义打架，所以回收站是独立路由。
	 * 默认不按 type 过滤：删掉的已发送邮件同样该出现在回收站里。
	 */
	async trashList(c, params, userId) {

		let { emailId, accountId, size, type, allReceive } = params;

		size = pageSize(size);
		emailId = Number(emailId);
		accountId = Number(accountId);
		type = type === undefined || type === '' ? undefined : Number(type);

		if (!emailId) {
			emailId = 9999999999;
		}

		allReceive = await resolveAllReceive(c, accountId, allReceive);

		const search = searchConditions(params, userId);

		const scope = (...extra) => and(
			allReceive ? eq(1, 1) : eq(email.accountId, accountId),
			eq(email.userId, userId),
			eq(email.isDel, isDel.DELETE),
			eq(account.isDel, isDel.NORMAL),
			Number.isInteger(type) ? eq(email.type, type) : undefined,
			...search,
			...extra
		);

		const listQuery = orm(c)
			.select({ ...email, starId: star.starId })
			.from(email)
			.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, userId)))
			.leftJoin(account, eq(account.accountId, email.accountId))
			.where(scope(lt(email.emailId, emailId)))
			.orderBy(desc(email.emailId))
			.limit(size)
			.all();

		const totalQuery = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(account, eq(account.accountId, email.accountId))
			.where(scope())
			.get();

		let [list, totalRow] = await Promise.all([listQuery, totalQuery]);

		list = list.map(item => ({ ...item, isStar: item.starId != null ? 1 : 0 }));

		await this.emailAddAtt(c, list);

		return { list, total: totalRow.total };
	},

	/** 增量 2：从回收站还原。删除是软删，还原就是把 `isDel` 写回去 */
	async restore(c, params, userId) {

		const emailIds = this.toEmailIds(params.emailIds);

		if (emailIds.length === 0) {
			return;
		}

		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(
			and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.DELETE),
				inArray(email.emailId, emailIds)))
			.run();

		// 还原必须清掉计时列，否则这封邮件下次被删时会被 cron 按「上次删除日期」立即物理删除
		await syncDelTime(c, userId, emailIds, false);
	},

	/**
	 * 增量 2：彻底删除。这是用户侧唯一的物理删除入口，误传 id 就是真丢数据。
	 *
	 * 「清空回收站」必须是**显式意图**（`all=1`），不能由「id 列表为空」推断出来：
	 * `toEmailIds()` 分不清「没传 id」和「传了 id 但全部非法」，前端一个
	 * `purge([undefined])` / `?emailIds=` 就会把整个回收站连附件一起清掉。
	 * 唯一不可逆的操作，默认值必须是「什么都不做」。
	 */
	async purge(c, params, userId) {

		const emailIds = this.toEmailIds(params.emailIds);
		const purgeAll = Number(params.all) === 1;

		if (!purgeAll && emailIds.length === 0) {
			return;
		}

		const rows = await orm(c).select({ emailId: email.emailId }).from(email).where(
			and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.DELETE),
				purgeAll ? undefined : inArray(email.emailId, emailIds)))
			.all();

		await this.physicsDeleteEmailIds(c, rows.map(row => row.emailId));
	},

	/** 增量 3：标记未读。既有的 `read()` 是单向的，这里补反向的一半 */
	async markUnread(c, params, userId) {

		const emailIds = this.toEmailIds(params.emailIds);

		if (emailIds.length === 0) {
			return;
		}

		await orm(c).update(email).set({ unread: emailConst.unread.UNREAD }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIds)))
			.run();
	},

	toEmailIds(emailIds) {
		if (emailIds === undefined || emailIds === null || emailIds === '') {
			return [];
		}
		const list = Array.isArray(emailIds) ? emailIds : String(emailIds).split(',');
		return list.map(Number).filter(id => Number.isInteger(id) && id > 0);
	},

	/** 分批物理删除：`removeByEmailIds` 每个 id 会展开 2 条 SQL，一次别喂太多进 batch */
	async physicsDeleteEmailIds(c, emailIds) {

		if (!emailIds || emailIds.length === 0) {
			return 0;
		}

		const CHUNK = 100;

		for (let i = 0; i < emailIds.length; i += CHUNK) {
			const chunk = emailIds.slice(i, i + CHUNK);
			await attService.removeByEmailIds(c, chunk);
			await starService.removeByEmailIds(c, chunk);
			await orm(c).delete(email).where(inArray(email.emailId, chunk)).run();
		}

		return emailIds.length;
	},

	/**
	 * 增量 2 的 cron 部分（决策 9「回收站 30 天清理」）：由 `scheduled()` 每天调用一次。
	 *
	 * 计时用的是新增列 `email.del_time`，**不是** `create_time` —— 拿收件时间算，
	 * 一封两年前的邮件今天删掉今晚就被真删了。
	 *
	 * `delete()` 现在进回收站时就写 `del_time`，所以这里的「补时间戳」只服务两类历史行：
	 * v3.1 之前删掉的，和 `del_time` 列刚加上时已经在回收站里的。补写同样限量 500 行，
	 * 避免首次部署时一条无界 UPDATE 打穿 D1 的单语句预算；剩下的下一次 cron 继续补。
	 *
	 * `del_time` 是 `v3_1DB()` 加的列。没跑过 init 的库这里会抛「no such column」，
	 * 那一种情况只打警告（清不了回收站不该拖垮 `scheduled()` 里其它日常任务）；
	 * 其它异常必须抛出去 —— 否则物理删除中途失败会留下「附件已删、邮件行还在」的孤立状态，
	 * 而日志上只有一条无关的 schema 警告。
	 */
	async clearTrash(c, days = 30, limit = 500) {

		try {

			await c.env.db.prepare(
				`UPDATE email SET del_time = CURRENT_TIMESTAMP
				 WHERE email_id IN (SELECT email_id FROM email WHERE is_del = 1 AND del_time IS NULL LIMIT ?)`
			).bind(Number(limit)).run();

			const { results } = await c.env.db.prepare(
				`SELECT email_id FROM email WHERE is_del = 1 AND del_time IS NOT NULL AND del_time <= datetime('now', ?) LIMIT ?`
			).bind(`-${Number(days)} day`, Number(limit)).all();

			return await this.physicsDeleteEmailIds(c, (results ?? []).map(row => row.email_id));

		} catch (e) {
			if (/no such column/i.test(e.message)) {
				console.warn(`回收站清理跳过：缺少 email.del_time 列，请重新执行 /api/init/:secret`);
				return 0;
			}
			console.error(`回收站清理失败：${e.message}`);
			throw e;
		}
	}
};

export default emailService;
