import { IColumn } from './column'
import { DatabaseQueryPlan } from './query_plan'
import { IQueryResult } from './query_result'

export interface Relationship {
	source_table: string
	source_column: string
	target_table: string
	target_column: string
}

export type DatabaseSchema = Record<string, IColumn[]>

export interface DatabaseAdapter {
	listDatabases(): Promise<string[]>
	getTableRelationships(
		tableName: string,
		databaseName: string | null,
	): Promise<Relationship[]>
	getSchema(databaseName?: string): Promise<DatabaseSchema>
	executeRawQuery(sql: string, maxRows?: number): Promise<IQueryResult>
	queryPlan(
		sql: string,
		isAlreadyExplain: boolean,
	): Promise<DatabaseQueryPlan>
	close(): Promise<void>
}
