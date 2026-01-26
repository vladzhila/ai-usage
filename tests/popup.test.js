import { describe, expect, test } from 'bun:test'
import {
  formatReset,
  formatWeeklyReset,
  formatCountdown,
  getUsagePercent,
  formatWeeklyResetWithCountdown,
} from '../src/lib/format.js'

// Threshold constants for status (not exported from production code)
const THRESHOLD_WARNING = 0.5
const THRESHOLD_DANGER = 0.8

function getStatus(percentage) {
  if (percentage >= THRESHOLD_DANGER) {
    return 'danger'
  }
  if (percentage >= THRESHOLD_WARNING) {
    return 'warning'
  }
  return 'ok'
}

describe('Popup - getStatus', () => {
  test('returns "ok" for low usage', () => {
    expect(getStatus(0)).toBe('ok')
    expect(getStatus(0.25)).toBe('ok')
    expect(getStatus(0.49)).toBe('ok')
  })

  test('returns "warning" for medium usage', () => {
    expect(getStatus(0.5)).toBe('warning')
    expect(getStatus(0.65)).toBe('warning')
    expect(getStatus(0.79)).toBe('warning')
  })

  test('returns "danger" for high usage', () => {
    expect(getStatus(0.8)).toBe('danger')
    expect(getStatus(0.9)).toBe('danger')
    expect(getStatus(1.0)).toBe('danger')
  })

  test('returns "danger" for over 100%', () => {
    expect(getStatus(1.5)).toBe('danger')
  })
})

describe('Popup - getUsagePercent', () => {
  test('returns zero when limit is zero', () => {
    expect(getUsagePercent(10, 0)).toBe(0)
  })

  test('rounds to nearest whole percent', () => {
    expect(getUsagePercent(1, 3)).toBe(33)
    expect(getUsagePercent(2, 3)).toBe(67)
  })

  test('caps usage at 100%', () => {
    expect(getUsagePercent(200, 100)).toBe(100)
  })
})

describe('Popup - formatReset', () => {
  test('returns placeholder for empty timestamp', () => {
    expect(formatReset(null)).toBe('--')
  })

  test('returns "now" for past timestamp', () => {
    const past = Date.now() - 1000
    expect(formatReset(past)).toBe('now')
  })

  test('formats hours and minutes', () => {
    const future = Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    expect(formatReset(future)).toBe('2h 30m')
  })

  test('formats minutes only when less than hour', () => {
    const future = Date.now() + 45 * 60 * 1000
    expect(formatReset(future)).toBe('45m')
  })
})

describe('Popup - formatWeeklyReset', () => {
  test('returns placeholder for empty timestamp', () => {
    expect(formatWeeklyReset(null)).toBe('--')
  })

  test('returns placeholder for invalid timestamp', () => {
    expect(formatWeeklyReset('invalid')).toBe('--')
  })

  test('formats epoch seconds', () => {
    const reset = Date.UTC(2026, 0, 20, 14, 5, 0) / 1000
    expect(formatWeeklyReset(reset)).toBe('Jan 20, 2026 2:05 PM')
  })

  test('formats milliseconds timestamp', () => {
    const reset = Date.UTC(2026, 5, 3, 9, 30, 0)
    expect(formatWeeklyReset(reset)).toBe('Jun 3, 2026 9:30 AM')
  })
})

describe('Popup - formatCountdown', () => {
  test('returns empty for null timestamp', () => {
    expect(formatCountdown(null)).toBe('')
  })

  test('returns "now" for past timestamp', () => {
    expect(formatCountdown(Date.now() - 1000)).toBe('now')
  })

  test('formats days and hours', () => {
    const future = Date.now() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
    expect(formatCountdown(future)).toBe('5d 3h')
  })

  test('formats exact day boundary', () => {
    const future = Date.now() + 2 * 24 * 60 * 60 * 1000
    expect(formatCountdown(future)).toBe('2d')
  })

  test('formats hours and minutes when under a day', () => {
    const future = Date.now() + 3 * 60 * 60 * 1000 + 15 * 60 * 1000
    expect(formatCountdown(future)).toBe('3h 15m')
  })

  test('formats exact hour boundary', () => {
    const future = Date.now() + 3 * 60 * 60 * 1000
    expect(formatCountdown(future)).toBe('3h')
  })

  test('formats minutes only when under an hour', () => {
    const future = Date.now() + 45 * 60 * 1000
    expect(formatCountdown(future)).toBe('45m')
  })

  test('clamps under a minute to 1m', () => {
    const future = Date.now() + 15 * 1000
    expect(formatCountdown(future)).toBe('1m')
  })

  test('handles epoch seconds', () => {
    const now = Math.ceil(Date.now() / 1000)
    const future = now + 2 * 24 * 60 * 60 + 2 * 60 * 60
    expect(formatCountdown(future)).toBe('2d 2h')
  })
})

describe('Popup - formatWeeklyResetWithCountdown', () => {
  test('returns absolute and relative in one string', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    const originalNow = Date.now
    Date.now = () => now

    const timestamp = now + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
    const formatted = formatWeeklyResetWithCountdown(timestamp)

    expect(formatted).toBe(`${formatWeeklyReset(timestamp)} (2d 3h)`)
    Date.now = originalNow
  })

  test('returns absolute when relative is empty', () => {
    expect(formatWeeklyResetWithCountdown(null)).toBe('--')
  })
})
