import Database from 'better-sqlite3'

import { constants } from '../../constants'
import {
	DatabaseAdapter,
	DatabaseQueryPlan,
	DatabaseSchema,
	IQueryResult,
	Relationship,
} from '../../types'

export class SqliteAdapter implements DatabaseAdapter {
	constructor(private db: Database.Database) {}

	async listDatabases(showAllDatabase: boolean): Promise<string[]> {
		// SQLite lưu dữ liệu trong 1 file, nên thường chỉ có database mặc định là 'main'
		return ['main']
	}

	async getTableRelationships(
		tableName: string,
		databaseName: string | null,
	): Promise<Relationship[]> {
		const stmt = this.db.prepare(`PRAGMA foreign_key_list("${tableName}");`)
		const fks = stmt.all() as any[]

		return fks.map((fk) => ({
			source_table: tableName,
			source_column: fk.from,
			target_table: fk.table,
			target_column: fk.to,
		}))
	}

	async getSchema(databaseName?: string): Promise<DatabaseSchema> {
		const tablesStmt = this.db.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
		)
		const tables = tablesStmt.all() as { name: string }[]
		const schema: DatabaseSchema = {}

		for (const table of tables) {
			const colsStmt = this.db.prepare(
				`PRAGMA table_info("${table.name}");`,
			)
			const fksStmt = this.db.prepare(
				`PRAGMA foreign_key_list("${table.name}");`,
			)

			const columns = colsStmt.all() as any[]
			const fks = fksStmt.all() as any[]

			const fkColNames = fks.map((f) => f.from)

			schema[table.name] = columns.map((col) => ({
				column_name: col.name,
				data_type: col.type,
				is_nullable: col.notnull === 0,
				column_default: col.dflt_value,
				is_primary: col.pk > 0,
				is_foreign_key: fkColNames.includes(col.name),
				is_unique: false, // Cần query PRAGMA index_list phức tạp hơn
				is_indexed: false,
			}))
		}

		return schema
	}

	async queryPlan(
		sql: string,
		isAlreadyExplain: boolean,
	): Promise<DatabaseQueryPlan> {
		const planSql = isAlreadyExplain ? sql : `EXPLAIN QUERY PLAN ${sql}`
		const stmt = this.db.prepare(planSql)
		return stmt.all() as DatabaseQueryPlan
	}

	async executeRawQuery(
		sql: string,
		maxRows: number = constants.MAX_ROWS,
	): Promise<IQueryResult> {
		const startTime = process.hrtime.bigint()
		const isReadQuery = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql)

		try {
			if (isReadQuery) {
				const stmt = this.db.prepare(sql)
				const rows: any[] = []
				let isLimited = false

				// Dùng iterator để ngừng lấy dữ liệu sớm nếu vượt quá maxRows
				for (const row of stmt.iterate()) {
					if (rows.length < maxRows) {
						rows.push(row)
					} else {
						isLimited = true
						break
					}
				}

				const durationMs =
					Number(process.hrtime.bigint() - startTime) / 1_000_000
				return {
					rows,
					durationMs,
					isLimited,
					command: 'SELECT',
					affectedRows: rows.length,
				}
			} else {
				const stmt = this.db.prepare(sql)
				const info = stmt.run()
				const durationMs =
					Number(process.hrtime.bigint() - startTime) / 1_000_000

				return {
					rows: [],
					durationMs,
					isLimited: false,
					affectedRows: info.changes,
					command: 'MUTATION',
				}
			}
		} catch (error) {
			throw error
		}
	}

	async close() {
		this.db.close()
	}
}
