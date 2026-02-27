export interface QueryResult {
	rows: any[]
	durationMs: number
	isLimited: boolean
	affectedRows?: number
	command?: string
}
