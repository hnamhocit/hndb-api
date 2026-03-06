import sql from 'mssql'

import { constants } from '../../constants'
import {
	DatabaseAdapter,
	DatabaseQueryPlan,
	DatabaseSchema,
	IQueryResult,
	Relationship,
} from '../../types'

export class SqlServerAdapter implements DatabaseAdapter {
	constructor(private pool: sql.ConnectionPool) {}

	async listDatabases(showAllDatabase: boolean): Promise<string[]> {
		const result = await this.pool
			.request()
			.query('SELECT name FROM sys.databases WHERE state = 0')
		const dbs = result.recordset.map((r) => r.name)

		if (!showAllDatabase) {
			const systemDbs = ['master', 'tempdb', 'model', 'msdb']
			return dbs.filter((db) => !systemDbs.includes(db))
		}
		return dbs
	}

	async getTableRelationships(
		tableName: string,
		databaseName: string | null,
	): Promise<Relationship[]> {
		const query = `
            SELECT
                tp.name AS source_table,
                cp.name AS source_column,
                tr.name AS target_table,
                cr.name AS target_column
            FROM sys.foreign_keys fk
            INNER JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
            INNER JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
            INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
            INNER JOIN sys.columns cp ON fkc.parent_column_id = cp.column_id AND fkc.parent_object_id = cp.object_id
            INNER JOIN sys.columns cr ON fkc.referenced_column_id = cr.column_id AND fkc.referenced_object_id = cr.object_id
            WHERE tp.name = @tableName OR tr.name = @tableName;
        `
		const request = this.pool.request()
		request.input('tableName', sql.NVarChar, tableName)
		const result = await request.query(query)
		return result.recordset as Relationship[]
	}

	async getSchema(databaseName?: string): Promise<DatabaseSchema> {
		// SQL Server có thể cần chỉ định 'USE databaseName' trước,
		// nhưng mặc định pool đã connect đúng DB
		const query = `
            SELECT
                c.TABLE_NAME AS table_name,
                c.COLUMN_NAME AS column_name,
                c.DATA_TYPE AS data_type,
                CAST(CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS BIT) AS is_nullable,
                c.COLUMN_DEFAULT AS column_default,
                CAST(ISNULL(pk.is_primary, 0) AS BIT) AS is_primary,
                CAST(ISNULL(fk.is_foreign_key, 0) AS BIT) AS is_foreign_key
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_NAME, ku.COLUMN_NAME, 1 AS is_primary
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
                SELECT ku.TABLE_NAME, ku.COLUMN_NAME, 1 AS is_foreign_key
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            ) fk ON c.TABLE_NAME = fk.TABLE_NAME AND c.COLUMN_NAME = fk.COLUMN_NAME
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
        `
		const result = await this.pool.request().query(query)

		return result.recordset.reduce((acc, row) => {
			const { table_name, ...columnInfo } = row
			if (!acc[table_name]) acc[table_name] = []
			acc[table_name].push({
				column_name: columnInfo.column_name,
				data_type: columnInfo.data_type,
				is_nullable: columnInfo.is_nullable,
				column_default: columnInfo.column_default,
				is_primary: columnInfo.is_primary,
				is_foreign_key: columnInfo.is_foreign_key,
				is_unique: false, // SQL Server cần query index phức tạp hơn, tạm set false
				is_indexed: false,
			})
			return acc
		}, {} as DatabaseSchema)
	}

	async queryPlan(
		sqlQuery: string,
		isAlreadyExplain: boolean,
	): Promise<DatabaseQueryPlan> {
		if (isAlreadyExplain) {
			const res = await this.pool.request().query(sqlQuery)
			return res.recordset
		}

		// T-SQL sử dụng SET SHOWPLAN_ALL ON để lấy query plan
		const request = this.pool.request()
		await request.query('SET SHOWPLAN_ALL ON')
		const result = await request.query(sqlQuery)
		await request.query('SET SHOWPLAN_ALL OFF')

		return result.recordset
	}

	async executeRawQuery(
		sqlQuery: string,
		maxRows: number = constants.MAX_ROWS,
	): Promise<IQueryResult> {
		const startTime = process.hrtime.bigint()
		const isReadQuery = /^\s*(SELECT|SHOW|EXPLAIN|EXEC)/i.test(sqlQuery)

		return new Promise((resolve, reject) => {
			const request = this.pool.request()
			request.stream = true

			const rows: any[] = []
			let isLimited = false

			// Dùng setTimeout của Node.js để ép buộc hủy request nếu chạy quá lâu
			const timeoutTimer = setTimeout(() => {
				request.cancel()
			}, constants.QUERY_TIMEOUT_MS)

			request.query(sqlQuery)

			request.on('row', (row) => {
				if (rows.length < maxRows) rows.push(row)
				else {
					isLimited = true
					request.cancel() // Hủy stream khi đã lấy đủ số dòng
				}
			})

			request.on('error', (err) => {
				clearTimeout(timeoutTimer) // Xóa timer nếu có lỗi

				// Nếu lỗi là do chúng ta chủ động cancel (hoặc do timeout)
				if (err.message.includes('Canceled')) {
					const durationMs =
						Number(process.hrtime.bigint() - startTime) / 1_000_000
					return resolve({
						rows,
						durationMs,
						isLimited,
						command: isReadQuery ? 'SELECT' : 'MUTATION',
						affectedRows: rows.length,
					})
				}
				reject(err)
			})

			request.on('done', (result) => {
				clearTimeout(timeoutTimer) // Xóa timer khi query hoàn thành thành công

				const durationMs =
					Number(process.hrtime.bigint() - startTime) / 1_000_000
				resolve({
					rows,
					durationMs,
					isLimited,
					command: isReadQuery ? 'SELECT' : 'MUTATION',
					affectedRows: result.rowsAffected[0] || rows.length,
				})
			})
		})
	}

	async close() {
		await this.pool.close()
	}
}
