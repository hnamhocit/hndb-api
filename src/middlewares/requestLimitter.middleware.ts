import rateLimit from 'express-rate-limit'

export const requestLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 10,
	message: 'Too many requests',
})
