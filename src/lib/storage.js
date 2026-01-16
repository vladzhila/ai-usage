import {
  STORAGE_KEYS,
  CHATGPT_SESSION_WINDOW_MS,
  CLAUDE_SESSION_WINDOW_MS,
  createDefaultUsageData,
  getWeekStart,
} from './constants.js'

// Get all usage data from storage
export async function getUsageData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      if (!data || Object.keys(data).length === 0) {
        const defaults = createDefaultUsageData()
        resolve(defaults)
      } else {
        resolve(data)
      }
    })
  })
}

// Save usage data to storage
export async function saveUsageData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve)
  })
}

// Increment message count for a service
export async function incrementCount(service) {
  const data = await getUsageData()
  const serviceData = data[service]
  if (!serviceData) {
    return
  }

  const now = Date.now()
  const windowMs =
    service === STORAGE_KEYS.CHATGPT ? CHATGPT_SESSION_WINDOW_MS : CLAUDE_SESSION_WINDOW_MS

  // Check if session window expired - reset if so
  if (now - serviceData.session.windowStart >= windowMs) {
    serviceData.session.count = 0
    serviceData.session.windowStart = now
  }

  // Check if week rolled over
  const currentWeekStart = getWeekStart()
  if (serviceData.weekly.weekStart < currentWeekStart) {
    serviceData.weekly.count = 0
    serviceData.weekly.weekStart = currentWeekStart
  }

  // Increment counts
  serviceData.session.count++
  serviceData.weekly.count++

  await saveUsageData({ [service]: serviceData })
  return serviceData
}

// Update API spend data
export async function updateApiSpend(service, spend) {
  const data = await getUsageData()
  data[service] = {
    spend,
    updatedAt: Date.now(),
  }
  await saveUsageData({ [service]: data[service] })
  return data[service]
}

// Get time remaining until session reset
export function getTimeUntilReset(service, windowStart) {
  const windowMs =
    service === STORAGE_KEYS.CHATGPT ? CHATGPT_SESSION_WINDOW_MS : CLAUDE_SESSION_WINDOW_MS
  const elapsed = Date.now() - windowStart
  const remaining = Math.max(0, windowMs - elapsed)
  return remaining
}

// Format milliseconds to human readable (e.g., "2h 14m")
export function formatTimeRemaining(ms) {
  if (ms <= 0) {
    return 'now'
  }
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

// Format timestamp to relative time (e.g., "3h ago")
export function formatUpdatedAt(timestamp) {
  if (!timestamp) {
    return 'never'
  }
  const diff = Date.now() - timestamp
  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor(diff / (60 * 1000))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }
  if (hours > 0) {
    return `${hours}h ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'just now'
}
