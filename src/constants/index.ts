import { LRUCache } from 'lru-cache/raw'
import { Pool } from 'pg'

const MAX_ROWS = Number(process.env.MAX_ROWS || '50000')
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || '3000')

const systemPool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false },
	connectionTimeoutMillis: QUERY_TIMEOUT_MS,
})

async function checkSystemPoolHealth() {
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

const pools = new LRUCache<string, Pool>({
	max: 500,
	ttl: 1000 * 60 * 15,
	dispose: (pool, key) => {
		pool.end().catch((err) =>
			console.error(`Error when trying to close pool ${key}:`, err),
		)
	},
})

function getPool(dbName: string) {
	const key = dbName

	if (!pools.has(key)) {
		pools.set(
			key,
			new Pool({
				host: 'localhost',
				port: 5432,
				user: 'postgres',
				password: '@hn71LP10',
				database: dbName,
				max: 5,
				connectionTimeoutMillis: QUERY_TIMEOUT_MS,
			}),
		)
	}

	return pools.get(key)!
}

export {
	checkSystemPoolHealth,
	getPool,
	MAX_ROWS,
	QUERY_TIMEOUT_MS,
	systemPool,
}
