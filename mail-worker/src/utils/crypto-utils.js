const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_HASH_PREFIX = 'pbkdf2';

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},


	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	async genHashPassword(password, salt) {
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const hashBuffer = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				hash: 'SHA-256',
				salt: encoder.encode(salt),
				iterations: PBKDF2_ITERATIONS
			},
			key,
			256
		);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return `${PBKDF2_HASH_PREFIX}$${PBKDF2_ITERATIONS}$${btoa(String.fromCharCode(...hashArray))}`;
	},

	async genLegacyHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		const hash = storedHash?.startsWith(`${PBKDF2_HASH_PREFIX}$`)
			? await this.genHashPassword(inputPassword, salt)
			: await this.genLegacyHashPassword(inputPassword, salt);
		return hash === storedHash;
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}
};

export default saltHashUtils;
