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
  formatCodexPlan,
  parseLegacyCursor,
} from '../src/background/service-worker-core.js'

describe('SERVICES config', () => {
  test('has claude config', () => {
    expect(SERVICES.claude).toBeDefined()
    expect(SERVICES.claude.urls).toContain('https://claude.ai')
    expect(SERVICES.claude.cookies).toContain('sessionKey')
    expect(SERVICES.claude.prefix).toBe('sk-ant-')
  })

  test('has chatgpt config', () => {
    expect(SERVICES.chatgpt).toBeDefined()
    expect(SERVICES.chatgpt.urls).toContain('https://chatgpt.com')
    expect(SERVICES.chatgpt.cookies).toContain('__Secure-next-auth.session-token')
    expect(SERVICES.chatgpt.cookies).toContain('next-auth.session-token')
    expect(SERVICES.chatgpt.prefix).toBeNull()
  })

  test('has cursor config', () => {
    expect(SERVICES.cursor).toBeDefined()
    expect(SERVICES.cursor.urls).toContain('https://cursor.com')
    expect(SERVICES.cursor.urls).toContain('https://cursor.sh')
    expect(SERVICES.cursor.cookies).toContain('WorkosCursorSessionToken')
    expect(SERVICES.cursor.cookies).toContain('__Secure-next-auth.session-token')
    expect(SERVICES.cursor.cookies).toContain('next-auth.session-token')
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

  test('falls back to alternate chatgpt cookie', async () => {
    setCookie('https://chatgpt.com', 'next-auth.session-token', 'session-456')
    const result = await getCookie('chatgpt')
    expect(result).toBe('session-456')
  })

  test('returns cookie value for cursor', async () => {
    setCookie('https://cursor.com', 'WorkosCursorSessionToken', 'cursor-session')
    const result = await getCookie('cursor')
    expect(result).toBe('cursor-session')
  })

  test('falls back to cursor alternate cookie and domain', async () => {
    setCookie('https://cursor.sh', '__Secure-next-auth.session-token', 'cursor-alt')
    const result = await getCookie('cursor')
    expect(result).toBe('cursor-alt')
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

// Helper to create mock fetch for Claude API
function createClaudeMock(options = {}) {
  const {
    org = { uuid: 'org-123', capabilities: ['claude_pro'] },
    usage = { five_hour: { utilization: 45, resets_at: '2025-01-01T00:00:00Z' } },
    account = { rate_limit_tier: 'claude_pro', billing_type: null },
    overage = { is_enabled: false },
    accountFails = false,
    overageFails = false,
  } = options

  return (url) => {
    if (url.includes('/organizations') && !url.includes('/usage') && !url.includes('/overage')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([org]),
      })
    }
    if (url.includes('/usage')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(usage),
      })
    }
    if (url.includes('/account')) {
      if (accountFails) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(account),
      })
    }
    if (url.includes('/overage')) {
      if (overageFails) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(overage),
      })
    }
    return Promise.resolve({ ok: false, status: 404 })
  }
}

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

  test('returns Pro plan with session-only data', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_pro' },
        usage: {
          five_hour: { utilization: 45, resets_at: '2025-01-01T00:00:00Z' },
        },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
    expect(result.data.fiveHour.used).toBe(45)
    expect(result.data.fiveHour.reset).toBe('2025-01-01T00:00:00Z')
    expect(result.data.weekly).toBeNull()
    expect(result.data.opus).toBeNull()
    expect(result.data.extra.enabled).toBe(false)
  })

  test('returns Max plan with opus window and extra spend', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_max' },
        usage: {
          five_hour: { utilization: 20, resets_at: '2025-01-01T05:00:00Z' },
          seven_day: { utilization: 15, resets_at: '2025-01-08T00:00:00Z' },
          seven_day_opus: { utilization: 10, resets_at: '2025-01-08T00:00:00Z' },
          seven_day_sonnet: { utilization: 5, resets_at: '2025-01-08T00:00:00Z' },
        },
        overage: {
          is_enabled: true,
          used_credits: 550,
          monthly_credit_limit: 2000,
        },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Max')
    expect(result.data.fiveHour.used).toBe(20)
    expect(result.data.weekly.used).toBe(15)
    expect(result.data.opus.used).toBe(10)
    expect(result.data.sonnet.used).toBe(5)
    expect(result.data.extra.enabled).toBe(true)
    expect(result.data.extra.used).toBe(5.5)
    expect(result.data.extra.limit).toBe(20)
  })

  test('returns Free plan with session-only data', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        org: { uuid: 'org-123', capabilities: [] },
        account: {},
        usage: { five_hour: { utilization: 10 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Free')
    expect(result.data.fiveHour.used).toBe(10)
    expect(result.data.weekly).toBeNull()
    expect(result.data.opus).toBeNull()
  })

  test('gracefully handles overage endpoint failure', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_pro' },
        usage: { five_hour: { utilization: 50 } },
        overageFails: true,
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
    expect(result.data.fiveHour.used).toBe(50)
    expect(result.data.extra.enabled).toBe(false)
  })

  test('gracefully handles account endpoint failure', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        org: { uuid: 'org-123', capabilities: ['claude_pro'] },
        usage: { five_hour: { utilization: 25 } },
        accountFails: true,
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
    expect(result.data.fiveHour.used).toBe(25)
  })

  test('returns Team plan from rate_limit_tier', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_team', billing_type: null },
        usage: { five_hour: { utilization: 30 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Team')
  })

  test('returns Ultra plan from rate_limit_tier', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_ultra', billing_type: null },
        usage: { five_hour: { utilization: 12 }, seven_day: { utilization: 30 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Ultra')
    expect(result.data.weekly.used).toBe(30)
  })

  test('returns Pro plan when billing_type indicates paid', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { billing_type: 'stripe', rate_limit_tier: null },
        org: { uuid: 'org-123', capabilities: [] },
        usage: { five_hour: { utilization: 22 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Pro')
  })

  test('does not use billing_type when tier is present', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { billing_type: 'stripe', rate_limit_tier: 'claude_team' },
        usage: { five_hour: { utilization: 18 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Team')
  })

  test('returns Enterprise plan from rate_limit_tier', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_enterprise', billing_type: null },
        usage: { five_hour: { utilization: 15 } },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Enterprise')
  })

  test('returns extra disabled when is_enabled false', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_max' },
        usage: { five_hour: { utilization: 20 } },
        overage: { is_enabled: false, used_credits: 0, monthly_credit_limit: 0 },
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.extra.enabled).toBe(false)
  })

  test('handles null fiveHour window gracefully', async () => {
    setCookie('https://claude.ai', 'sessionKey', 'sk-ant-valid')

    mockFetch.mockImplementation(
      createClaudeMock({
        account: { rate_limit_tier: 'claude_pro' },
        usage: {},
      })
    )

    const result = await fetchClaude()
    expect(result.status).toBe('ok')
    expect(result.data.fiveHour).toBeNull()
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
    expect(result.data.plan).toBe('Pro')
    expect(result.data.used).toBe(25)
    expect(result.data.limit).toBe(100)
    expect(result.data.reset).toBe(Date.parse('2026-01-20T14:05:00Z'))
  })

  test('falls back to totalPercentUsed when plan limit missing', () => {
    const usageWithPercent = {
      ...CURSOR_USAGE_RESPONSE,
      individualUsage: {
        ...CURSOR_USAGE_RESPONSE.individualUsage,
        plan: {
          totalPercentUsed: 0.4,
        },
      },
    }

    const result = fetchCursor({
      usage: usageWithPercent,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.status).toBe('ok')
    expect(result.data.used).toBe(40)
  })

  test('handles totalPercentUsed in whole percentages', () => {
    const usageWithPercent = {
      ...CURSOR_USAGE_RESPONSE,
      individualUsage: {
        ...CURSOR_USAGE_RESPONSE.individualUsage,
        plan: {
          totalPercentUsed: 75,
        },
      },
    }

    const result = fetchCursor({
      usage: usageWithPercent,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.status).toBe('ok')
    expect(result.data.used).toBe(75)
  })

  test('returns breakdown data when present', () => {
    const usageWithBreakdown = {
      ...CURSOR_USAGE_RESPONSE,
      individualUsage: {
        ...CURSOR_USAGE_RESPONSE.individualUsage,
        plan: {
          ...CURSOR_USAGE_RESPONSE.individualUsage.plan,
          autoPercentUsed: 0.15,
          apiPercentUsed: 0.1,
        },
      },
    }

    const result = fetchCursor({
      usage: usageWithBreakdown,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.status).toBe('ok')
    expect(result.data.breakdown.auto).toBe(15)
    expect(result.data.breakdown.api).toBe(10)
  })

  test('returns null breakdown when not present', () => {
    const result = fetchCursor({
      usage: CURSOR_USAGE_RESPONSE,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.data.breakdown.auto).toBeNull()
    expect(result.data.breakdown.api).toBeNull()
  })

  test('returns team usage when present', () => {
    const usageWithTeam = {
      ...CURSOR_USAGE_RESPONSE,
      teamUsage: {
        onDemand: {
          used: 1500,
          limit: 5000,
        },
      },
    }

    const result = fetchCursor({
      usage: usageWithTeam,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.status).toBe('ok')
    expect(result.data.team).toBeDefined()
    expect(result.data.team.used).toBe(15)
    expect(result.data.team.limit).toBe(50)
  })

  test('returns team without limit when limit not set', () => {
    const usageWithTeamNoLimit = {
      ...CURSOR_USAGE_RESPONSE,
      teamUsage: {
        onDemand: {
          used: 2000,
        },
      },
    }

    const result = fetchCursor({
      usage: usageWithTeamNoLimit,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.data.team.used).toBe(20)
    expect(result.data.team.limit).toBeNull()
  })

  test('returns null team when not present', () => {
    const result = fetchCursor({
      usage: CURSOR_USAGE_RESPONSE,
      user: CURSOR_USER_RESPONSE,
    })

    expect(result.data.team).toBeNull()
  })
})

describe('formatCodexPlan', () => {
  test('returns Free for null/undefined', () => {
    expect(formatCodexPlan(null)).toBe('Free')
    expect(formatCodexPlan(undefined)).toBe('Free')
    expect(formatCodexPlan('')).toBe('Free')
  })

  test('maps known plan types correctly', () => {
    expect(formatCodexPlan('guest')).toBe('Guest')
    expect(formatCodexPlan('free')).toBe('Free')
    expect(formatCodexPlan('go')).toBe('Go')
    expect(formatCodexPlan('plus')).toBe('Plus')
    expect(formatCodexPlan('pro')).toBe('Pro')
    expect(formatCodexPlan('free_workspace')).toBe('Free Workspace')
    expect(formatCodexPlan('team')).toBe('Team')
    expect(formatCodexPlan('business')).toBe('Business')
    expect(formatCodexPlan('education')).toBe('Education')
    expect(formatCodexPlan('quorum')).toBe('Quorum')
    expect(formatCodexPlan('k12')).toBe('K-12')
    expect(formatCodexPlan('enterprise')).toBe('Enterprise')
    expect(formatCodexPlan('edu')).toBe('Education')
  })

  test('handles case insensitivity', () => {
    expect(formatCodexPlan('PLUS')).toBe('Plus')
    expect(formatCodexPlan('Plus')).toBe('Plus')
    expect(formatCodexPlan('PRO')).toBe('Pro')
    expect(formatCodexPlan('TEAM')).toBe('Team')
  })

  test('handles whitespace', () => {
    expect(formatCodexPlan('  plus  ')).toBe('Plus')
    expect(formatCodexPlan(' pro ')).toBe('Pro')
  })

  test('capitalizes unknown plan types', () => {
    expect(formatCodexPlan('unknown')).toBe('Unknown')
    expect(formatCodexPlan('custom')).toBe('Custom')
    expect(formatCodexPlan('newplan')).toBe('Newplan')
  })
})

describe('parseLegacyCursor', () => {
  test('handles missing data', () => {
    const result = parseLegacyCursor(null)
    expect(result.status).toBe('error')
  })

  test('parses legacy cursor data', () => {
    const data = {
      'gpt-4': {
        numRequests: 50,
        maxRequestUsage: 200,
      },
    }
    const user = { email: 'legacy@example.com' }
    const result = parseLegacyCursor(data, user)
    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Legacy')
    expect(result.data.used).toBe(25)
    expect(result.data.legacy.requests).toBe(50)
    expect(result.data.legacy.max).toBe(200)
    expect(result.data.email).toBe('legacy@example.com')
  })

  test('prefers numRequestsTotal when available', () => {
    const data = {
      'gpt-4': {
        numRequests: 50,
        numRequestsTotal: 75,
        maxRequestUsage: 150,
      },
    }
    const result = parseLegacyCursor(data, { email: 'total@example.com' })
    expect(result.status).toBe('ok')
    expect(result.data.used).toBe(50)
    expect(result.data.legacy.requests).toBe(75)
    expect(result.data.legacy.max).toBe(150)
  })

  test('parses gpt-4 request data', () => {
    const data = {
      'gpt-4': {
        numRequests: 250,
        maxRequestUsage: 500,
      },
    }
    const user = { email: 'test@example.com' }

    const result = parseLegacyCursor(data, user)

    expect(result.status).toBe('ok')
    expect(result.data.plan).toBe('Legacy')
    expect(result.data.used).toBe(50)
    expect(result.data.limit).toBe(100)
    expect(result.data.legacy.requests).toBe(250)
    expect(result.data.legacy.max).toBe(500)
    expect(result.data.email).toBe('test@example.com')
  })

  test('handles missing gpt-4 data', () => {
    const result = parseLegacyCursor({}, { email: 'user@test.com' })

    expect(result.status).toBe('ok')
    expect(result.data.used).toBe(0)
    expect(result.data.legacy.requests).toBe(0)
    expect(result.data.legacy.max).toBe(500)
  })

  test('calculates percentage correctly', () => {
    const data = {
      'gpt-4': {
        numRequests: 100,
        maxRequestUsage: 1000,
      },
    }

    const result = parseLegacyCursor(data, {})
    expect(result.data.used).toBe(10)
  })

  test('caps percentage at 100', () => {
    const data = {
      'gpt-4': {
        numRequests: 600,
        maxRequestUsage: 500,
      },
    }

    const result = parseLegacyCursor(data, {})
    expect(result.data.used).toBe(100)
  })
})
