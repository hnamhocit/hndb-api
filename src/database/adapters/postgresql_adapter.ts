import { Pool } from 'pg'
import QueryStream from 'pg-query-stream'

import { constants } from '../../constants'
import { DatabaseAdapter, DatabaseSchema } from '../../types'

export class PostgreSQLAdapter implements DatabaseAdapter {
	constructor(private pool: Pool) {}

	async listDatabases(): Promise<string[]> {
		const sql =
			'SELECT datname FROM pg_database WHERE datistemplate = false;'
		const r = await this.pool.query(sql)
		return r.rows.map((row) => row.datname)
	}

	async getSchema(databaseName?: string): Promise<DatabaseSchema> {
		const sql = `
SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    NOT a.attnotnull AS is_nullable,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,

    -- Check Primary Key
    COALESCE((SELECT indisprimary FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey) LIMIT 1), false) AS is_primary,

    -- Check Unique
    COALESCE((SELECT indisunique FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey) LIMIT 1), false) AS is_unique,

    -- Check Index (Nếu có nằm trong bất kỳ index nào)
    EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey)) AS is_indexed,

    -- Check Foreign Key
    EXISTS(SELECT 1 FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)) AS is_foreign_key,

    -- Lấy thông tin Bảng & Cột mà Foreign Key trỏ tới (vd: users.id)
    (SELECT fcls.relname || '.' || fa.attname
     FROM pg_constraint con
     JOIN pg_class fcls ON fcls.oid = con.confrelid
     JOIN pg_attribute fa ON fa.attnum = ANY(con.confkey) AND fa.attrelid = con.confrelid
     WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)
     LIMIT 1) AS foreign_key_target

FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;
        `

		const result = await this.pool.query(sql)

		// Group by table cực kỳ gọn gàng
		const schema: DatabaseSchema = result.rows.reduce((acc, row) => {
			const { table_name, ...columnInfo } = row
			if (!acc[table_name]) acc[table_name] = []

			acc[table_name].push({
				column_name: columnInfo.column_name,
				data_type: columnInfo.data_type,
				is_nullable: columnInfo.is_nullable,
				column_default: columnInfo.column_default,

				is_primary: columnInfo.is_primary,
				is_foreign_key: columnInfo.is_foreign_key,
				is_unique: columnInfo.is_unique,
				is_indexed: columnInfo.is_indexed,
				foreign_key_target: columnInfo.foreign_key_target,
			})

			return acc
		}, {} as DatabaseSchema)

		return schema
	}

	async executeRawQuery(
		sql: string,
		maxRows: number = constants.MAX_ROWS,
	): Promise<any> {
		const startTime = process.hrtime.bigint()
		const client = await this.pool.connect()

		try {
			await client.query(
				`SET statement_timeout = ${constants.QUERY_TIMEOUT_MS}`,
			)

			// Kiểm tra xem đây là truy vấn Đọc (SELECT) hay Ghi (UPDATE/DELETE...)
			const isReadQuery = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE)/i.test(sql)

			if (isReadQuery) {
				return await new Promise((resolve, reject) => {
					const rows: any[] = []
					let isLimited = false
					const stream = client.query(new QueryStream(sql))

					stream.on('data', (row) => {
						if (rows.length < maxRows) rows.push(row)
						else {
							isLimited = true
							stream.destroy()
						}
					})
					stream.on('error', (err) => reject(err))
					stream.on('end', () => {
						const durationMs =
							Number(process.hrtime.bigint() - startTime) /
							1_000_000
						resolve({
							rows,
							durationMs,
							isLimited,
							command: 'SELECT',
						})
					})
					stream.on('close', () => {
						if (isLimited) {
							const durationMs =
								Number(process.hrtime.bigint() - startTime) /
								1_000_000
							resolve({
								rows,
								durationMs,
								isLimited,
								command: 'SELECT',
							})
						}
					})
				})
			} else {
				const result = await client.query(sql)
				const durationMs =
					Number(process.hrtime.bigint() - startTime) / 1_000_000

				return {
					rows: result.rows || [],
					durationMs,
					isLimited: false,
					affectedRows: result.rowCount,
					command: result.command,
				}
			}
		} finally {
			client.release()
		}
	}

	async close() {
		await this.pool.end()
	}
}
