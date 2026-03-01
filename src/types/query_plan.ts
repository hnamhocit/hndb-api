export interface PostgresPlanNode {
	'Node Type': string // Vd: "Seq Scan", "Hash Join", "Sort"...
	'Relation Name'?: string // Tên bảng đang thao tác
	Alias?: string
	'Startup Cost': number
	'Total Cost': number
	'Plan Rows': number
	'Plan Width': number
	Filter?: string // Điều kiện WHERE
	'Join Type'?: string // INNER, LEFT...
	'Hash Cond'?: string
	Plans?: PostgresPlanNode[] // 🔴 Đệ quy: Các node con bên trong
	[key: string]: any // Catch-all cho các field dynamic khác
}

export type PostgresQueryPlan = {
	Plan: PostgresPlanNode
}[]

export interface MySQLCostInfo {
	query_cost?: string
	read_cost?: string
	eval_cost?: string
	prefix_cost?: string
	data_read_per_join?: string
	[key: string]: any
}

export interface MySQLTablePlan {
	table_name: string
	access_type: string // Vd: "ALL" (Full scan), "ref" (Index scan)...
	possible_keys?: string[] // Các index có thể dùng
	key?: string // Index thực tế được chọn
	key_length?: string
	rows_examined_per_scan?: number
	rows_produced_per_join?: number
	filtered?: string // Tỷ lệ % lọc được
	cost_info?: MySQLCostInfo
	used_columns?: string[]
	attached_condition?: string // Điều kiện WHERE
	[key: string]: any
}

export interface MySQLQueryBlock {
	select_id: number
	cost_info?: MySQLCostInfo
	table?: MySQLTablePlan // Khi query 1 bảng
	nested_loop?: { table: MySQLTablePlan }[] // Khi query có JOIN nhiều bảng
	[key: string]: any
}

// Kiểu trả về cuối cùng của MySQL
export interface MySQLQueryPlan {
	query_block: MySQLQueryBlock
}

export type DatabaseQueryPlan = PostgresQueryPlan | MySQLQueryPlan | null

export interface IQueryPlan {
	durationMs: number
	plan: DatabaseQueryPlan
}
