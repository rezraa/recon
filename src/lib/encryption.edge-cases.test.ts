import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'

import { decrypt, encrypt } from '@/lib/encryption'

const TEST_KEY = randomBytes(32).toString('hex')

describe('encryption — edge cases', () => {
  // decrypt() validates format: requires exactly 3 non-empty colon-separated segments.
  it('[P2] should throw when decrypting malformed string with no colons', () => {
    expect(() => decrypt('notavalidformat', TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting string with only one colon', () => {
    expect(() => decrypt('abc123:def456', TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting string with empty segments', () => {
    expect(() => decrypt('::', TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting with invalid hex in IV', () => {
    const encrypted = encrypt('test', TEST_KEY)
    const parts = encrypted.split(':')
    // Replace IV with non-hex characters
    parts[0] = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
    expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting with completely wrong auth tag', () => {
    const encrypted = encrypt('test', TEST_KEY)
    const parts = encrypted.split(':')
    // Replace auth tag with completely wrong value
    parts[1] = '00'.repeat(16)
    expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting with tampered IV', () => {
    const encrypted = encrypt('test', TEST_KEY)
    const parts = encrypted.split(':')
    // Tamper with IV
    parts[0] = 'aa' + parts[0].slice(2)
    expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow()
  })

  it('[P2] should throw when decrypting with tampered auth tag', () => {
    const encrypted = encrypt('test', TEST_KEY)
    const parts = encrypted.split(':')
    // Tamper with auth tag
    parts[1] = 'ff' + parts[1].slice(2)
    expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow()
  })

  it('[P2] should handle special characters in API keys', () => {
    const specialChars = 'sk_live_!@#$%^&*()_+-=[]{}|;:,.<>?'
    const encrypted = encrypt(specialChars, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(specialChars)
  })

  it('[P2] should handle newlines and whitespace in input', () => {
    const withWhitespace = 'key with\nnewlines\tand\ttabs'
    const encrypted = encrypt(withWhitespace, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(withWhitespace)
  })
})
