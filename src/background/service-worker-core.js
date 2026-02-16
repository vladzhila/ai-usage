import { PERCENT_MAX } from '../lib/constants.js'

export const CACHE_KEY = 'usage_cache'
export const CACHE_TTL = 60000
export const FETCH_ERROR_MESSAGE = 'Fetch failed'

const CURSOR_DATA_ERROR = 'No Cursor data'
const CENTS_PER_DOLLAR = 100

const CLAUDE_PLAN_LABELS = {
  claude_max: 'Max',
  claude_pro: 'Pro',
  claude_team: 'Team',
  claude_enterprise: 'Enterprise',
  claude_ultra: 'Ultra',
}

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

const CURSOR_PLAN_LABELS = {
  free: 'Free',
  cursor_free: 'Free',
  enterprise: 'Enterprise',
  pro: 'Pro',
  pro_plus: 'Pro+',
  ultra: 'Ultra',
  hobby: 'Hobby',
  team: 'Team',
}

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

function parseWindow(window) {
  if (!window) {
    return null
  }
  return {
    used: window.utilization || 0,
    reset: window.resets_at || null,
  }
}

// Converts cents-based fields to dollars.
function parseOverage(data, grantData) {
  const enabled = Boolean(data?.is_enabled)
  const used = enabled ? (data.used_credits || 0) / CENTS_PER_DOLLAR : 0
  const limit = enabled ? (data.monthly_credit_limit || 0) / CENTS_PER_DOLLAR : 0
  const percent = limit > 0 ? Math.min(PERCENT_MAX, Math.round((used / limit) * PERCENT_MAX)) : 0
  const grantAmount =
    enabled && grantData?.granted ? (grantData.amount_minor_units || 0) / CENTS_PER_DOLLAR : null
  const balance = grantAmount !== null ? Math.max(0, grantAmount - used) : null
  return { enabled, used, limit, percent, balance }
}

// Heuristics for Claude plan when tier is missing.
function detectPlan(account, org) {
  const tier = org?.rate_limit_tier || account?.rate_limit_tier
  const normalizedTier = tier ? String(tier).toLowerCase() : ''
  const known = normalizedTier ? CLAUDE_PLAN_LABELS[normalizedTier] : null
  if (known) {
    return known
  }

  if (normalizedTier.includes('ultra')) {
    return 'Ultra'
  }
  if (normalizedTier.includes('max')) {
    return 'Max'
  }

  const caps = org?.capabilities || []
  if (caps.includes('claude_ultra')) {
    return 'Ultra'
  }
  if (caps.includes('claude_max')) {
    return 'Max'
  }
  if (caps.includes('claude_pro')) {
    return 'Pro'
  }

  const billing = account?.billing_type ? String(account.billing_type).toLowerCase() : ''
  if (billing.includes('stripe') && (!normalizedTier || normalizedTier.includes('claude'))) {
    return 'Pro'
  }

  return 'Free'
}

export async function fetchClaude() {
  const orgs = await fetchJson('https://claude.ai/api/organizations')
  if (orgs.status === 'expired') {
    return { status: 'logged_out', message: 'Log into claude.ai to see usage' }
  }
  if (orgs.status !== 'ok') {
    return orgs
  }

  const org = orgs.data?.[0]
  if (!org?.uuid) {
    return { status: 'error', message: 'No organization found' }
  }

  const baseUrl = `https://claude.ai/api/organizations/${org.uuid}`

  const [usage, overage, account, creditGrant] = await Promise.all([
    fetchJson(`${baseUrl}/usage`),
    fetchJson(`${baseUrl}/overage_spend_limit`),
    fetchJson('https://claude.ai/api/account'),
    fetchJson(`${baseUrl}/overage_credit_grant`),
  ])

  if (usage.status === 'expired') {
    return { status: 'logged_out', message: 'Log into claude.ai to see usage' }
  }
  if (usage.status !== 'ok') {
    return usage
  }

  const plan = detectPlan(account.data, org)
  const hasModelWindows = plan === 'Max' || plan === 'Ultra'
  const windows = usage.data || {}

  return {
    status: 'ok',
    data: {
      plan,
      fiveHour: parseWindow(windows.five_hour),
      weekly: parseWindow(windows.seven_day),
      opus: hasModelWindows ? parseWindow(windows.seven_day_opus) : null,
      sonnet: hasModelWindows ? parseWindow(windows.seven_day_sonnet) : null,
      extra: parseOverage(overage.data, creditGrant.data),
    },
  }
}

function toPercent(used, limit) {
  if (!limit || limit <= 0) {
    return 0
  }

  const ratio = used / limit
  return Math.round(ratio * PERCENT_MAX)
}

export function parseCursorSummary(payload) {
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
  const onDemand = individual?.onDemand || {}

  const planUsedRaw = Number(plan.used || 0)
  const planLimitRaw = Number(plan.limit ?? 0)
  const percent = toPercent(planUsedRaw, planLimitRaw)

  const totalPercent = plan.totalPercentUsed
  const fallbackPercent =
    totalPercent !== null && totalPercent !== undefined
      ? Math.round((totalPercent <= 1 ? totalPercent : totalPercent / PERCENT_MAX) * PERCENT_MAX)
      : null

  const resolvedPercent = planLimitRaw > 0 ? percent : (fallbackPercent ?? 0)

  const onDemandUsedRaw = Number(onDemand.used || 0)
  const onDemandUsed = onDemandUsedRaw / CENTS_PER_DOLLAR
  const onDemandLimitRaw = onDemand.limit
  const onDemandLimit =
    onDemandLimitRaw !== null && onDemandLimitRaw !== undefined
      ? onDemandLimitRaw / CENTS_PER_DOLLAR
      : null

  const cycleEnd = summary?.billingCycleEnd
  const reset = cycleEnd ? Date.parse(cycleEnd) : null

  return {
    status: 'ok',
    data: {
      plan: formatCursorPlan(summary?.membershipType),
      used: resolvedPercent,
      limit: PERCENT_MAX,
      reset: Number.isNaN(reset) ? null : reset,
      onDemand: onDemandUsed,
      onDemandLimit,
      email: user?.email || null,
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
      onDemandLimit: null,
      email: user?.email || null,
      legacy: { requests: used, max },
    },
  }
}
