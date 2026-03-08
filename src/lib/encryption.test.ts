import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'

import { decrypt, encrypt } from './encryption'

const TEST_KEY = randomBytes(32).toString('hex') // 64-char hex string
const WRONG_KEY = randomBytes(32).toString('hex')

describe('encryption', () => {
  it('should round-trip encrypt and decrypt', () => {
    const plaintext = 'my-secret-api-key-12345'
    const encrypted = encrypt(plaintext, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(plaintext)
  })

  it('should produce different ciphertext for same input (random IV)', () => {
    const plaintext = 'same-api-key'
    const encrypted1 = encrypt(plaintext, TEST_KEY)
    const encrypted2 = encrypt(plaintext, TEST_KEY)
    expect(encrypted1).not.toBe(encrypted2)

    // Both should decrypt to the same value
    expect(decrypt(encrypted1, TEST_KEY)).toBe(plaintext)
    expect(decrypt(encrypted2, TEST_KEY)).toBe(plaintext)
  })

  it('should throw with wrong decryption key', () => {
    const plaintext = 'secret-key'
    const encrypted = encrypt(plaintext, TEST_KEY)
    expect(() => decrypt(encrypted, WRONG_KEY)).toThrow()
  })

  it('should throw with tampered ciphertext', () => {
    const plaintext = 'secret-key'
    const encrypted = encrypt(plaintext, TEST_KEY)
    const parts = encrypted.split(':')
    // Tamper with the ciphertext portion
    parts[2] = 'ff' + parts[2].slice(2)
    const tampered = parts.join(':')
    expect(() => decrypt(tampered, TEST_KEY)).toThrow()
  })

  it('should handle empty string', () => {
    const encrypted = encrypt('', TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe('')
  })

  it('should produce iv:tag:ciphertext format', () => {
    const encrypted = encrypt('test', TEST_KEY)
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // IV is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32)
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32)
    // Ciphertext length varies
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it('should handle unicode text', () => {
    const plaintext = 'api-key-with-unicode-\u00e9\u00e8\u00ea'
    const encrypted = encrypt(plaintext, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(plaintext)
  })

  it('should handle long API keys', () => {
    const plaintext = 'sk_live_' + 'a'.repeat(200)
    const encrypted = encrypt(plaintext, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(plaintext)
  })
})
