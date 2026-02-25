import { Request, Response } from 'express'
import { Client } from 'pg'
import { systemPool } from '../database'
import { encryptPassword } from '../utils'

class DataSourcesController {
	async testConnection(req: Request, res: Response) {
		const {
			type,
			method,
			username,
			password,
			host,
			port,
			database_name,
			url,
		} = req.body

		if (type !== 'postgresql') {
			return res.status(400).json({
				ok: false,
				error: 'Tính năng test hiện chỉ hỗ trợ PostgreSQL',
			})
		}

		let clientConfig = {}

		if (method === 'url') {
			if (!url)
				return res
					.status(400)
					.json({ ok: false, error: 'Thiếu đường dẫn URL' })
			clientConfig = { connectionString: url }
		} else if (method === 'host') {
			if (!host || !port || !database_name || !username) {
				return res.status(400).json({
					ok: false,
					error: 'Thiếu thông tin kết nối host/port/database/username',
				})
			}
			clientConfig = {
				host,
				port,
				database: database_name,
				user: username,
				password: password || undefined,
				ssl: { rejectUnauthorized: false }, // Rất cần thiết nếu test với DB trên cloud (Supabase/Neon/Render)
			}
		} else {
			return res
				.status(400)
				.json({ ok: false, error: 'Phương thức kết nối không hợp lệ' })
		}

		const client = new Client(clientConfig)

		try {
			await client.connect()

			await client.query('SELECT 1 AS test_connection')

			await client.end()

			res.json({ ok: true, message: 'Connected successfully' })
		} catch (error: any) {
			try {
				await client.end()
			} catch (e) {}

			console.error('Test connection error:', error)
			res.status(400).json({
				ok: false,
				error: 'Connect failed. Please verify your connection details and try again.',
				details: error.message,
			})
		}
	}

	async addDataSource(req: Request, res: Response) {
		const {
			type,
			method,
			username,
			password,
			savePassword,
			showAllDatabases,
			userId,
			...rest
		} = req.body

		if (!type || !method || !username) {
			return res
				.status(400)
				.json({ ok: false, error: 'Missing base infomation fields' })
		}

		const host = rest.host || null
		const port = rest.port || null
		const database_name = rest.database_name || null
		const url = rest.url || null

		if (method === 'host' && (!host || !port || !database_name)) {
			return res
				.status(400)
				.json({ ok: false, error: 'Thiếu thông tin kết nối host' })
		}
		if (method === 'url' && !url) {
			return res
				.status(400)
				.json({ ok: false, error: 'Thiếu thông tin đường dẫn URL' })
		}

		try {
			let encryptedPassword = null
			if (password && savePassword) {
				encryptedPassword = encryptPassword(password)
			}

			const result = await systemPool.query(
				`
    INSERT INTO data_sources (
        type, method, username, password,
        save_password, show_all_databases,
        host, port, database_name, url, user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)

    RETURNING *;
    `,
				[
					type, // $1
					method, // $2
					username, // $3
					encryptedPassword, // $4
					savePassword || false, // $5
					showAllDatabases || false, // $6
					host, // $7
					port, // $8
					database_name, // $9
					url, // $10
					userId, // $11
				],
			)

			const newDataSource = result.rows[0]

			res.json({ ok: true, data: newDataSource })
		} catch (error) {
			console.error('Lỗi khi thêm data source:', error)
			res.status(500).json({
				ok: false,
				error: 'Không thể thêm data source',
			})
		}
	}
}

export const dataSourcesController = new DataSourcesController()
