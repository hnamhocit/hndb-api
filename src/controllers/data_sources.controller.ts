import Database from 'better-sqlite3'
import { Request, Response } from 'express'
import sql from 'mssql'
import mysql from 'mysql2/promise'
import { Client } from 'pg'

import { supabase } from '../database'
import { encryptPassword } from '../utils'

class DataSourcesController {
	async testConnection(req: Request, res: Response) {
		const {
			type,
			host,
			port,
			username,
			password,
			database_name,
			method,
			url,
		} = req.body

		try {
			// 1. POSTGRESQL
			if (type === 'postgresql') {
				const client = new Client(
					method === 'url' ?
						{ connectionString: url }
					:	{
							host,
							port,
							user: username,
							password,
							database: database_name || 'postgres',
						},
				)
				await client.connect()
				await client.query('SELECT 1 AS test_connection')
				await client.end()
			}

			// 2. MYSQL & MARIADB (Dùng chung driver mysql2)
			else if (type === 'mysql' || type === 'mariadb') {
				const connection = await mysql.createConnection(
					method === 'url' ? url : (
						{
							host,
							port,
							user: username,
							password,
							database: database_name || undefined,
						}
					),
				)
				await connection.execute('SELECT 1 AS test_connection')
				await connection.end()
			}

			// 3. SQL SERVER
			else if (type === 'sql-server') {
				// SQL Server config hơi đặc thù một chút (cần encrypt: true/false tùy server)
				const config = {
					user: username,
					password: password,
					server: host,
					port: port,
					database: database_name || 'master',
					options: {
						encrypt: false, // Thường để false khi test ở localhost/docker
						trustServerCertificate: true,
					},
				}
				const pool = await sql.connect(config)
				await pool.request().query('SELECT 1 AS test_connection')
				await pool.close() // Dọn dẹp!
			}

			// 4. SQLITE
			else if (type === 'sqlite') {
				if (!database_name)
					throw new Error('File path is required for SQLite')

				// Mở kết nối file, readOnly = true cho an toàn khi test
				const db = new Database(database_name, { readonly: true })
				db.prepare('SELECT 1 AS test_connection').get()
				db.close() // Dọn dẹp!
			} else {
				throw new Error(`Unsupported database type: ${type}`)
			}

			res.json({ ok: true, message: 'Connected successfully' })
		} catch (error: any) {
			console.error(`[Test Connection Failed] DB: ${type}`, error.message)
			res.status(400).json({
				ok: false,
				error: 'Connect failed. Please verify your connection details.',
				details: error.message,
			})
		}
	}

	async addDataSource(req: Request, res: Response) {
		const { name, type, userId, ...config } = req.body

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
						name: name,
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
