import { LRUCache } from 'lru-cache'
import mysql from 'mysql2'
import { Pool as PgPool } from 'pg'

import { DatabaseAdapter, IDataSource } from '../types'
import { decryptPassword } from '../utils'
import { MySQLAdapter, PostgreSQLAdapter } from './adapters'
import { supabase } from './supabase'

class ConnectionManager {
	private cache: LRUCache<string, DatabaseAdapter>

	constructor() {
		this.cache = new LRUCache<string, DatabaseAdapter>({
			max: 200,
			ttl: 1000 * 60 * 15,

			dispose: (adapter, key) => {
				console.log(
					`♻️ Disposing connection for Data Source ID: ${key}`,
				)
				try {
					adapter.close().catch(console.error)
				} catch (error) {
					console.error(`❌ Lỗi khi đóng connection ${key}:`, error)
				}
			},
		})
	}

	public async getClient(
		dataSourceId: string,
		targetDbName?: string,
	): Promise<DatabaseAdapter> {
		const cacheKey = `${dataSourceId}_${targetDbName || 'default'}`

		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!
		}

		console.log(`Cache Miss for: ${cacheKey}. Fetching from System DB...`)

		const { data, error } = await supabase
			.from('data_sources')
			.select('*')
			.eq('id', dataSourceId)
			.single()

		if (error) {
			throw new Error(`Failed to fetch data source: ${error.message}`)
		}

		if (!data) throw new Error('DATA_SOURCE_NOT_FOUND')

		return await this.getConnection(data, targetDbName) // Truyền tiếp targetDbName
	}

	public async getConnection(
		dataSource: IDataSource,
		targetDbName?: string,
	): Promise<DatabaseAdapter> {
		const actualDbName = targetDbName || dataSource.config.database_name
		const cacheKey = `${dataSource.id}_${targetDbName || 'default'}`

		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!
		}

		const password =
			dataSource.config.password ?
				decryptPassword(dataSource.config.password)
			:	undefined

		let adapter: DatabaseAdapter

		switch (dataSource.type) {
			case 'postgresql': {
				let config: any = {}

				if (dataSource.config.method === 'url') {
					const urlObj = new URL(dataSource.config.url!)
					urlObj.pathname = `/${actualDbName}` // Đổi đuôi URL thành tên DB mới
					config = { connectionString: urlObj.toString() }
				} else {
					config = {
						host: dataSource.config.host,
						port: dataSource.config.port,
						database: actualDbName,
						user: dataSource.config.username,
						password: password,
					}
				}

				const isLocal =
					(dataSource.config.host &&
						['localhost', '127.0.0.1'].includes(
							dataSource.config.host,
						)) ||
					(dataSource.config.url &&
						(dataSource.config.url.includes('localhost') ||
							dataSource.config.url.includes('127.0.0.1')))

				const pgPool = new PgPool({
					...config,
					max: 5,
					ssl: isLocal ? false : { rejectUnauthorized: false },
				})

				adapter = new PostgreSQLAdapter(pgPool)
				break
			}

			case 'mysql': {
				const config =
					dataSource.config.method === 'url' ?
						{ uri: dataSource.config.url }
					:	{
							host: dataSource.config.host,
							port: dataSource.config.port,
							database: actualDbName,
							user: dataSource.config.username,
							password: password,
						}
				const mysqlPool = mysql.createPool({
					...config,
					connectionLimit: 5,
				})

				adapter = new MySQLAdapter(mysqlPool)
				break
			}

			default:
				throw new Error(
					`Loại database ${dataSource.type} chưa được hỗ trợ`,
				)
		}

		this.cache.set(cacheKey, adapter)
		return adapter
	}

	public removeConnection(dataSourceId: string) {
		this.cache.delete(dataSourceId)
	}
}

export const connectionManager = new ConnectionManager()
