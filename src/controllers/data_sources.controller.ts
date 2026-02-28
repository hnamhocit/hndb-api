import { Request, Response } from 'express'

import { supabase } from '../database'
import { encryptPassword } from '../utils'

class DataSourcesController {
	async testConnection(req: Request, res: Response) {
		try {
			await req.dbClient.executeRawQuery('SELECT 1 AS test_connection')

			res.json({ ok: true, message: 'Connected successfully' })
		} catch (error: any) {
			console.error('Test connection error:', error)
			res.status(400).json({
				ok: false,
				error: 'Connect failed. Please verify your connection details and try again.',
				details: error.message,
			})
		}
	}

	async addDataSource(req: Request, res: Response) {
		const { type, userId, ...config } = req.body

		if (!type || !userId) {
			return res.status(400).json({
				ok: false,
				error: 'Missing required fields: type or userId',
			})
		}

		if (config.method === 'url' && !config.url) {
			return res
				.status(400)
				.json({ ok: false, error: 'Missing URL configuration' })
		}
		if (
			config.method === 'host' &&
			type !== 'sqlite' &&
			(!config.host || !config.port)
		) {
			return res.status(400).json({
				ok: false,
				error: 'Missing host or port configuration',
			})
		}

		try {
			if (config.password) {
				if (config.savePassword) {
					config.password = encryptPassword(config.password)
				} else {
					delete config.password
				}
			}

			delete config.savePassword

			const { data, error } = await supabase
				.from('data_sources')
				.insert([
					{
						type: type,
						user_id: userId,
						config: config,
					},
				])
				.select()
				.single()

			if (error) {
				console.error('Error adding data source:', error.message)

				return res.status(500).json({
					ok: false,
					error: 'Failed to add data source.',
				})
			}

			res.json({ ok: true, data: data })
		} catch (error) {
			console.error('Error adding data source:', error)
			res.status(500).json({
				ok: false,
				error: 'Failed to add data source.',
			})
		}
	}
}

export const dataSourcesController = new DataSourcesController()
