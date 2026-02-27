import { Request, Response } from 'express'

import { checkDangerousQuery } from '../utils'

class DatabasesController {
	async getDatabases(req: Request, res: Response) {
		try {
			const databases = await req.dbClient.listDatabases()

			res.json({ ok: true, data: databases })
		} catch (error) {
			console.error('Error listing databases:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to list databases',
			})
		}
	}

	async newQuery(req: Request, res: Response) {
		const { query } = req.body

		if (typeof query !== 'string' || query.trim() === '') {
			return res
				.status(400)
				.json({ ok: false, error: 'Query is required' })
		}

		let dangerousCheckResult = checkDangerousQuery(query)
		if (dangerousCheckResult !== 'SAFE') {
			return res.status(400).json({
				ok: false,
				error: 'Dangerous query detected: ' + dangerousCheckResult,
			})
		}

		try {
			const result = await req.dbClient.executeRawQuery(query)

			res.json({ ok: true, data: result })
		} catch (error: any) {
			if (!res.headersSent) {
				console.error('Error executing query:', error)
				res.status(500).json({
					ok: false,
					error: error.message || 'Failed to execute query',
				})
			}
		}
	}

	async getSchema(req: Request, res: Response) {
		const db = req.params.db as string

		try {
			const schema = await req.dbClient.getSchema(db)

			res.json({ ok: true, data: schema })
		} catch (error) {
			console.error('Error getting schema:', error)
			res.status(500).json({ ok: false, error: 'Failed to get schema' })
		}
	}

	async getTablePreview(req: Request, res: Response) {
		const { db, table } = req.params

		if (typeof db !== 'string' || db.trim() === '') {
			return res
				.status(400)
				.json({ ok: false, error: 'Database name is required' })
		}

		if (typeof table !== 'string' || table.trim() === '') {
			return res
				.status(400)
				.json({ ok: false, error: 'Table name is required' })
		}

		const { page = 1, limit = 200 } = req.query
		const offset = (Number(page) - 1) * Number(limit)

		try {
			const result = await req.dbClient.executeRawQuery(
				`SELECT * FROM ${table} LIMIT ${limit} OFFSET ${offset}`,
			)

			const jsonString = JSON.stringify(result)

			const sizeBytes = Buffer.byteLength(jsonString, 'utf8')

			res.json({
				ok: true,
				data: { ...result, sizeBytes },
			})
		} catch (error) {
			console.error('Error querying table:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to query table',
			})
		}
	}
}

export const databasesController = new DatabasesController()
