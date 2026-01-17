// Core service worker logic - extracted for testability

export const CACHE_KEY = 'usage_cache'
export const CACHE_TTL = 60000 // 1 minute
export const FETCH_ERROR_MESSAGE = 'Fetch failed'

const CURSOR_DEFAULT_PLAN = 'Cursor'
const CURSOR_PLAN_LABELS = {
  free: 'Free',
  enterprise: 'Enterprise',
  pro: 'Pro',
  hobby: 'Hobby',
  team: 'Team',
}
const CURSOR_DATA_ERROR = 'No Cursor data'
const PERCENT_MAX = 100
const CENTS_PER_DOLLAR = 100

// Claude plan mapping from rate_limit_tier
const CLAUDE_PLAN_LABELS = {
  claude_max: 'Max',
  claude_pro: 'Pro',
  claude_team: 'Team',
  claude_enterprise: 'Enterprise',
}

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

// Parse usage window (five_hour, seven_day, etc.)
function parseWindow(window) {
  if (!window) {
    return null
  }
  return {
    used: window.utilization || 0,
    reset: window.resets_at || null,
  }
}

// Parse overage spend data (cents → dollars)
function parseOverage(data) {
  const enabled = Boolean(data?.is_enabled)
  return {
    enabled,
    used: enabled ? (data.used_credits || 0) / CENTS_PER_DOLLAR : 0,
    limit: enabled ? (data.monthly_credit_limit || 0) / CENTS_PER_DOLLAR : 0,
  }
}

// Detect Claude plan from rate_limit_tier or capabilities
function detectPlan(account, org) {
  const tier = account?.rate_limit_tier
  if (tier && CLAUDE_PLAN_LABELS[tier]) {
    return CLAUDE_PLAN_LABELS[tier]
  }

  // Fallback to capabilities check
  const caps = org?.capabilities || []
  if (caps.includes('claude_pro')) {
    return 'Pro'
  }
  return 'Free'
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

  const baseUrl = `https://claude.ai/api/organizations/${org.uuid}`

  // Parallel fetch: usage, overage, account
  const [usage, overage, account] = await Promise.all([
    fetchJson(`${baseUrl}/usage`),
    fetchJson(`${baseUrl}/overage_spend_limit`),
    fetchJson('https://claude.ai/api/account'),
  ])

  // Usage is required
  if (usage.status !== 'ok') {
    return usage
  }

  const plan = detectPlan(account.data, org)
  const isMax = plan === 'Max'
  const windows = usage.data || {}

  return {
    status: 'ok',
    data: {
      plan,
      fiveHour: parseWindow(windows.five_hour),
      weekly: isMax ? parseWindow(windows.seven_day) : null,
      opus: isMax ? parseWindow(windows.seven_day_opus) : null,
      sonnet: isMax ? parseWindow(windows.seven_day_sonnet) : null,
      extra: parseOverage(overage.data),
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

  return (
    CURSOR_PLAN_LABELS[normalized] || `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
  )
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
