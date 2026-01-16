// Service Worker - handles API calls and caching

import {
  getCookie,
  isValid,
  getCache,
  setCache,
  isCacheValid,
  fetchClaude,
  fetchCursor,
} from './service-worker-core.js'

const CHATGPT_URL = 'https://chatgpt.com'
const CHATGPT_SESSION_URL = `${CHATGPT_URL}/api/auth/session`
const CHATGPT_USAGE_URL = `${CHATGPT_URL}/backend-api/wham/usage`
const CURSOR_USAGE_URL = 'https://cursor.com/api/usage-summary'
const CURSOR_USER_URL = 'https://cursor.com/api/auth/me'
const CODEX_LOGIN_MESSAGE = 'Log into chatgpt.com to see usage'
const CURSOR_LOGIN_MESSAGE = 'Log into cursor.com to see usage'
const CODEX_TOKEN_MESSAGE = 'No access token in session'

const CACHE_FALLBACK_MESSAGE = 'Fetch failed — showing cached data. Try updating manually.'
const FALLBACK_ERROR_MESSAGE = 'Fetch failed. Try updating manually.'

async function fetchCodex() {
  const cookie = await getCookie('chatgpt')
  console.log('[DEBUG] Codex cookie:', cookie ? 'found' : 'missing')

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
    console.log('[DEBUG] Session result:', sessionData?.accessToken ? 'token found' : 'no token')

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

    return {
      status: 'ok',
      data: {
        plan: data.plan_type || 'Free',
        session: {
          used: primary?.used_percent || 0,
          reset: primary?.reset_at ? primary.reset_at * 1000 : null,
        },
        weekly: {
          used: secondary?.used_percent || 0,
          reset: secondary?.reset_at ? secondary.reset_at * 1000 : null,
        },
      },
    }
  } catch (err) {
    console.log('[DEBUG] Codex fetch error:', err.message)
    return { status: 'error', message: 'Refresh chatgpt.com tab' }
  }
}

async function fetchCursorUsage() {
  const cookie = await getCookie('cursor')
  console.log('[DEBUG] Cursor cookie:', cookie ? 'found' : 'missing')

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
    return fetchCursor({ usage: usageData, user: userData })
  } catch (err) {
    console.log('[DEBUG] Cursor fetch error:', err.message)
    return { status: 'error', message: 'Refresh cursor.com tab' }
  }
}

// ============ Main Handler ============

function isFailure(result) {
  return result?.status === 'error'
}

function normalizeResult(result) {
  if (result.status === 'fulfilled') {
    return result.value
  }

  return { status: 'error', message: FALLBACK_ERROR_MESSAGE }
}

function hasFailure(results) {
  return results.some((result) => {
    if (result.status === 'rejected') {
      return true
    }

    return isFailure(result.value)
  })
}

const HIDDEN_RESULT = { status: 'hidden' }

async function fetchAll(force = false, visibility = { claude: true, codex: true, cursor: true }) {
  const cache = await getCache()
  if (!force && isCacheValid(cache)) {
    return {
      claude: visibility.claude ? cache.claude : HIDDEN_RESULT,
      codex: visibility.codex ? cache.codex : HIDDEN_RESULT,
      cursor: visibility.cursor ? cache.cursor : HIDDEN_RESULT,
    }
  }

  const claudePromise = visibility.claude ? fetchClaude() : Promise.resolve(HIDDEN_RESULT)
  const codexPromise = visibility.codex ? fetchCodex() : Promise.resolve(HIDDEN_RESULT)
  const cursorPromise = visibility.cursor ? fetchCursorUsage() : Promise.resolve(HIDDEN_RESULT)

  const results = await Promise.allSettled([claudePromise, codexPromise, cursorPromise])
  const claude = normalizeResult(results[0])
  const codex = normalizeResult(results[1])
  const cursor = normalizeResult(results[2])
  const result = { claude, codex, cursor }

  // Only cache if we fetched visible providers and they succeeded
  const visibleResults = results.filter((_, i) => {
    if (i === 0) {
      return visibility.claude
    }
    if (i === 1) {
      return visibility.codex
    }
    return visibility.cursor
  })
  if (visibleResults.length > 0 && !hasFailure(visibleResults)) {
    const cacheData = { ...cache }
    if (visibility.claude) {
      cacheData.claude = claude
    }
    if (visibility.codex) {
      cacheData.codex = codex
    }
    if (visibility.cursor) {
      cacheData.cursor = cursor
    }
    await setCache(cacheData)
    return result
  }

  if (cache) {
    return {
      claude: visibility.claude ? cache.claude : HIDDEN_RESULT,
      codex: visibility.codex ? cache.codex : HIDDEN_RESULT,
      cursor: visibility.cursor ? cache.cursor : HIDDEN_RESULT,
      meta: {
        cache: true,
        message: CACHE_FALLBACK_MESSAGE,
      },
    }
  }

  return result
}

async function safeFetchAll(force, visibility) {
  try {
    return await fetchAll(force, visibility)
  } catch (err) {
    console.log('[DEBUG] Fetch all error:', err?.message || err)
    const cache = await getCache()
    if (cache) {
      return {
        claude: visibility.claude ? cache.claude : HIDDEN_RESULT,
        codex: visibility.codex ? cache.codex : HIDDEN_RESULT,
        cursor: visibility.cursor ? cache.cursor : HIDDEN_RESULT,
        meta: {
          cache: true,
          message: CACHE_FALLBACK_MESSAGE,
        },
      }
    }

    const errorResult = { status: 'error', message: FALLBACK_ERROR_MESSAGE }
    return {
      claude: visibility.claude ? errorResult : HIDDEN_RESULT,
      codex: visibility.codex ? errorResult : HIDDEN_RESULT,
      cursor: visibility.cursor ? errorResult : HIDDEN_RESULT,
    }
  }
}

// ============ Message Listener ============

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'FETCH_USAGE') {
    safeFetchAll(message.force, message.visibility).then(respond)
    return true
  }
})

console.log('[AI Usage] Service worker ready')
