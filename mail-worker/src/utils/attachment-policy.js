const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.js', '.mjs', '.exe', '.bat', '.cmd', '.sh']);
const BLOCKED_MIME_TYPES = new Set(['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript']);

function normalizeRoutePath(path) {
	if (!path || path === '/') {
		return '/';
	}
	return path.replace(/\/+$/, '');
}

export function isSameRoutePath(path, routePath) {
	return normalizeRoutePath(path) === normalizeRoutePath(routePath);
}

export function sanitizeAttachmentName(filename = 'attachment') {
	const safeName = String(filename)
		.replace(/[\r\n"\\/\0]/g, '_')
		.replace(/[\x00-\x1f\x7f]/g, '_')
		.trim()
		.slice(0, 180);

	return safeName || 'attachment';
}

export function attachmentContentDisposition(filename, inline = false) {
	const safeName = sanitizeAttachmentName(filename);
	return `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function extensionOf(filename = '') {
	const match = sanitizeAttachmentName(filename).toLowerCase().match(/\.[^.]+$/);
	return match ? match[0] : '';
}

export function assertMessageSize(size) {
	if (size > MAX_MESSAGE_BYTES) {
		throw new Error('Message too large');
	}
}

export function assertAttachmentPolicy(attachments = []) {
	if (attachments.length > MAX_ATTACHMENTS) {
		throw new Error('Too many attachments');
	}

	for (const attachment of attachments) {
		const size = attachment.size ?? attachment.content?.byteLength ?? attachment.content?.length ?? attachment.buff?.byteLength ?? attachment.buff?.length ?? 0;
		const mimeType = String(attachment.mimeType || attachment.type || '').toLowerCase();
		const extension = extensionOf(attachment.filename);

		if (size > MAX_ATTACHMENT_BYTES) {
			throw new Error(`Attachment too large: ${sanitizeAttachmentName(attachment.filename)}`);
		}

		if (BLOCKED_EXTENSIONS.has(extension) || BLOCKED_MIME_TYPES.has(mimeType)) {
			throw new Error(`Attachment type not allowed: ${sanitizeAttachmentName(attachment.filename)}`);
		}
	}
}