// Service worker fetches usage and caches results.

import {
  getCookie,
  isValid,
  getCache,
  setCache,
  isCacheValid,
  fetchClaude,
  parseCursorSummary,
  formatCodexPlan,
  parseLegacyCursor,
} from './service-worker-core.js'
import { startDevReload } from './dev-reload.js'
import { CACHE_FALLBACK_MESSAGE, FETCH_FALLBACK_MESSAGE } from '../lib/constants.js'

const CHATGPT_URL = 'https://chatgpt.com'
const CHATGPT_SESSION_URL = `${CHATGPT_URL}/api/auth/session`
const CHATGPT_USAGE_URL = `${CHATGPT_URL}/backend-api/wham/usage`
const CURSOR_USAGE_URL = 'https://cursor.com/api/usage-summary'
const CURSOR_USER_URL = 'https://cursor.com/api/auth/me'
const CURSOR_LEGACY_URL = 'https://cursor.com/api/usage'
const CODEX_LOGIN_MESSAGE = 'Log into chatgpt.com to see usage'
const CURSOR_LOGIN_MESSAGE = 'Log into cursor.com to see usage'
const CODEX_TOKEN_MESSAGE = 'No access token in session'

export async function fetchCodex() {
  const cookie = await getCookie('chatgpt')

  if (!isValid('chatgpt', cookie)) {
    return { status: 'logged_out', message: CODEX_LOGIN_MESSAGE }
  }

  try {
    const session = await fetch(CHATGPT_SESSION_URL, { credentials: 'include' })
    if (session.status === 401 || session.status === 403) {
      return { status: 'expired' }
    }

    if (!session.ok) {
      return { status: 'error', message: `Session HTTP ${session.status}` }
    }

    const sessionData = await session.json()

    const token = sessionData?.accessToken
    if (!token) {
      return { status: 'expired', message: CODEX_TOKEN_MESSAGE }
    }

    const usage = await fetch(CHATGPT_USAGE_URL, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (usage.status === 401 || usage.status === 403) {
      return { status: 'expired' }
    }

    if (!usage.ok) {
      return { status: 'error', message: `HTTP ${usage.status}` }
    }

    const data = await usage.json()
    const primary = data.rate_limit?.primary_window
    const secondary = data.rate_limit?.secondary_window
    const credits = data.credits || {}

    return {
      status: 'ok',
      data: {
        plan: formatCodexPlan(data.plan_type),
        session: {
          used: primary?.used_percent || 0,
          reset: primary?.reset_at ? primary.reset_at * 1000 : null,
        },
        weekly: {
          used: secondary?.used_percent || 0,
          reset: secondary?.reset_at ? secondary.reset_at * 1000 : null,
        },
        credits: {
          has: Boolean(credits.has_credits),
          unlimited: Boolean(credits.unlimited),
          balance: parseFloat(credits.balance) || 0,
        },
      },
    }
  } catch {
    return { status: 'error', message: 'Refresh chatgpt.com tab' }
  }
}

export async function fetchCursorUsage() {
  const cookie = await getCookie('cursor')

  if (!isValid('cursor', cookie)) {
    return { status: 'logged_out', message: CURSOR_LOGIN_MESSAGE }
  }

  try {
    const [usage, user] = await Promise.all([
      fetch(CURSOR_USAGE_URL, { credentials: 'include' }),
      fetch(CURSOR_USER_URL, { credentials: 'include' }),
    ])

    if ([usage, user].some((response) => response.status === 401 || response.status === 403)) {
      return { status: 'expired' }
    }

    if (!usage.ok) {
      return { status: 'error', message: `HTTP ${usage.status}` }
    }

    if (!user.ok) {
      return { status: 'error', message: `HTTP ${user.status}` }
    }

    const usageData = await usage.json()
    const userData = await user.json()

    // Fallback for legacy Cursor accounts without individualUsage.
    if (!usageData?.individualUsage && userData?.sub) {
      const legacy = await fetch(`${CURSOR_LEGACY_URL}?user=${userData.sub}`, {
        credentials: 'include',
      })
      if (legacy.ok) {
        const legacyData = await legacy.json()
        return parseLegacyCursor(legacyData, userData)
      }
    }

    return parseCursorSummary({ usage: usageData, user: userData })
  } catch {
    return { status: 'error', message: 'Refresh cursor.com tab' }
  }
}

function normalizeResult(result) {
  return result.status === 'fulfilled'
    ? result.value
    : { status: 'error', message: FETCH_FALLBACK_MESSAGE }
}

function hasFailure(results) {
  return results.some((r) => r.status === 'rejected' || r.value?.status !== 'ok')
}

const HIDDEN_RESULT = { status: 'hidden' }

function buildResponse(visibility, data, meta) {
  const response = {
    claude: visibility.claude ? data.claude : HIDDEN_RESULT,
    codex: visibility.codex ? data.codex : HIDDEN_RESULT,
    cursor: visibility.cursor ? data.cursor : HIDDEN_RESULT,
  }
  if (meta) {
    response.meta = meta
  }
  return response
}

export async function fetchAll(
  force = false,
  visibility = { claude: true, codex: true, cursor: true }
) {
  const cache = await getCache()
  if (!force && isCacheValid(cache)) {
    return buildResponse(visibility, cache)
  }

  const claudePromise = visibility.claude ? fetchClaude() : Promise.resolve(HIDDEN_RESULT)
  const codexPromise = visibility.codex ? fetchCodex() : Promise.resolve(HIDDEN_RESULT)
  const cursorPromise = visibility.cursor ? fetchCursorUsage() : Promise.resolve(HIDDEN_RESULT)

  const results = await Promise.allSettled([claudePromise, codexPromise, cursorPromise])
  const claude = normalizeResult(results[0])
  const codex = normalizeResult(results[1])
  const cursor = normalizeResult(results[2])
  const result = { claude, codex, cursor }

  // Cache only when all requested providers succeed.
  const providers = ['claude', 'codex', 'cursor']
  const visibleResults = results.filter((_, i) => visibility[providers[i]])
  if (visibleResults.length > 0 && !hasFailure(visibleResults)) {
    const cacheData = {
      ...cache,
      ...(visibility.claude && { claude }),
      ...(visibility.codex && { codex }),
      ...(visibility.cursor && { cursor }),
    }
    await setCache(cacheData)
    return result
  }

  if (cache) {
    return buildResponse(visibility, cache, { cache: true, message: CACHE_FALLBACK_MESSAGE })
  }

  return result
}

export async function safeFetchAll(force, visibility) {
  try {
    return await fetchAll(force, visibility)
  } catch {
    const cache = await getCache()
    if (cache) {
      return buildResponse(visibility, cache, { cache: true, message: CACHE_FALLBACK_MESSAGE })
    }

    const errorResult = { status: 'error', message: FETCH_FALLBACK_MESSAGE }
    return buildResponse(visibility, {
      claude: errorResult,
      codex: errorResult,
      cursor: errorResult,
    })
  }
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'FETCH_USAGE') {
    safeFetchAll(message.force, message.visibility).then(respond)
    return true
  }
})

startDevReload()
