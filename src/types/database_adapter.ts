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
	foreign_key_target: string | null
}

export type DatabaseSchema = Record<string, ColumnInfo[]>

export interface DatabaseAdapter {
	listDatabases(): Promise<string[]>
	getSchema(databaseName?: string): Promise<DatabaseSchema>
	executeRawQuery(sql: string, maxRows?: number): Promise<QueryResult>
	close(): Promise<void>
}
