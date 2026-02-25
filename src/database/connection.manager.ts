import { LRUCache } from 'lru-cache'
import { Pool } from 'pg'

class ConnectionManager {
	private pools: LRUCache<string, Pool>

	constructor() {
		this.pools = new LRUCache<string, Pool>({
			max: 500,
			ttl: 1000 * 60 * 15, // 15 phút không dùng sẽ tự động đóng kết nối
			dispose: (pool, key) => {
				pool.end().catch((err) =>
					console.error(`❌ Error closing pool ${key}:`, err),
				)
				console.log(`♻️ Pool ${key} has been disposed to free RAM.`)
			},
		})
	}

	public getPool(dbName: string) {
		if (this.pools.has(dbName)) {
			return this.pools.get(dbName)!
		}

		return null
	}
}

export const connectionManager = new ConnectionManager()
