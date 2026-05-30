import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';

const r2Service = {

	async storageType(c) {

		const setting = await settingService.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c, key, content, metadata) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c, key) {
		const storageType = await this.storageType(c);
		if (storageType === 'KV') {
			return await c.env.kv.getWithMetadata(key, { type: "arrayBuffer" });
		}
		if (storageType === 'R2') {
			return await c.env.r2.get(key);
		}
		return await s3Service.getObj(c, key);
	},

	async toObjResp(c, key) {
		const storageType = await this.storageType(c);
		const obj = await this.getObj(c, key);

		if (!obj || (!obj.body && obj.value == null)) {
			return new Response('Not Found', { status: 404 });
		}

		if (storageType === 'KV') {
			return new Response(obj.value, {
				headers: {
					'Content-Type': obj.metadata?.contentType || 'application/octet-stream',
					'Content-Disposition': obj.metadata?.contentDisposition || null,
					'Cache-Control': obj.metadata?.cacheControl || null
				}
			});
		}

		if (storageType === 'R2') {
			return new Response(obj.body, {
				headers: {
					'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
					'Content-Disposition': obj.httpMetadata?.contentDisposition || null,
					'Cache-Control': obj.httpMetadata?.cacheControl || null
				}
			});
		}

		return new Response(obj.Body, {
			headers: {
				'Content-Type': obj.ContentType || 'application/octet-stream',
				'Content-Disposition': obj.ContentDisposition || null,
				'Cache-Control': obj.CacheControl || null
			}
		});
	},

	async delete(c, key) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	}

};
export default r2Service;
