import express from 'express'

import { dataSourcesController } from '../controllers'
import { requestLimiter } from '../middlewares'

const router = express.Router()

router.post(
	'/test-connection',
	requestLimiter,
	dataSourcesController.testConnection,
)

router.post('/new', requestLimiter, dataSourcesController.addDataSource)

export default router
