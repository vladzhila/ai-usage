// Formatting utilities for popup display

import { MS_PER_MINUTE, MS_PER_HOUR } from './constants.js'

const MS_PER_SECOND = 1000
const MS_TIMESTAMP_THRESHOLD = 1000000000000
const MAX_PERCENT = 100
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

function padTime(value) {
  return String(value).padStart(2, '0')
}

// Format weekly reset as absolute date (Jan 20, 2026 2:05 PM)
export function formatWeeklyReset(timestamp) {
  if (!timestamp) {
    return '--'
  }

  const ms = timestamp < MS_TIMESTAMP_THRESHOLD ? timestamp * MS_PER_SECOND : timestamp
  const reset = new Date(ms)

  if (Number.isNaN(reset.getTime())) {
    return '--'
  }

  const day = reset.getDate()
  const year = reset.getFullYear()
  const hours24 = reset.getHours()
  const hours12 = hours24 % 12 || 12
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const minutes = padTime(reset.getMinutes())

  return `${MONTHS[reset.getMonth()]} ${day}, ${year} ${hours12}${TIME_SEPARATOR}${minutes} ${suffix}`
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
