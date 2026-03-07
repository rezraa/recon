import '@testing-library/jest-dom/vitest'

import { faker } from '@faker-js/faker'
import { afterEach, vi } from 'vitest'

// Seed faker for deterministic test data across all test files
faker.seed(42)

// Global cleanup — ensures no mock leaks between tests
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// MSW server lifecycle — populated when handlers are created in Story 2.x
// import { server } from './msw/server'
// beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// afterEach(() => server.resetHandlers())
// afterAll(() => server.close())
