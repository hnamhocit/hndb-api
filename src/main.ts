import 'dotenv/config'
import express from 'express'

import { checkSupabaseHealth } from './database'
import { setupMiddlewares } from './middlewares'
import routes from './routes'

const app = express()

setupMiddlewares(app)

app.use('/', routes)

app.get('/health', async (req, res) => {
	await checkSupabaseHealth()

	res.json({ ok: true, message: 'Server is healthy' })
})

const PORT = Number(process.env.PORT || '8080')

app.listen(PORT, async () => {
	console.log(`🚀 Server is running on port ${PORT}`)
})
