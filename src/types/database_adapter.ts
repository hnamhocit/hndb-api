import { QueryResult } from './query_result'

export interface ColumnInfo {
	column_name: string
	data_type: string
	is_nullable: boolean
	column_default: string | null

	is_primary: boolean
	is_foreign_key: boolean
	is_unique: boolean
	is_indexed: boolean
}

export interface Relationship {
	source_table: string
	source_column: string
	target_table: string
	target_column: string
}

export type DatabaseSchema = Record<string, ColumnInfo[]>

export interface DatabaseAdapter {
	listDatabases(): Promise<string[]>
	getTableRelationships(
		tableName: string,
		databaseName: string | null,
	): Promise<Relationship[]>
	getSchema(databaseName?: string): Promise<DatabaseSchema>
	executeRawQuery(sql: string, maxRows?: number): Promise<QueryResult>
	close(): Promise<void>
}
