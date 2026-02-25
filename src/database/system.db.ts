import { Pool } from 'pg'

import { constants } from '../constants'

export const systemPool = new Pool({
	connectionString: constants.DATABASE_URL,
	ssl: { rejectUnauthorized: false },
	connectionTimeoutMillis: constants.QUERY_TIMEOUT_MS,
})

export async function checkSystemPoolHealth() {
	try {
		const client = await systemPool.connect()
		const result = await client.query('SELECT NOW() AS current_time')
		console.log(
			`✅ Connected to System Database! Server DB time: ${result.rows[0].current_time}`,
		)
		client.release()
	} catch (error: any) {
		console.error('❌ Failed to connect to System Database:', error.message)
	}
}
