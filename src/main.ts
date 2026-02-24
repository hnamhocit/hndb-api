import 'dotenv/config'
import express from 'express'
import { PoolClient } from 'pg'
import QueryStream from 'pg-query-stream'

import {
	checkSystemPoolHealth,
	getPool,
	MAX_ROWS,
	QUERY_TIMEOUT_MS,
} from './constants'
import { requestLimiter, setupMiddlewares } from './middlewares'
import { checkDangerousQuery } from './utils'

const app = express()

setupMiddlewares(app)

async function getDatabases() {
	const sql = `
    SELECT datname
    FROM pg_database
    WHERE datallowconn = true
        AND NOT datistemplate
    ORDER BY datname;
    `

	const r = await getPool('postgres').query(sql)
	return r.rows.map((row) => row.datname)
}

app.get('/databases', requestLimiter, async (req, res) => {
	try {
		const databases = await getDatabases()
		res.json({ ok: true, data: databases })
	} catch (error) {
		console.error('Error listing databases:', error)
		res.status(500).json({ error: 'Failed to list databases' })
	}
})

app.post('/databases/:db/query', requestLimiter, async (req, res) => {
	const dbName = req.params.db as string
	const { query } = req.body

	if (typeof query !== 'string' || query.trim() === '') {
		return res.status(400).json({ ok: false, error: 'Query is required' })
	}

	let dangerousCheckResult = checkDangerousQuery(query)
	if (dangerousCheckResult !== 'SAFE') {
		return res.status(400).json({
			ok: false,
			error: 'Dangerous query detected: ' + dangerousCheckResult,
		})
	}

	let client: PoolClient | undefined
	try {
		client = await getPool(dbName).connect()
		await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`)

		const queryStream = new QueryStream(query)
		const stream = client.query(queryStream)

		const rows: any[] = []
		let isLimited = false
		let isResponded = false
		const startTime = process.hrtime.bigint()

		const sendResponse = (error?: Error) => {
			if (isResponded) return
			isResponded = true
			client?.release()

			if (error) {
				return res.status(400).json({ ok: false, error: error.message })
			}

			const durationMs =
				Number(process.hrtime.bigint() - startTime) / 1_000_000
			res.json({
				ok: true,
				data: rows,
				meta: {
					fetchedAt: new Date().toISOString(),
					durationMs: Math.round(durationMs * 100) / 100,
					rowCount: rows.length,
					isLimited,
				},
			})
		}

		stream.on('data', (row) => {
			if (rows.length < MAX_ROWS) {
				rows.push(row)
			} else {
				isLimited = true
				stream.destroy()
				sendResponse()
			}
		})

		stream.on('end', () => sendResponse())

		stream.on('error', (err: Error) => sendResponse(err)) // Lỗi từ DB
	} catch (error: any) {
		if (client) client.release()
		if (!res.headersSent) {
			console.error('Error executing query:', error)
			res.status(500).json({
				ok: false,
				error: error.message || 'Failed to execute query',
			})
		}
	}
})

app.get('/databases/:db/schema', requestLimiter, async (req, res) => {
	const dbName = req.params.db as string

	try {
		const sql = `
            SELECT
                c.relname AS table_name,
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                NOT a.attnotnull AS is_nullable,
                pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'  -- ordinary tables only
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY c.relname, a.attnum;
        `

		const result = await getPool(dbName).query(sql)

		// Group by table
		const columnsByTable = result.rows.reduce((acc, row) => {
			const { table_name, ...columnInfo } = row
			if (!acc[table_name]) acc[table_name] = []
			acc[table_name].push(columnInfo)
			return acc
		}, {})

		res.json({ ok: true, data: columnsByTable })
	} catch (error) {
		console.error('Error getting schema:', error)
		res.status(500).json({ ok: false, error: 'Failed to get schema' })
	}
})

app.get(
	'/databases/:db/tables/:table/preview',
	requestLimiter,
	async (req, res) => {
		const { db, table } = req.params
		const { page = 1, limit = 200 } = req.query
		const offset = (Number(page) - 1) * Number(limit)

		const safeTable = `"${(table as string).replace(/"/g, '""')}"`

		const startTime = process.hrtime.bigint()
		const fetchTime = new Date().toISOString()

		try {
			const result = await getPool(db as string).query(
				`SELECT * FROM ${safeTable} LIMIT $1 OFFSET $2`,
				[limit, offset],
			)

			const endTime = process.hrtime.bigint()
			const durationMs = Number(endTime - startTime) / 1_000_000

			res.json({
				ok: true,
				data: result.rows,
				meta: {
					fetchedAt: fetchTime,
					durationMs: Math.round(durationMs * 100) / 100,
					rowCount: result.rowCount,
				},
			})
		} catch (error) {
			console.error('Error querying table:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to query table',
			})
		}
	},
)

const PORT = Number(process.env.PORT || '8080')

app.listen(PORT, async () => {
	console.log(`🚀 Server is running on port ${PORT}`)

	await checkSystemPoolHealth()
})
