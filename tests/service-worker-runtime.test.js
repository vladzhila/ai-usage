import { mock, beforeAll, beforeEach, describe, test, expect } from 'bun:test'
import { createChromeMock, setCookie, setStorage, getStorage, clearMocks } from './mocks/chrome.js'
import { CACHE_KEY } from '../src/background/service-worker-core.js'
import { CACHE_FALLBACK_MESSAGE, FETCH_FALLBACK_MESSAGE } from '../src/lib/constants.js'

const state = {
  chrome: null,
  listener: null,
  serviceWorker: null,
}

function createResponse({ ok = true, status = 200, data = {} }) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  }
}

function createFetchSequence(responses) {
  const state = { index: 0 }
  return mock(() => {
    const response = responses[state.index] || responses[responses.length - 1]
    state.index += 1
    if (response instanceof Error) {
      return Promise.reject(response)
    }
    if (typeof response === 'function') {
      return response()
    }
    return Promise.resolve(response)
  })
}

beforeAll(async () => {
  state.chrome = createChromeMock()
  state.chrome.runtime.onMessage = {
    addListener: mock((handler) => {
      state.listener = handler
    }),
  }
  globalThis.chrome = state.chrome
  state.serviceWorker = await import('../src/background/service-worker.js')
})

beforeEach(() => {
  clearMocks()
})

describe('fetchCodex', () => {
  test('returns logged_out when cookie missing', async () => {
    const fetchMock = mock()
    globalThis.fetch = fetchMock

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('logged_out')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns expired for unauthorized session', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([createResponse({ ok: false, status: 401 })])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('expired')
  })

  test('returns error for non-ok session response', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([createResponse({ ok: false, status: 500 })])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('error')
    expect(result.message).toBe('Session HTTP 500')
  })

  test('returns expired when access token is missing', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([createResponse({ ok: true, status: 200, data: {} })])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('expired')
    expect(result.message).toBe('No access token in session')
  })

  test('returns expired for unauthorized usage response', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { accessToken: 'token' } }),
      createResponse({ ok: false, status: 403 }),
    ])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('expired')
  })

  test('returns error for non-ok usage response', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { accessToken: 'token' } }),
      createResponse({ ok: false, status: 502 }),
    ])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('error')
    expect(result.message).toBe('HTTP 502')
  })

  test('returns parsed usage data', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    const usageData = {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 12, reset_at: 123 },
        secondary_window: { used_percent: 34, reset_at: 456 },
      },
      credits: { has_credits: true, unlimited: false, balance: '7.5' },
    }
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { accessToken: 'token' } }),
      createResponse({ ok: true, status: 200, data: usageData }),
    ])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Plus')
    expect(result.data.session.used).toBe(12)
    expect(result.data.session.reset).toBe(123000)
    expect(result.data.weekly.used).toBe(34)
    expect(result.data.weekly.reset).toBe(456000)
    expect(result.data.credits.has).toBe(true)
    expect(result.data.credits.balance).toBe(7.5)
  })

  test('returns error when fetch throws', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([new Error('boom')])

    const result = await state.serviceWorker.fetchCodex()

    expect(result.status).toBe('error')
    expect(result.message).toBe('Refresh chatgpt.com tab')
  })
})

describe('fetchCursorUsage', () => {
  test('returns logged_out when cookie missing', async () => {
    const fetchMock = mock()
    globalThis.fetch = fetchMock

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('logged_out')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns expired for unauthorized responses', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: false, status: 401 }),
      createResponse({ ok: true, status: 200, data: {} }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('expired')
  })

  test('returns error when usage lookup fails', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: false, status: 500 }),
      createResponse({ ok: true, status: 200, data: {} }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('error')
    expect(result.message).toBe('HTTP 500')
  })

  test('returns error when user lookup fails', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { individualUsage: {} } }),
      createResponse({ ok: false, status: 500 }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('error')
    expect(result.message).toBe('HTTP 500')
  })

  test('uses legacy cursor endpoint when needed', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: {} }),
      createResponse({ ok: true, status: 200, data: { sub: 'user-1', email: 'legacy@test.com' } }),
      createResponse({
        ok: true,
        status: 200,
        data: { 'gpt-4': { numRequests: 10, maxRequestUsage: 100 } },
      }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Legacy')
    expect(result.data.legacy.requests).toBe(10)
  })

  test('falls back to summary when legacy lookup fails', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { membershipType: 'pro' } }),
      createResponse({ ok: true, status: 200, data: { sub: 'user-2', email: 'user@test.com' } }),
      createResponse({ ok: false, status: 500 }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
  })

  test('returns parsed summary for non-legacy responses', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    const usageData = {
      membershipType: 'pro',
      billingCycleEnd: '2026-01-20T14:05:00Z',
      individualUsage: { plan: { used: 500, limit: 1000 } },
    }
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: usageData }),
      createResponse({ ok: true, status: 200, data: { email: 'user@test.com' } }),
    ])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
    expect(result.data.used).toBe(50)
  })

  test('returns error when fetch throws', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    globalThis.fetch = createFetchSequence([new Error('boom')])

    const result = await state.serviceWorker.fetchCursorUsage()

    expect(result.status).toBe('error')
    expect(result.message).toBe('Refresh cursor.com tab')
  })
})

