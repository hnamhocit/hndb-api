import { Pool as RawPool } from 'mysql2'
import { Pool as PromisePool } from 'mysql2/promise'

import { constants } from '../../constants'
import {
	DatabaseAdapter,
	DatabaseQueryPlan,
	DatabaseSchema,
	IQueryResult,
	Relationship,
} from '../../types'

export class MySQLAdapter implements DatabaseAdapter {
	private promisePool: PromisePool

	constructor(private pool: RawPool) {
		this.promisePool = this.pool.promise()
	}

	async listDatabases(): Promise<string[]> {
		const sql = 'SHOW DATABASES;'
		const [rows] = await this.promisePool.query(sql)
		return (rows as any[]).map((row) => row.Database)
	}

	async getTableRelationships(
		tableName: string,
		databaseName: string | null,
	): Promise<Relationship[]> {
		const sql = `
    SELECT
        TABLE_NAME AS source_table,
        COLUMN_NAME AS source_column,
        REFERENCED_TABLE_NAME AS target_table,
        REFERENCED_COLUMN_NAME AS target_column
    FROM
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE
        REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_SCHEMA = ?
        AND (TABLE_NAME = ? OR REFERENCED_TABLE_NAME = ?);
    `

		const [rows] = await this.promisePool.query(sql, [
			databaseName,
			tableName,
			tableName,
		])

		return rows as Relationship[]
	}

	async getSchema(databaseName?: string): Promise<DatabaseSchema> {
		if (!databaseName) {
			throw new Error('MySQL requires databaseName to get schema')
		}

		const sql = `
SELECT
    c.TABLE_NAME AS table_name,
    c.COLUMN_NAME AS column_name,
    c.COLUMN_TYPE AS data_type,
    IF(c.IS_NULLABLE = 'YES', 1, 0) AS is_nullable,
    c.COLUMN_DEFAULT AS column_default,

    -- Check Primary, Unique, Index dựa vào COLUMN_KEY ('PRI', 'UNI', 'MUL')
    IF(c.COLUMN_KEY = 'PRI', 1, 0) AS is_primary,
    IF(c.COLUMN_KEY = 'UNI' OR c.COLUMN_KEY = 'PRI', 1, 0) AS is_unique,
    IF(c.COLUMN_KEY != '', 1, 0) AS is_indexed,

    -- Check Foreign Key (Chỉ lấy cờ boolean để UI hiện icon)
    IF(kcu.REFERENCED_TABLE_NAME IS NOT NULL, 1, 0) AS is_foreign_key

FROM information_schema.COLUMNS c
-- JOIN để kiểm tra Foreign Key
LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND c.TABLE_NAME = kcu.TABLE_NAME
    AND c.COLUMN_NAME = kcu.COLUMN_NAME
    AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
WHERE c.TABLE_SCHEMA = ?
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
    `

		const [rows] = await this.promisePool.query(sql, [databaseName])

		const schema: DatabaseSchema = (rows as any[]).reduce((acc, row) => {
			const { table_name, ...columnInfo } = row
			if (!acc[table_name]) acc[table_name] = []

			acc[table_name].push({
				column_name: columnInfo.column_name,
				data_type: columnInfo.data_type,

				is_nullable: columnInfo.is_nullable === 1,
				column_default: columnInfo.column_default,

				is_primary: columnInfo.is_primary === 1,
				is_foreign_key: columnInfo.is_foreign_key === 1,
				is_unique: columnInfo.is_unique === 1,
				is_indexed: columnInfo.is_indexed === 1,
			})

			return acc
		}, {} as DatabaseSchema)

		return schema
	}

	async queryPlan(
		sql: string,
		isAlreadyExplain: boolean,
	): Promise<DatabaseQueryPlan> {
		const planSql = isAlreadyExplain ? sql : `EXPLAIN FORMAT=JSON ${sql}`

		const [rows] = await this.promisePool.query(planSql)

		// Nếu user tự gõ EXPLAIN (vd: EXPLAIN SELECT...), kết quả trả về là một bảng thô.
		if (isAlreadyExplain) {
			return rows as DatabaseQueryPlan
		}

		// Nếu hệ thống chạy ngầm, MySQL trả về 1 dòng duy nhất có cột tên là 'EXPLAIN' chứa chuỗi JSON
		const explainResult = (rows as any[])[0]

		if (explainResult && explainResult.EXPLAIN) {
			try {
				// Parse chuỗi JSON thành Object để Frontend dễ render
				return JSON.parse(explainResult.EXPLAIN)
			} catch (e) {
				return explainResult.EXPLAIN
			}
		}

		return rows as DatabaseQueryPlan
	}

	async executeRawQuery(
		sql: string,
		maxRows: number = constants.MAX_ROWS,
	): Promise<IQueryResult> {
		const startTime = process.hrtime.bigint()
		const isReadQuery = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE|DESC)/i.test(sql)

		if (isReadQuery) {
			return await new Promise((resolve, reject) => {
				this.pool.getConnection((err, conn) => {
					if (err) return reject(err)

					const cleanup = () => conn.release()

					conn.query(
						`SET SESSION MAX_EXECUTION_TIME = ${constants.QUERY_TIMEOUT_MS}`,
						(setErr) => {
							if (setErr) {
								cleanup()
								return reject(setErr)
							}

							const rows: any[] = []
							let isLimited = false

							const stream = conn.query(sql).stream()

							stream.on('data', (row) => {
								if (rows.length < maxRows) rows.push(row)
								else {
									isLimited = true
									stream.destroy()
								}
							})

							stream.on('error', (streamErr) => {
								cleanup()
								reject(streamErr)
							})

							stream.on('end', () => {
								cleanup()
								const durationMs =
									Number(
										process.hrtime.bigint() - startTime,
									) / 1_000_000
								resolve({
									rows,
									durationMs,
									isLimited,
									command: 'SELECT',
									affectedRows: rows.length,
								})
							})

							stream.on('close', () => {
								if (isLimited) {
									cleanup()
									const durationMs =
										Number(
											process.hrtime.bigint() - startTime,
										) / 1_000_000
									resolve({
										rows,
										durationMs,
										isLimited,
										command: 'SELECT',
										affectedRows: rows.length,
									})
								}
							})
						},
					)
				})
			})
		} else {
			const conn = await this.promisePool.getConnection()

			try {
				await conn.query(
					`SET SESSION MAX_EXECUTION_TIME = ${constants.QUERY_TIMEOUT_MS}`,
				)
				const [result] = await conn.query(sql)
				const durationMs =
					Number(process.hrtime.bigint() - startTime) / 1_000_000

				if (
					result &&
					!Array.isArray(result) &&
					'affectedRows' in result
				) {
					return {
						rows: [],
						durationMs,
						isLimited: false,
						affectedRows: result.affectedRows,
						command: 'MUTATION',
					}
				}

				return {
					rows: Array.isArray(result) ? result : [],
					durationMs,
					isLimited: false,
					affectedRows: Array.isArray(result) ? result.length : 0,
					command: 'UNKNOWN',
				}
			} finally {
				conn.release()
			}
		}
	}

	async close() {
		await this.pool.end()
	}
}
