// Content script to fetch Codex usage from within chatgpt.com context
// This runs in the page context so it can access the auth token

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'FETCH_CODEX_USAGE') {
    fetchCodexUsage().then(respond)
    return true
  }
})

async function fetchCodexUsage() {
  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      credentials: 'include',
    })

    if (response.status === 401 || response.status === 403) {
      return { status: 'expired' }
    }

    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` }
    }

    const data = await response.json()

    // Extract usage from response
    const primary = data.rate_limit?.primary_window
    const secondary = data.rate_limit?.secondary_window

    // Use secondary (weekly) window as main usage metric
    const window = secondary || primary

    return {
      status: 'ok',
      data: {
        plan: data.plan_type || 'Free',
        used: window?.used_percent || 0,
        limit: 100, // percentage
        reset: window?.reset_at ? window.reset_at * 1000 : null, // convert to ms
        raw: data,
      },
    }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}
