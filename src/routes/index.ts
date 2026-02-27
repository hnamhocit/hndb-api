import express from 'express'

import dataSourcesRouter from './data_sources.routes'

const router = express.Router()

router.use('/data_sources', dataSourcesRouter)

export default router
