import { NextFunction, Request, Response } from 'express'

import { connectionManager } from '../database'
import { isValidUUID } from '../utils'

export const injectDbClient = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const dataSourceId = req.params.dataSourceId as string
	const targetDbName =
		((req.body?.database || req.params?.db) as string) || null

	if (!dataSourceId || !isValidUUID(dataSourceId)) {
		return res
			.status(400)
			.json({ ok: false, error: 'Invalid Data Source ID' })
	}

	try {
		req.dbClient = await connectionManager.getClient(
			dataSourceId,
			targetDbName,
		)
		next()
	} catch (error: any) {
		if (error.message === 'DATA_SOURCE_NOT_FOUND') {
			return res
				.status(404)
				.json({ ok: false, error: 'Data Source không tồn tại' })
		}
		res.status(500).json({
			ok: false,
			error: `Lỗi kết nối DB: ${error.message}`,
		})
	}
}
