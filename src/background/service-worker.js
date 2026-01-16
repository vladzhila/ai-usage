// Service Worker - handles API calls and caching

import {
  getCookie,
  isValid,
  getCache,
  setCache,
  isCacheValid,
  fetchClaude,
} from './service-worker-core.js'

const CACHE_FALLBACK_MESSAGE = 'Fetch failed — showing cached data. Try updating manually.'
const FALLBACK_ERROR_MESSAGE = 'Fetch failed. Try updating manually.'

async function fetchCodex() {
  const cookie = await getCookie('chatgpt')
  console.log('[DEBUG] Codex cookie:', cookie ? 'found' : 'missing')

  if (!isValid('chatgpt', cookie)) {
    return { status: 'logged_out', message: 'Log into chatgpt.com to see usage' }
  }

  // Find a chatgpt.com tab
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' })
  console.log('[DEBUG] Found chatgpt.com tabs:', tabs.length)

  if (tabs.length === 0) {
    return {
      status: 'error',
      message: 'Open chatgpt.com in a tab',
    }
  }

  try {
    // Step 1: Get access token from session API
    const session = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: async () => {
        try {
          const res = await fetch('https://chatgpt.com/api/auth/session', {
            credentials: 'include',
          })
          if (!res.ok) {
            return { error: `Session HTTP ${res.status}` }
          }
          return res.json()
        } catch (err) {
          return { error: err.message }
        }
      },
    })

    const sessionData = session?.[0]?.result
    console.log('[DEBUG] Session result:', sessionData?.accessToken ? 'token found' : 'no token')

    if (sessionData?.error) {
      return { status: 'error', message: sessionData.error }
    }

    const token = sessionData?.accessToken
    if (!token) {
      return { status: 'expired', message: 'No access token in session' }
    }

    // Step 2: Fetch usage with Bearer token
    const usage = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: async (bearerToken) => {
        try {
          const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
            credentials: 'include',
            headers: {
              Authorization: `Bearer ${bearerToken}`,
            },
          })

          if (res.status === 401 || res.status === 403) {
            return { status: 'expired' }
          }

          if (!res.ok) {
            return { status: 'error', message: `HTTP ${res.status}` }
          }

          const data = await res.json()
          const primary = data.rate_limit?.primary_window
          const secondary = data.rate_limit?.secondary_window

          const toMs = (seconds) => (seconds ? seconds * 1000 : null)

          return {
            status: 'ok',
            data: {
              plan: data.plan_type || 'Free',
              session: {
                used: primary?.used_percent || 0,
                reset: toMs(primary?.reset_at),
              },
              weekly: {
                used: secondary?.used_percent || 0,
                reset: toMs(secondary?.reset_at),
              },
            },
          }
        } catch (err) {
          return { status: 'error', message: err.message }
        }
      },
      args: [token],
    })

    const result = usage?.[0]?.result
    console.log('[DEBUG] Codex usage result:', JSON.stringify(result, null, 2))
    return result || { status: 'error', message: 'No result from script' }
  } catch (err) {
    console.log('[DEBUG] Script execution error:', err.message)
    return { status: 'error', message: 'Refresh chatgpt.com tab' }
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

async function fetchAll(force = false, visibility = { claude: true, codex: true }) {
  const cache = await getCache()
  if (!force && isCacheValid(cache)) {
    return {
      claude: visibility.claude ? cache.claude : HIDDEN_RESULT,
      codex: visibility.codex ? cache.codex : HIDDEN_RESULT,
    }
  }

  const claudePromise = visibility.claude ? fetchClaude() : Promise.resolve(HIDDEN_RESULT)
  const codexPromise = visibility.codex ? fetchCodex() : Promise.resolve(HIDDEN_RESULT)

  const results = await Promise.allSettled([claudePromise, codexPromise])
  const claude = normalizeResult(results[0])
  const codex = normalizeResult(results[1])
  const result = { claude, codex }

  // Only cache if we fetched visible providers and they succeeded
  const visibleResults = results.filter((_, i) => (i === 0 ? visibility.claude : visibility.codex))
  if (visibleResults.length > 0 && !hasFailure(visibleResults)) {
    const cacheData = { ...cache }
    if (visibility.claude) {
      cacheData.claude = claude
    }
    if (visibility.codex) {
      cacheData.codex = codex
    }
    await setCache(cacheData)
    return result
  }

  if (cache) {
    return {
      claude: visibility.claude ? cache.claude : HIDDEN_RESULT,
      codex: visibility.codex ? cache.codex : HIDDEN_RESULT,
      meta: {
        cache: true,
        message: CACHE_FALLBACK_MESSAGE,
      },
    }
  }

  return result
}

// ============ Message Listener ============

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'FETCH_USAGE') {
    fetchAll(message.force, message.visibility).then(respond)
    return true
  }
})

console.log('[AI Usage] Service worker ready')