describe('fetchAll cache behavior', () => {
  test('returns cached data when cache is valid and not forced', async () => {
    const cached = {
      timestamp: Date.now(),
      claude: { status: 'ok', data: { plan: 'Max' } },
    }
    setStorage(CACHE_KEY, cached)
    const fetchMock = mock()
    globalThis.fetch = fetchMock

    const result = await state.serviceWorker.fetchAll(false, {
      claude: true,
      codex: false,
      cursor: false,
    })

    expect(result.claude).toEqual(cached.claude)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns cached data when providers are logged out', async () => {
    const cached = {
      timestamp: 123,
      claude: { status: 'ok', data: { plan: 'Pro' } },
    }
    setStorage(CACHE_KEY, cached)

    const result = await state.serviceWorker.fetchAll(true, {
      claude: true,
      codex: false,
      cursor: false,
    })

    expect(result.meta.cache).toBe(true)
    expect(result.meta.message).toBe(CACHE_FALLBACK_MESSAGE)
    expect(result.claude).toEqual(cached.claude)
    expect(getStorage(CACHE_KEY).timestamp).toBe(123)
  })

  test('caches results when providers succeed', async () => {
    setStorage(CACHE_KEY, {})
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'session')
    globalThis.fetch = createFetchSequence([
      createResponse({ ok: true, status: 200, data: { accessToken: 'token' } }),
      createResponse({
        ok: true,
        status: 200,
        data: {
          plan_type: 'plus',
          rate_limit: {
            primary_window: { used_percent: 10, reset_at: 100 },
            secondary_window: { used_percent: 20, reset_at: 200 },
          },
        },
      }),
    ])

    const result = await state.serviceWorker.fetchAll(true, {
      claude: false,
      codex: true,
      cursor: false,
    })

    const stored = getStorage(CACHE_KEY)
    expect(result.codex.status).toBe('ok')
    expect(stored.codex.status).toBe('ok')
    expect(Boolean(stored.timestamp)).toBe(true)
  })

  test('normalizes rejected provider results', async () => {
    const originalGet = state.chrome.cookies.get
    state.chrome.cookies.get = async () => {
      throw new Error('cookie fail')
    }

    try {
      const result = await state.serviceWorker.fetchAll(true, {
        claude: true,
        codex: false,
        cursor: false,
      })

      expect(result.claude).toEqual({
        status: 'error',
        message: FETCH_FALLBACK_MESSAGE,
      })
    } finally {
      state.chrome.cookies.get = originalGet
    }
  })

  test('falls back to cache when fetchAll throws', async () => {
    const cached = {
      timestamp: 456,
      claude: { status: 'ok', data: { plan: 'Free' } },
      codex: { status: 'ok', data: { plan: 'Plus', session: {}, weekly: {} } },
      cursor: { status: 'ok', data: { plan: 'Pro', used: 0, limit: 100 } },
    }
    setStorage(CACHE_KEY, cached)

    const originalGet = state.chrome.storage.local.get
    const calls = { count: 0 }
    state.chrome.storage.local.get = (keys, callback) => {
      calls.count += 1
      if (calls.count === 1) {
        return Promise.reject(new Error('boom'))
      }
      return originalGet(keys, callback)
    }

    try {
      const result = await state.serviceWorker.safeFetchAll(false, {
        claude: true,
        codex: true,
        cursor: true,
      })

      expect(result.meta.cache).toBe(true)
      expect(result.claude).toEqual(cached.claude)
      expect(result.codex).toEqual(cached.codex)
      expect(result.cursor).toEqual(cached.cursor)
    } finally {
      state.chrome.storage.local.get = originalGet
    }
  })

  test('returns error results when cache is missing', async () => {
    const originalGet = state.chrome.storage.local.get
    const calls = { count: 0 }
    state.chrome.storage.local.get = (keys, callback) => {
      calls.count += 1
      if (calls.count === 1) {
        return Promise.reject(new Error('boom'))
      }
      return originalGet(keys, callback)
    }

    try {
      const result = await state.serviceWorker.safeFetchAll(false, {
        claude: true,
        codex: true,
        cursor: true,
      })

      expect(result.claude.status).toBe('error')
      expect(result.codex.status).toBe('error')
      expect(result.cursor.status).toBe('error')
    } finally {
      state.chrome.storage.local.get = originalGet
    }
  })
})

describe('message listener', () => {
  test('responds to FETCH_USAGE and keeps the channel open', async () => {
    const respond = mock()
    const result = state.listener(
      {
        type: 'FETCH_USAGE',
        force: false,
        visibility: { claude: false, codex: false, cursor: false },
      },
      null,
      respond
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(respond).toHaveBeenCalledWith({
      claude: { status: 'hidden' },
      codex: { status: 'hidden' },
      cursor: { status: 'hidden' },
    })
  })

  test('ignores unknown message types', () => {
    const respond = mock()
    const result = state.listener({ type: 'NOOP' }, null, respond)

    expect(result).toBeUndefined()
    expect(respond).not.toHaveBeenCalled()
  })
})
