import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { createChromeMock, setCookie, clearMocks, setStorage, getStorage } from './mocks/chrome.js'

// Setup global chrome mock
const chrome = createChromeMock()
globalThis.chrome = chrome

// Mock fetch
const mockFetch = mock(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
)
globalThis.fetch = mockFetch

// Import after setting up mocks
import {
  SERVICES,
  CACHE_KEY,
  CACHE_TTL,
  FETCH_ERROR_MESSAGE,
  getCookie,
  isValid,
  fetchJson,
  getCache,
  setCache,
  isCacheValid,
  fetchClaude,
  fetchCursor,
} from '../src/background/service-worker-core.js'

describe('SERVICES config', () => {
  test('has claude config', () => {
    expect(SERVICES.claude).toBeDefined()
    expect(SERVICES.claude.url).toBe('https://claude.ai')
    expect(SERVICES.claude.cookie).toBe('sessionKey')
    expect(SERVICES.claude.prefix).toBe('sk-ant-')
  })

  test('has chatgpt config', () => {
    expect(SERVICES.chatgpt).toBeDefined()
    expect(SERVICES.chatgpt.url).toBe('https://chatgpt.com')
    expect(SERVICES.chatgpt.cookie).toBe('__Secure-next-auth.session-token')
    expect(SERVICES.chatgpt.prefix).toBeNull()
  })

  test('has cursor config', () => {
    expect(SERVICES.cursor).toBeDefined()
    expect(SERVICES.cursor.url).toBe('https://cursor.com')
    expect(SERVICES.cursor.cookie).toBe('WorkosCursorSessionToken')
    expect(SERVICES.cursor.prefix).toBeNull()
  })
})

describe('getCookie', () => {
  beforeEach(() => {
    clearMocks()
  })

  test('returns null for unknown service', async () => {
    const result = await getCookie('unknown')
    expect(result).toBeNull()
  })

  test('returns null when no cookie', async () => {
    const result = await getCookie('claude')
    expect(result).toBeNull()
  })

  test('returns cookie value for claude', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-test')
    const result = await getCookie('claude')
    expect(result).toBe('sk-ant-test')
  })

  test('returns cookie value for chatgpt', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session-123')
    const result = await getCookie('chatgpt')
    expect(result).toBe('session-123')
  })

  test('returns cookie value for cursor', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    const result = await getCookie('cursor')
    expect(result).toBe('cursor-session')
  })
})

describe('isValid', () => {
  test('returns false for null/undefined', () => {
    expect(isValid('claude', null)).toBe(false)
    expect(isValid('claude', undefined)).toBe(false)
    expect(isValid('chatgpt', null)).toBe(false)
  })

  test('validates claude cookie prefix', () => {
    expect(isValid('claude', 'sk-ant-valid-token')).toBe(true)
    expect(isValid('claude', 'invalid-token')).toBe(false)
  })

  test('accepts any non-empty chatgpt cookie', () => {
    expect(isValid('chatgpt', 'any-value')).toBe(true)
    expect(isValid('chatgpt', 'x')).toBe(true)
  })

  test('accepts any non-empty cursor cookie', () => {
    expect(isValid('cursor', 'cursor-session')).toBe(true)
    expect(isValid('cursor', 'x')).toBe(true)
  })
})

