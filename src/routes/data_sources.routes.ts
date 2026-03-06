import express from 'express'

import { dataSourcesController } from '../controllers'
import { injectDbClient, requestLimiter } from '../middlewares'
import databasesRoutes from './databases.routes'

const router = express.Router()

router.post(
	'/test-connection',
	requestLimiter,
	dataSourcesController.testConnection,
)

router.post('/new', requestLimiter, dataSourcesController.addDataSource)

router.get('/stream-status', dataSourcesController.streamStatus)

router.post('/bulk-status', dataSourcesController.getBulkStatus)

router.get('/:dataSourceId/disconnect', dataSourcesController.disconnect)
router.get(
	'/:dataSourceId/reconnect',
	injectDbClient,
	dataSourcesController.reconnect,
)

router.post(
	'/:dataSourceId/query',
	injectDbClient,
	dataSourcesController.runQuery,
)

router.get(
	'/:dataSourceId/query/plan',
	injectDbClient,
	dataSourcesController.queryPlan,
)

// databases
router.use('/:dataSourceId/databases', databasesRoutes)

export default router
