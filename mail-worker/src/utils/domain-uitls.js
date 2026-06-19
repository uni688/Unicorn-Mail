const domainUtils = {
	toOssDomain(domain) {

		if (!domain) {
			return ''
		}

		if (!domain.startsWith('http')) {
			return 'https://' + domain
		}

		if (domain.endsWith("/")) {
			domain = domain.slice(0, -1);
		}

		return domain
	},

	envDomainList(domain) {
		if (!domain) {
			return []
		}
		if (Array.isArray(domain)) {
			return domain.map(item => String(item).trim().toLowerCase()).filter(Boolean)
		}
		return String(domain).split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
	}
}

export default  domainUtils