describe('cache functions', () => {
  beforeEach(() => {
    clearMocks()
  })

  test('getCache returns null when empty', async () => {
    const result = await getCache()
    expect(result).toBeNull()
  })

  test('setCache stores data with timestamp', async () => {
    await setCache({ foo: 'bar' })
    const stored = getStorage(CACHE_KEY)
    expect(stored.foo).toBe('bar')
    expect(stored.timestamp).toBeGreaterThan(0)
  })

  test('getCache returns stored data', async () => {
    await setCache({ test: 123 })
    const result = await getCache()
    expect(result.test).toBe(123)
  })

  test('isCacheValid returns false for null', () => {
    expect(isCacheValid(null)).toBe(false)
  })

  test('isCacheValid returns false for missing timestamp', () => {
    expect(isCacheValid({})).toBe(false)
    expect(isCacheValid({ foo: 'bar' })).toBe(false)
  })

  test('isCacheValid returns true for fresh cache', () => {
    const cache = { timestamp: Date.now() }
    expect(isCacheValid(cache)).toBe(true)
  })

  test('isCacheValid returns false for expired cache', () => {
    const cache = { timestamp: Date.now() - CACHE_TTL - 1000 }
    expect(isCacheValid(cache)).toBe(false)
  })
})

describe('fetchJson', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  test('returns ok with data on success', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ foo: 'bar' }),
      })
    )

    const result = await fetchJson('https://example.com/api')
    expect(result.status).toBe('ok')
    expect(result.data.foo).toBe('bar')
  })

  test('returns expired on 401', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 401 }))

    const result = await fetchJson('https://example.com/api')
    expect(result.status).toBe('expired')
  })

  test('returns expired on 403', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 403 }))

    const result = await fetchJson('https://example.com/api')
    expect(result.status).toBe('expired')
  })

  test('returns error on other failures', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500 }))

    const result = await fetchJson('https://example.com/api')
    expect(result.status).toBe('error')
    expect(result.message).toBe('HTTP 500')
  })

  test('returns error when fetch throws', async function () {
    mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')))

    const result = await fetchJson('https://example.com/api')
    expect(result.status).toBe('error')
    expect(result.message).toBe(FETCH_ERROR_MESSAGE)
  })
})

describe('fetchClaude', () => {
  beforeEach(() => {
    clearMocks()
    mockFetch.mockClear()
  })

  test('returns logged_out when no valid cookie', async () => {
    const result = await fetchClaude()
    expect(result.status).toBe('logged_out')
    expect(result.message).toContain('Log into claude.ai')
  })

  test('returns error when fetch fails', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')
    mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')))
    const result = await fetchClaude()
    expect(result.status).toBe('error')
    expect(result.message).toBe(FETCH_ERROR_MESSAGE)
  })

  test('returns error when no organization found', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('error')
    expect(result.message).toContain('No organization')
  })

  test('returns usage data on success', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation((url) => {
      if (url.includes('/organizations') && !url.includes('/usage')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ uuid: 'org-123', capabilities: ['claude_pro'] }]),
        })
      }
      if (url.includes('/usage')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ five_hour: { utilization: 45, resets_at: '2025-01-01T00:00:00Z' } }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
    expect(result.data.used).toBe(45)
    expect(result.data.limit).toBe(100)
  })

  test('returns Free plan when no claude_pro capability', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation((url) => {
      if (url.includes('/organizations') && !url.includes('/usage')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ uuid: 'org-123', capabilities: [] }]),
        })
      }
      if (url.includes('/usage')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ five_hour: { utilization: 10 } }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Free')
  })
})

const CURSOR_USAGE_RESPONSE = {
  billingCycleEnd: '2026-01-20T14:05:00Z',
  membershipType: 'pro',
  individualUsage: {
    plan: {
      used: 2500,
      limit: 10000,
      breakdown: {
        total: 10000,
      },
    },
    onDemand: {
      used: 500,
    },
  },
}

const CURSOR_USER_RESPONSE = {
  email: 'user@example.com',
}

describe('fetchCursor', () => {
  test('returns error for missing payload', () => {
    const result = fetchCursor()
    expect(result.status).toBe('error')
  })

  test('returns usage data on success', () => {
    const result = fetchCursor({
      usage: CURSOR_USAGE_RESPONSE,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Cursor Pro')
    expect(result.data.used).toBe(25)
    expect(result.data.limit).toBe(100)
    expect(result.data.reset).toBe(Date.parse('2026-01-20T14:05:00Z'))
  })
})
