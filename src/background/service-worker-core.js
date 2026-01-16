// Core service worker logic - extracted for testability

export const CACHE_KEY = 'usage_cache'
export const CACHE_TTL = 60000 // 1 minute
export const FETCH_ERROR_MESSAGE = 'Fetch failed'

const CURSOR_DEFAULT_PLAN = 'Cursor'
const CURSOR_PLAN_ENTERPRISE = 'Enterprise'
const CURSOR_PLAN_PRO = 'Pro'
const CURSOR_PLAN_HOBBY = 'Hobby'
const CURSOR_PLAN_TEAM = 'Team'
const CURSOR_PLAN_FREE = 'Free'
const CURSOR_TYPE_ENTERPRISE = 'enterprise'
const CURSOR_TYPE_FREE = 'free'
const CURSOR_TYPE_HOBBY = 'hobby'
const CURSOR_TYPE_PRO = 'pro'
const CURSOR_TYPE_TEAM = 'team'
const CURSOR_DATA_ERROR = 'No Cursor data'
const PERCENT_MAX = 100
const CENTS_PER_DOLLAR = 100

export const SERVICES = {
  claude: {
    url: 'https://claude.ai',
    cookie: 'sessionKey',
    prefix: 'sk-ant-',
  },
  chatgpt: {
    url: 'https://chatgpt.com',
    cookie: '__Secure-next-auth.session-token',
    prefix: null,
  },
  cursor: {
    url: 'https://cursor.com',
    cookie: 'WorkosCursorSessionToken',
    prefix: null,
  },
}

export async function getCookie(service) {
  const config = SERVICES[service]
  if (!config) {
    return null
  }

  const cookie = await chrome.cookies.get({
    url: config.url,
    name: config.cookie,
  })

  return cookie?.value || null
}

export function isValid(service, value) {
  if (!value) {
    return false
  }
  const config = SERVICES[service]
  if (config.prefix) {
    return value.startsWith(config.prefix)
  }
  return true
}

export async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' }).catch(() => null)

  if (!response) {
    return { status: 'error', message: FETCH_ERROR_MESSAGE }
  }

  if (response.status === 401 || response.status === 403) {
    return { status: 'expired' }
  }

  if (!response.ok) {
    return { status: 'error', message: `HTTP ${response.status}` }
  }

  return { status: 'ok', data: await response.json() }
}

export async function getCache() {
  const result = await chrome.storage.local.get(CACHE_KEY)
  return result[CACHE_KEY] || null
}

export async function setCache(data) {
  await chrome.storage.local.set({
    [CACHE_KEY]: { ...data, timestamp: Date.now() },
  })
}

export function isCacheValid(cache) {
  if (!cache?.timestamp) {
    return false
  }
  return Date.now() - cache.timestamp < CACHE_TTL
}

export async function fetchClaude() {
  const cookie = await getCookie('claude')

  if (!isValid('claude', cookie)) {
    return { status: 'logged_out', message: 'Log into claude.ai to see usage' }
  }

  const orgs = await fetchJson('https://claude.ai/api/organizations')
  if (orgs.status !== 'ok') {
    return orgs
  }

  const org = orgs.data?.[0]
  if (!org?.uuid) {
    return { status: 'error', message: 'No organization found' }
  }

  const usage = await fetchJson(`https://claude.ai/api/organizations/${org.uuid}/usage`)
  if (usage.status !== 'ok') {
    return usage
  }

  const isPro = org.capabilities?.includes('claude_pro')
  const fiveHour = usage.data?.five_hour

  return {
    status: 'ok',
    data: {
      plan: isPro ? 'Pro' : 'Free',
      used: fiveHour?.utilization || 0,
      limit: 100,
      reset: fiveHour?.resets_at || null,
    },
  }
}

function formatCursorPlan(type) {
  if (!type) {
    return CURSOR_DEFAULT_PLAN
  }

  const normalized = String(type).trim().toLowerCase()
  if (!normalized) {
    return CURSOR_DEFAULT_PLAN
  }

  if (normalized === CURSOR_TYPE_FREE) {
    return CURSOR_PLAN_FREE
  }

  if (normalized === CURSOR_TYPE_ENTERPRISE) {
    return CURSOR_PLAN_ENTERPRISE
  }

  if (normalized === CURSOR_TYPE_PRO) {
    return CURSOR_PLAN_PRO
  }

  if (normalized === CURSOR_TYPE_HOBBY) {
    return CURSOR_PLAN_HOBBY
  }

  if (normalized === CURSOR_TYPE_TEAM) {
    return CURSOR_PLAN_TEAM
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

function toPercent(used, limit) {
  if (!limit || limit <= 0) {
    return 0
  }

  const ratio = used / limit
  const percent = Math.round(ratio * PERCENT_MAX)
  return Math.min(PERCENT_MAX, Math.max(0, percent))
}

function parseCursorSummary(payload) {
  if (!payload) {
    return { status: 'error', message: CURSOR_DATA_ERROR }
  }

  if (payload.status && payload.status !== 'ok') {
    return payload
  }

  const usage = payload.usage || payload
  const user = payload.user || {}
  const summary = usage?.usage || usage
  const individual = summary?.individualUsage || {}
  const plan = individual?.plan || {}
  const breakdown = plan?.breakdown || {}
  const onDemand = individual?.onDemand || {}

  const planUsedRaw = Number(plan.used || 0)
  const planLimitRaw = Number(breakdown.total ?? plan.limit ?? 0)
  const percent = toPercent(planUsedRaw, planLimitRaw)

  const onDemandUsedRaw = Number(onDemand.used || 0)
  const onDemandUsed = onDemandUsedRaw / CENTS_PER_DOLLAR

  const cycleEnd = summary?.billingCycleEnd
  const reset = cycleEnd ? Date.parse(cycleEnd) : null

  return {
    status: 'ok',
    data: {
      plan: formatCursorPlan(summary?.membershipType),
      used: percent,
      limit: 100,
      reset: Number.isNaN(reset) ? null : reset,
      onDemand: onDemandUsed,
      email: user?.email || null,
    },
  }
}

export function fetchCursor(payload) {
  return parseCursorSummary(payload)
}
