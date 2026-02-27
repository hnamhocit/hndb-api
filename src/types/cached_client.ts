import { Pool as MysqlPool } from 'mysql2/promise'
import { Pool as PgPool } from 'pg'

export type CachedClient =
	| { type: 'postgresql'; instance: PgPool }
	| { type: 'mysql'; instance: MysqlPool }
