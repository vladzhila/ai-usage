// Core service worker logic - extracted for testability

export const CACHE_KEY = 'usage_cache'
export const CACHE_TTL = 60000 // 1 minute
export const FETCH_ERROR_MESSAGE = 'Fetch failed'

const CURSOR_DATA_ERROR = 'No Cursor data'
const PERCENT_MAX = 100
const CENTS_PER_DOLLAR = 100

// Claude plan mapping from rate_limit_tier
const CLAUDE_PLAN_LABELS = {
  claude_max: 'Max',
  claude_pro: 'Pro',
  claude_team: 'Team',
  claude_enterprise: 'Enterprise',
  claude_ultra: 'Ultra',
}

// ChatGPT/Codex plan mapping
const CODEX_PLAN_LABELS = {
  guest: 'Guest',
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  free_workspace: 'Free Workspace',
  team: 'Team',
  business: 'Business',
  education: 'Education',
  quorum: 'Quorum',
  k12: 'K-12',
  enterprise: 'Enterprise',
  edu: 'Education',
}

// Cursor plan mapping
const CURSOR_PLAN_LABELS = {
  free: 'Free',
  enterprise: 'Enterprise',
  pro: 'Pro',
  hobby: 'Hobby',
  team: 'Team',
}

// Shared plan formatter
function formatPlan(type, labels, fallback) {
  if (!type) {
    return fallback
  }
  const key = String(type).trim().toLowerCase()
  if (!key) {
    return fallback
  }
  return labels[key] || `${key.charAt(0).toUpperCase()}${key.slice(1)}`
}

export function formatCodexPlan(type) {
  return formatPlan(type, CODEX_PLAN_LABELS, 'Free')
}

function formatCursorPlan(type) {
  return formatPlan(type, CURSOR_PLAN_LABELS, 'Cursor')
}

export const SERVICES = {
  claude: {
    urls: ['https://claude.ai'],
    cookies: ['sessionKey'],
    prefix: 'sk-ant-',
  },
  chatgpt: {
    urls: ['https://chatgpt.com'],
    cookies: ['__Secure-next-auth.session-token', 'next-auth.session-token'],
    prefix: null,
  },
  cursor: {
    urls: ['https://cursor.com', 'https://cursor.sh'],
    cookies: [
      'WorkosCursorSessionToken',
      '__Secure-next-auth.session-token',
      'next-auth.session-token',
    ],
    prefix: null,
  },
}

export async function getCookie(service) {
  const config = SERVICES[service]
  if (!config) {
    return null
  }

  for (const url of config.urls) {
    for (const name of config.cookies) {
      // eslint-disable-next-line no-await-in-loop
      const cookie = await chrome.cookies.get({ url, name })
      if (cookie?.value) {
        return cookie.value
      }
    }
  }

  return null
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
  const normalizedTier = tier ? String(tier).toLowerCase() : ''
  const known = normalizedTier ? CLAUDE_PLAN_LABELS[normalizedTier] : null
  if (known) {
    return known
  }
  if (normalizedTier.includes('ultra')) {
    return 'Ultra'
  }

  const billing = account?.billing_type ? String(account.billing_type).toLowerCase() : ''
  if (billing.includes('stripe') && (!normalizedTier || normalizedTier.includes('claude'))) {
    return 'Pro'
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
  const isMaxOrUltra = plan === 'Max' || plan === 'Ultra'
  const windows = usage.data || {}

  return {
    status: 'ok',
    data: {
      plan,
      fiveHour: parseWindow(windows.five_hour),
      weekly: isMaxOrUltra ? parseWindow(windows.seven_day) : null,
      opus: isMaxOrUltra ? parseWindow(windows.seven_day_opus) : null,
      sonnet: isMaxOrUltra ? parseWindow(windows.seven_day_sonnet) : null,
      extra: parseOverage(overage.data),
    },
  }
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
  const planBreakdown = plan?.breakdown || {}
  const onDemand = individual?.onDemand || {}

  const planUsedRaw = Number(plan.used || 0)
  const planLimitRaw = Number(planBreakdown.total ?? plan.limit ?? 0)
  const percent = toPercent(planUsedRaw, planLimitRaw)

  const totalPercent = plan.totalPercentUsed
  const fallbackPercent =
    totalPercent !== null && totalPercent !== undefined
      ? Math.round((totalPercent <= 1 ? totalPercent : totalPercent / PERCENT_MAX) * PERCENT_MAX)
      : null

  const resolvedPercent = planLimitRaw > 0 ? percent : (fallbackPercent ?? 0)

  const onDemandUsedRaw = Number(onDemand.used || 0)
  const onDemandUsed = onDemandUsedRaw / CENTS_PER_DOLLAR

  const cycleEnd = summary?.billingCycleEnd
  const reset = cycleEnd ? Date.parse(cycleEnd) : null

  // Percentage breakdown (auto vs api)
  const autoPercent = plan.autoPercentUsed
  const apiPercent = plan.apiPercentUsed

  // Team on-demand usage
  const teamOnDemand = summary?.teamUsage?.onDemand || {}
  const hasTeam = teamOnDemand.used !== null && teamOnDemand.used !== undefined

  return {
    status: 'ok',
    data: {
      plan: formatCursorPlan(summary?.membershipType),
      used: resolvedPercent,
      limit: PERCENT_MAX,
      reset: Number.isNaN(reset) ? null : reset,
      onDemand: onDemandUsed,
      email: user?.email || null,
      breakdown: {
        auto:
          autoPercent !== null && autoPercent !== undefined
            ? Math.round(autoPercent * PERCENT_MAX)
            : null,
        api:
          apiPercent !== null && apiPercent !== undefined
            ? Math.round(apiPercent * PERCENT_MAX)
            : null,
      },
      team: hasTeam
        ? {
            used: teamOnDemand.used / CENTS_PER_DOLLAR,
            limit: teamOnDemand.limit ? teamOnDemand.limit / CENTS_PER_DOLLAR : null,
          }
        : null,
    },
  }
}

export function parseLegacyCursor(data, user) {
  if (!data) {
    return { status: 'error', message: CURSOR_DATA_ERROR }
  }

  const gpt4 = data['gpt-4'] || {}
  const used = gpt4.numRequestsTotal || gpt4.numRequests || 0
  const max = gpt4.maxRequestUsage || 500
  const percent = toPercent(used, max)

  return {
    status: 'ok',
    data: {
      plan: 'Legacy',
      used: percent,
      limit: PERCENT_MAX,
      reset: null,
      onDemand: 0,
      email: user?.email || null,
      breakdown: { auto: null, api: null },
      team: null,
      legacy: { requests: used, max },
    },
  }
}

export function fetchCursor(payload) {
  return parseCursorSummary(payload)
}
