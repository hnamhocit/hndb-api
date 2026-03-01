import express from 'express'

import { databasesController } from '../controllers'
import { injectDbClient, requestLimiter } from '../middlewares'

const router = express.Router({ mergeParams: true })

router.get('/', injectDbClient, databasesController.getDatabases)

router.post(
	'/:db/query',
	injectDbClient,
	requestLimiter,
	databasesController.newQuery,
)

router.get('/:db/schema', injectDbClient, databasesController.getSchema)

router.post(
	'/:db/tables/:table/query/plan',
	injectDbClient,
	databasesController.queryPlan,
)

router.get(
	'/:db/tables/:table/preview',
	injectDbClient,
	databasesController.getTablePreview,
)

router.get(
	'/:db/tables/:table/relationships',
	injectDbClient,
	databasesController.getTableRelationships,
)

export default router
