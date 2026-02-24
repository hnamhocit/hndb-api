import cors from 'cors'
import express, { Express } from 'express'
import helmet from 'helmet'

export const setupMiddlewares = (app: Express) => {
	app.use(helmet({ contentSecurityPolicy: false }))
	app.use(cors())
	app.use(express.json({ limit: '1mb' }))
}
