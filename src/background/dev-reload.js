const DEV_RELOAD_FILE = 'dev-reload.json'
const DEV_RELOAD_KEY = 'stamp'
const DEV_RELOAD_POLL_MS = 1000

async function readStamp(fetchFn, url, now) {
  const response = await fetchFn(`${url}?t=${now()}`, { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) {
    return null
  }

  const data = await response.json().catch(() => null)
  const stamp = data?.[DEV_RELOAD_KEY]
  return typeof stamp === 'number' ? stamp : null
}

export async function startDevReload(options = {}) {
  const fetchFn = options.fetchFn || fetch
  const runtime = options.runtime || chrome?.runtime
  const now = options.now || Date.now
  const setTimer = options.setTimer || setInterval
  const clearTimer = options.clearTimer || clearInterval

  if (!runtime?.getURL || !runtime?.reload) {
    return false
  }

  const url = runtime.getURL(DEV_RELOAD_FILE)
  const state = { stamp: await readStamp(fetchFn, url, now) }

  if (state.stamp === null) {
    return false
  }

  async function poll() {
    const nextStamp = await readStamp(fetchFn, url, now)
    if (nextStamp === null || nextStamp === state.stamp) {
      return
    }
    state.stamp = nextStamp
    runtime.reload()
  }

  const timer = setTimer(poll, DEV_RELOAD_POLL_MS)
  return { stop: () => clearTimer(timer) }
}
