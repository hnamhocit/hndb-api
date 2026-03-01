export interface IQueryResult {
	rows: any[]
	durationMs: number
	isLimited: boolean
	affectedRows: number | null
	command: string | null
}
