import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!
const ALGORITHM = 'aes-256-gcm'

export function encryptPassword(text: string): string {
	const iv = crypto.randomBytes(16)
	const cipher = crypto.createCipheriv(
		ALGORITHM,
		Buffer.from(ENCRYPTION_KEY, 'hex'),
		iv,
	)

	let encrypted = cipher.update(text, 'utf8', 'hex')
	encrypted += cipher.final('hex')

	const authTag = cipher.getAuthTag().toString('hex')

	// Lưu theo format: iv:authTag:encryptedText để sau này giải mã
	return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptPassword(text: string): string {
	const [ivHex, authTagHex, encryptedHex] = text.split(':')

	const decipher = crypto.createDecipheriv(
		ALGORITHM,
		Buffer.from(ENCRYPTION_KEY, 'hex'),
		Buffer.from(ivHex, 'hex'),
	)

	decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

	let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
	decrypted += decipher.final('utf8')

	return decrypted
}
