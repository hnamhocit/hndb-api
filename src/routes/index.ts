import express from 'express'

import dataSourcesRouter from './data_sources.routes'
import databasesRouter from './databases.routes'

const router = express.Router()

router.use('/data_sources', dataSourcesRouter)
router.use('/databases', databasesRouter)

export default router
