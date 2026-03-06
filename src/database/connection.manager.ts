import Database from 'better-sqlite3'
import { EventEmitter } from 'events'
import { LRUCache } from 'lru-cache'
import sql from 'mssql'
import mysql from 'mysql2'
import { Pool as PgPool } from 'pg'

import { DatabaseAdapter, IDataSource } from '../types'
import { decryptPassword } from '../utils'
import {
	MariaDBAdapter,
	MySQLAdapter,
	PostgreSQLAdapter,
	SqlServerAdapter,
	SqliteAdapter,
} from './adapters'
import { supabase } from './supabase'

class ConnectionManager extends EventEmitter {
	private cache: LRUCache<string, DatabaseAdapter>

	private passwordCache: LRUCache<string, string>

	constructor() {
		super()

		this.cache = new LRUCache<string, DatabaseAdapter>({
			max: 200,
			ttl: 1000 * 60 * 15, // 15 phút

			dispose: (adapter, key) => {
				console.log(`♻️ Disposing connection for Cache Key: ${key}`)

				try {
					adapter.close().catch(console.error)
				} catch (error) {
					console.error(`❌ Lỗi khi đóng connection ${key}:`, error)
				}

				const dataSourceId = key.split('_')[0]
				this.emit('status_changed', {
					id: dataSourceId,
					status: false,
				})
			},
		})

		this.passwordCache = new LRUCache<string, string>({
			max: 200,
			ttl: 1000 * 60 * 15, // 15 phút
		})
	}

	public async getClient(
		dataSourceId: string,
		targetDbName: string | null = null,
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

		return await this.getConnection(data, targetDbName)
	}

	public async getConnection(
		dataSource: IDataSource,
		targetDbName: string | null = null,
		plainPasswordOverride?: string,
	): Promise<DatabaseAdapter> {
		const actualDbName = targetDbName || dataSource.config.database_name
		const cacheKey = `${dataSource.id}_${targetDbName || 'default'}`

		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!
		}

		if (plainPasswordOverride) {
			this.passwordCache.set(dataSource.id, plainPasswordOverride)
		}

		// Ưu tiên 1: Lấy từ tham số truyền vào (khi user vừa nhập form xong)
		// Ưu tiên 2: Lấy từ RAM Cache (khi user nhảy sang DB khác như test-db)
		// Ưu tiên 3: Giải mã từ Database (nếu user có tick "Save Password")
		const password =
			plainPasswordOverride ||
			this.passwordCache.get(dataSource.id) ||
			(dataSource.config.password ?
				decryptPassword(dataSource.config.password)
			:	undefined)

		let adapter: DatabaseAdapter

		const isLocal =
			(dataSource.config.host &&
				['localhost', '127.0.0.1'].includes(dataSource.config.host)) ||
			(dataSource.config.url &&
				(dataSource.config.url.includes('localhost') ||
					dataSource.config.url.includes('127.0.0.1')))

		switch (dataSource.type) {
			case 'postgresql': {
				let config: any = {}

				if (dataSource.config.method === 'url') {
					const urlObj = new URL(dataSource.config.url!)
					if (actualDbName) urlObj.pathname = `/${actualDbName}`
					config = { connectionString: urlObj.toString() }
				} else {
					config = {
						host: dataSource.config.host,
						port: dataSource.config.port,
						database: actualDbName || 'postgres',
						user: dataSource.config.username,
						password: password, // Đã lấy đúng password ở trên
					}
				}

				const pgPool = new PgPool({
					...config,
					max: 5,
					ssl: isLocal ? false : { rejectUnauthorized: false },
				})

				adapter = new PostgreSQLAdapter(pgPool)
				break
			}
			// ... (Tự động áp dụng password cho mysql, sql-server) ...
			case 'mysql':
			case 'maria-db': {
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
					multipleStatements: true,
				})

				adapter =
					dataSource.type === 'maria-db' ?
						new MariaDBAdapter(mysqlPool)
					:	new MySQLAdapter(mysqlPool)
				break
			}
			case 'sql-server': {
				let pool: sql.ConnectionPool

				if (dataSource.config.method === 'url') {
					pool = new sql.ConnectionPool(dataSource.config.url!)
				} else {
					pool = new sql.ConnectionPool({
						user: dataSource.config.username,
						password: password,
						server: dataSource.config.host!,
						port: dataSource.config.port,
						database: actualDbName || 'master',
						pool: { max: 5 },
						options: {
							encrypt: !isLocal,
							trustServerCertificate: true,
						},
					})
				}

				await pool.connect()
				adapter = new SqlServerAdapter(pool)
				break
			}
			case 'sqlite': {
				if (!actualDbName) {
					throw new Error('SQLite requires a valid file path')
				}
				const db = new Database(actualDbName)
				adapter = new SqliteAdapter(db)
				break
			}
			default:
				throw new Error(
					`Loại database ${dataSource.type} chưa được hỗ trợ`,
				)
		}

		this.cache.set(cacheKey, adapter)

		this.emit('status_changed', { id: dataSource.id, status: true })

		return adapter
	}

	public disconnect(dataSourceId: string) {
		const prefix = `${dataSourceId}_`

		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key)
			}
		}
	}

	public isConnected(dataSourceId: string): boolean {
		const prefix = `${dataSourceId}_`

		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				return true
			}
		}
		return false
	}

	public async initializeTemporaryConnection(
		dataSource: IDataSource,
		plainPassword?: string,
	) {
		await this.getConnection(dataSource, null, plainPassword)
	}

	public async reconnect(dataSourceId: string) {
		console.log(`🔄 Reconnecting Data Source: ${dataSourceId}`)
		this.disconnect(dataSourceId)

		await this.getClient(dataSourceId)
	}
}

export const connectionManager = new ConnectionManager()
