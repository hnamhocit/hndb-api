export const constants = {
	MAX_ROWS: Number(process.env.MAX_ROWS || '50000'),
	QUERY_TIMEOUT_MS: Number(process.env.QUERY_TIMEOUT_MS || '3000'),
	DATABASE_URL: process.env.DATABASE_URL || '',
}
