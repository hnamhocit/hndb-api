import { parse } from 'pgsql-ast-parser'

export function checkDangerousQuery(sql: string) {
	const ast = parse(sql)

	for (const statement of ast) {
		const stmtType = statement.type as string

		if (
			stmtType === 'drop database' ||
			stmtType === 'drop table' ||
			stmtType === 'truncate table'
		) {
			return 'DANGEROUS_DROP'
		}

		if (statement.type === 'delete' || statement.type === 'update') {
			if (!statement.where) {
				return 'DANGEROUS_NO_WHERE'
			}
		}
	}

	return 'SAFE'
}
