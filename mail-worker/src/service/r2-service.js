import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';

const r2Service = {

	toRespHeaders(contentType, contentDisposition, cacheControl) {
		const headers = {
			'Content-Type': contentType || 'application/octet-stream'
		};
		if (contentDisposition) {
			headers['Content-Disposition'] = contentDisposition;
		}
		if (cacheControl) {
			headers['Cache-Control'] = cacheControl;
		}
		return headers;
	},

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

	async getObj(c, key, storageType) {
		storageType = storageType || await this.storageType(c);
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
		let obj;
		try {
			obj = await this.getObj(c, key, storageType);
		} catch (error) {
			if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
				return new Response('Not Found', { status: 404 });
			}
			throw error;
		}

		if (!obj) {
			return new Response('Not Found', { status: 404 });
		}

		if (storageType === 'KV') {
			if (obj.value == null) {
				return new Response('Not Found', { status: 404 });
			}
			return new Response(obj.value, {
				headers: this.toRespHeaders(
					obj.metadata?.contentType,
					obj.metadata?.contentDisposition,
					obj.metadata?.cacheControl
				)
			});
		}

		if (storageType === 'R2') {
			if (!obj.body) {
				return new Response('Not Found', { status: 404 });
			}
			return new Response(obj.body, {
				headers: this.toRespHeaders(
					obj.httpMetadata?.contentType,
					obj.httpMetadata?.contentDisposition,
					obj.httpMetadata?.cacheControl
				)
			});
		}

		if (!obj.Body) {
			return new Response('Not Found', { status: 404 });
		}

		let body = obj.Body;
		if (typeof body.transformToWebStream === 'function') {
			body = body.transformToWebStream();
		} else if (typeof body.transformToByteArray === 'function') {
			body = new Uint8Array(await body.transformToByteArray());
		}

		return new Response(body, {
			headers: this.toRespHeaders(
				obj.ContentType,
				obj.ContentDisposition,
				obj.CacheControl
			)
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
