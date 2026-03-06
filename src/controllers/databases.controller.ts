import { Request, Response } from 'express'

class DatabasesController {
	async getDatabases(req: Request, res: Response) {
		try {
			const showAllDatabases = req.query.showAll === 'true'
			const databases = await req.dbClient.listDatabases(showAllDatabases)

			res.json({ ok: true, data: databases })
		} catch (error) {
			console.error('Error listing databases:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to list databases',
			})
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

		try {
			const result = await req.dbClient.executeRawQuery(
				`SELECT * FROM ${table} LIMIT 200`,
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

	async getTableRelationships(req: Request, res: Response) {
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

		try {
			const relationships = await req.dbClient.getTableRelationships(
				table,
				db,
			)

			res.json({ ok: true, data: relationships })
		} catch (error) {
			console.error('Error getting table relationships:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to get table relationships',
			})
		}
	}
}

export const databasesController = new DatabasesController()
