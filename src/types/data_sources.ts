import { IDocument } from './document'

type DataSourceType = 'postgresql' | 'mysql' | 'sqlite' | 'sql-server'

export interface IDataSourceConfig {
	method: 'host' | 'url'
	savePassword?: boolean
	showAllDatabases?: boolean

	// Dành cho method 'host'
	host?: string
	port?: number
	database_name?: string
	username?: string
	password?: string

	// Dành cho method 'url'
	url?: string
}

export interface IDataSource extends IDocument {
	user_id: string
	name: string
	type: DataSourceType
	config: IDataSourceConfig
}
