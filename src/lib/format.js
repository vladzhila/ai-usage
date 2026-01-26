import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from './constants.js'

const MS_PER_SECOND = 1000
// Heuristic to treat values as seconds vs ms.
const MS_TIMESTAMP_THRESHOLD = 1000000000000
const MAX_PERCENT = 100
const MIN_MINUTES = 1
const TIME_SEPARATOR = ':'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format reset time as relative (Xh Xm)
export function formatReset(timestamp) {
  if (!timestamp) {
    return '--'
  }

  const diff = new Date(timestamp) - new Date()

  if (diff <= 0) {
    return 'now'
  }

  const hours = Math.floor(diff / MS_PER_HOUR)
  const mins = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE)

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}

// Format time as 12-hour (2:05 PM)
function formatTime12h(date) {
  const hours24 = date.getHours()
  const hours12 = hours24 % 12 || 12
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const minutes = padTime(date.getMinutes())
  return `${hours12}${TIME_SEPARATOR}${minutes} ${suffix}`
}

// Normalize timestamp to milliseconds (handles ISO strings, seconds, and ms)
function toMs(timestamp) {
  if (typeof timestamp === 'string') {
    return Date.parse(timestamp)
  }
  if (timestamp < MS_TIMESTAMP_THRESHOLD) {
    return timestamp * MS_PER_SECOND
  }
  return timestamp
}

// Format session reset as absolute time with relative countdown (2:05 PM (5h 30m))
export function formatSessionReset(timestamp) {
  if (!timestamp) {
    return '--'
  }

  const ms = toMs(timestamp)
  const reset = new Date(ms)

  if (Number.isNaN(reset.getTime())) {
    return '--'
  }

  const absolute = formatTime12h(reset)
  const relative = formatCountdown(ms)

  if (!relative || relative === 'now') {
    return absolute
  }
  return `${absolute} (${relative})`
}

function padTime(value) {
  return String(value).padStart(2, '0')
}

// Format weekly reset as absolute date (Jan 20, 2026 2:05 PM)
export function formatWeeklyReset(timestamp) {
  if (!timestamp) {
    return '--'
  }

  const ms = toMs(timestamp)
  const reset = new Date(ms)

  if (Number.isNaN(reset.getTime())) {
    return '--'
  }

  const day = reset.getDate()
  const year = reset.getFullYear()

  return `${MONTHS[reset.getMonth()]} ${day}, ${year} ${formatTime12h(reset)}`
}

// Calculate usage percentage capped at 100
export function getUsagePercent(used, limit) {
  if (limit <= 0) {
    return 0
  }
  const ratio = used / limit
  const percent = Math.round(ratio * MAX_PERCENT)
  return Math.min(MAX_PERCENT, percent)
}

// Format countdown as relative (Xd Xh or Xh Xm)
export function formatCountdown(timestamp) {
  if (!timestamp) {
    return ''
  }

  const ms = toMs(timestamp)
  const diff = ms - Date.now()

  if (diff <= 0) {
    return 'now'
  }

  const days = Math.floor(diff / MS_PER_DAY)
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR)

  if (days > 0) {
    if (hours > 0) {
      return `${days}d ${hours}h`
    }
    return `${days}d`
  }

  const mins = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE)
  if (hours > 0) {
    if (mins > 0) {
      return `${hours}h ${mins}m`
    }
    return `${hours}h`
  }
  return `${Math.max(MIN_MINUTES, mins)}m`
}

export function formatWeeklyResetWithCountdown(timestamp) {
  const absolute = formatWeeklyReset(timestamp)
  const relative = formatCountdown(timestamp)
  if (!relative) {
    return absolute
  }
  return `${absolute} (${relative})`
}
