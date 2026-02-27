import express from 'express'

import { dataSourcesController } from '../controllers'
import { requestLimiter } from '../middlewares'
import databasesRoutes from './databases.routes'

const router = express.Router()

router.post(
	'/test-connection',
	requestLimiter,
	dataSourcesController.testConnection,
)

router.post('/new', requestLimiter, dataSourcesController.addDataSource)

router.use('/:dataSourceId/databases', databasesRoutes)

export default router
