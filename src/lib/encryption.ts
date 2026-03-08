import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, Buffer.from(secret, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored: string, secret: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted value format — expected iv:authTag:ciphertext')
  }
  const [ivHex, tagHex, ciphertextHex] = parts
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(secret, 'hex'), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(ciphertextHex, 'hex', 'utf8') + decipher.final('utf8')
}
