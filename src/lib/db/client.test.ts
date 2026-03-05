import { describe, expect, it } from 'vitest'

import { getDb } from './client'

describe('db/client', () => {
  it('should export getDb as a function', () => {
    expect(typeof getDb).toBe('function')
  })
})
