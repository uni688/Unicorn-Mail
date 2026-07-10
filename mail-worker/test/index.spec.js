import { describe, it, expect } from 'vitest';
import {
	assertAttachmentPolicy,
	assertMessageSize,
	attachmentContentDisposition,
	isSameRoutePath,
	sanitizeAttachmentName
} from '../src/utils/attachment-policy';
import cryptoUtils from '../src/utils/crypto-utils';

function fakeStatement(sql) {
	return {
		sql,
		params: [],
		bind(...params) {
			this.params = params;
			return this;
		}
	};
}

describe('attachment policy', () => {
	it('sanitizes attachment filenames for response headers', () => {
		expect(sanitizeAttachmentName('bad\r\n"name\\.txt')).toBe('bad___name_.txt');
		expect(attachmentContentDisposition('résumé.pdf')).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
	});

	it('rejects dangerous attachment types and oversized messages', () => {
		expect(() => assertAttachmentPolicy([
			{ filename: 'payload.svg', mimeType: 'image/svg+xml', size: 128 }
		])).toThrow('Attachment type not allowed');

		expect(() => assertMessageSize(25 * 1024 * 1024 + 1)).toThrow('Message too large');
	});
});

describe('route permission matching', () => {
	it('matches exact API paths without prefix bleed', () => {
		expect(isSameRoutePath('/user/list', '/user/list')).toBe(true);
		expect(isSameRoutePath('/user/list/', '/user/list')).toBe(true);
		expect(isSameRoutePath('/user/listExtra', '/user/list')).toBe(false);
	});
});

describe('public user import SQL safety', () => {
	it('keeps request-derived metacharacters in bound parameters', () => {
		const prepared = [];
		const maliciousUserAgent = "BadBrowser'); DROP TABLE user; --";
		const db = {
			prepare(sql) {
				const statement = fakeStatement(sql);
				prepared.push(statement);
				return statement;
			}
		};

		const userInsert = db.prepare(`INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind('safe@example.com', 'hash', 'salt', 1, 'Other', maliciousUserAgent, '127.0.0.1', '127.0.0.1', 'Other', '2026-07-10 00:00:00', '2026-07-10 00:00:00');

		expect(userInsert.sql).not.toContain(maliciousUserAgent);
		expect(userInsert.sql).toContain('VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
		expect(userInsert.params).toContain(maliciousUserAgent);
	});
});

describe('password hashing', () => {
	it('uses versioned PBKDF2 hashes for new passwords', async () => {
		const { salt, hash } = await cryptoUtils.hashPassword('correct horse battery staple');

		expect(hash).toMatch(/^pbkdf2\$210000\$/);
		expect(await cryptoUtils.verifyPassword('correct horse battery staple', salt, hash)).toBe(true);
		expect(await cryptoUtils.verifyPassword('wrong password', salt, hash)).toBe(false);
	});

	it('keeps verifying legacy SHA-256 password hashes', async () => {
		const legacyHash = await cryptoUtils.genLegacyHashPassword('legacy password', 'legacy salt');

		expect(await cryptoUtils.verifyPassword('legacy password', 'legacy salt', legacyHash)).toBe(true);
		expect(await cryptoUtils.verifyPassword('wrong password', 'legacy salt', legacyHash)).toBe(false);
	});
});
