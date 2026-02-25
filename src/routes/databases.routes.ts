import express from 'express'

import { databasesController } from '../controllers'
import { requestLimiter } from '../middlewares'

const router = express.Router()

router.get('/', databasesController.getDatabases)

router.post('/:db/query', requestLimiter, databasesController.newQuery)

router.get('/:db/schema', databasesController.getSchema)

router.get('/:db/tables/:table/preview', databasesController.getTablePreview)

export default router
