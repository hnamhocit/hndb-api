import 'dotenv/config'
import express from 'express'

import { checkSystemPoolHealth } from './database'
import { setupMiddlewares } from './middlewares'
import routes from './routes'

const app = express()

setupMiddlewares(app)

app.use('/api', routes)

const PORT = Number(process.env.PORT || '8080')

app.listen(PORT, async () => {
	console.log(`🚀 Server is running on port ${PORT}`)

	await checkSystemPoolHealth()
})
