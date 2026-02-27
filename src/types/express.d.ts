import { DatabaseAdapter } from '../types'

declare global {
	namespace Express {
		interface Request {
			dbClient: DatabaseAdapter
		}
	}
}
