export interface IColumn {
	column_name: string
	data_type: string
	is_nullable: boolean
	column_default: string | null

	is_primary: boolean
	is_foreign_key: boolean
	is_unique: boolean
	is_indexed: boolean
}
