import '@testing-library/jest-dom/vitest'

import { faker } from '@faker-js/faker'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './msw/server'

// Seed faker for deterministic test data across all test files
faker.seed(42)

// Global cleanup — ensures no mock leaks between tests
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// MSW server lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
