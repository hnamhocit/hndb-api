import express from 'express'

import { databasesController } from '../controllers'
import { injectDbClient } from '../middlewares'

const router = express.Router({ mergeParams: true })

router.get('/', injectDbClient, databasesController.getDatabases)

router.get('/:db/schema', injectDbClient, databasesController.getSchema)

router.get(
	'/:db/tables/:table/preview',
	injectDbClient,
	databasesController.getTablePreview,
)

router.post('/:db/query/plan', injectDbClient, databasesController.queryPlan)

router.get(
	'/:db/tables/:table/relationships',
	injectDbClient,
	databasesController.getTableRelationships,
)

export default router
