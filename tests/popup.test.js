import { describe, expect, test, beforeEach } from 'bun:test'
import {
  formatReset,
  formatSessionReset,
  formatWeeklyReset,
  formatCountdown,
  getUsagePercent,
  formatWeeklyResetWithCountdown,
} from '../src/lib/format.js'
import { THRESHOLD_DANGER, THRESHOLD_WARNING } from '../src/lib/constants.js'
import { DEFAULT_ORDER, ORDER_KEY } from '../src/lib/visibility.js'
import { createChromeMock, setStorage, clearMocks } from './mocks/chrome.js'
import { Window } from 'happy-dom'

function getStatus(percentage) {
  if (percentage >= THRESHOLD_DANGER) {
    return 'danger'
  }
  if (percentage >= THRESHOLD_WARNING) {
    return 'warning'
  }
  return 'ok'
}

function withMockedDate(timestamp, fn) {
  const originalNow = Date.now
  const originalDate = globalThis.Date
  globalThis.Date = class extends originalDate {
    constructor(...args) {
      if (args.length === 0) return new originalDate(timestamp)
      return new originalDate(...args)
    }
  }
  Date.now = () => timestamp
  try {
    return fn()
  } finally {
    Date.now = originalNow
    globalThis.Date = originalDate
  }
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

const POPUP_BODY_HTML = `
  <div class="settings-wrap">
    <button id="settings"></button>
    <div id="dropdown">
      <div data-provider="claude" draggable="true"></div>
      <div data-provider="codex" draggable="true"></div>
      <div data-provider="cursor" draggable="true"></div>
    </div>
  </div>
  <button id="refresh"></button>
  <button id="toggle"></button>
  <div id="notice" class="hidden"></div>
  <div id="empty" class="hidden"></div>
  <input type="checkbox" id="show-claude" />
  <input type="checkbox" id="show-codex" />
  <input type="checkbox" id="show-cursor" />
  <div data-service="claude">
    <span class="dot"></span>
    <div data-state="loading"></div>
    <div data-state="ok"></div>
    <div data-state="error"></div>
    <div data-state="logged_out"></div>
    <div data-state="expired"></div>
    <div data-field="plan"></div>
    <div data-field="error"></div>
    <div data-field="session-used"></div>
    <div data-field="session-bar"></div>
    <div class="row" data-row="session-reset"><div data-field="session-reset"></div></div>
    <div data-section="weekly">
      <div data-field="weekly-used"></div>
      <div data-field="weekly-bar"></div>
      <div class="row" data-row="weekly-reset"><div data-field="weekly-reset"></div></div>
    </div>
    <div data-section="opus">
      <div data-field="opus-used"></div>
      <div data-field="opus-bar"></div>
      <div class="row" data-row="opus-reset"><div data-field="opus-reset"></div></div>
    </div>
    <div data-section="extra">
      <div data-field="extra-used"></div>
      <div data-field="extra-limit"></div>
    </div>
  </div>
  <div data-service="codex">
    <span class="dot"></span>
    <div data-state="loading"></div>
    <div data-state="ok"></div>
    <div data-state="error"></div>
    <div data-state="logged_out"></div>
    <div data-state="expired"></div>
    <div data-field="plan"></div>
    <div data-field="error"></div>
    <div data-field="session-used"></div>
    <div data-field="session-bar"></div>
    <div class="row" data-row="session-reset"><div data-field="session-reset"></div></div>
    <div data-field="weekly-used"></div>
    <div data-field="weekly-bar"></div>
    <div class="row" data-row="weekly-reset"><div data-field="weekly-reset"></div></div>
    <div data-section="credits">
      <div data-field="credits-display"></div>
    </div>
  </div>
  <div data-service="cursor">
    <span class="dot"></span>
    <div data-state="loading"></div>
    <div data-state="ok"></div>
    <div data-state="error"></div>
    <div data-state="logged_out"></div>
    <div data-state="expired"></div>
    <div data-field="plan"></div>
    <div data-field="error"></div>
    <div data-field="usage"></div>
    <div data-field="bar"></div>
    <div class="row" data-row="reset"><div data-field="reset"></div></div>
    <div data-section="on-demand">
      <div data-field="on-demand-used"></div>
      <div data-field="on-demand-limit-wrap">
        <div data-field="on-demand-limit"></div>
      </div>
    </div>
    <div data-section="legacy">
      <div data-field="requests"></div>
      <div data-field="max-requests"></div>
    </div>
  </div>
`

const testWindow = new Window()
let popupLoaded = false

function createDocument() {
  const doc = testWindow.document
  doc.documentElement.innerHTML = `<html><body>${POPUP_BODY_HTML}</body></html>`
  globalThis.document = doc
  globalThis.window = testWindow
  globalThis.Event = testWindow.Event
  globalThis.HTMLElement = testWindow.HTMLElement
  globalThis.Node = testWindow.Node
  return doc
}

function createDragEvent(window, type) {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  const dataTransfer = { effectAllowed: 'none' }
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  return event
}

function setStorageValues(values) {
  if (!values) {
    return
  }
  for (const [key, value] of Object.entries(values)) {
    setStorage(key, value)
  }
}

async function setupPopup({ storage, result }) {
  clearMocks()
  const chrome = createChromeMock()
  globalThis.chrome = chrome
  setStorageValues(storage)
  if (!storage || !Object.prototype.hasOwnProperty.call(storage, ORDER_KEY)) {
    setStorage(ORDER_KEY, DEFAULT_ORDER)
  }
  chrome.runtime.sendMessage = async () => result
  const doc = createDocument()
  if (!popupLoaded) {
    await import('../src/popup/popup.js')
    popupLoaded = true
  }
  doc.dispatchEvent(new Event('DOMContentLoaded'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  return doc
}

function buildResult(overrides) {
  const hidden = { status: 'hidden' }
  return {
    claude: hidden,
    codex: hidden,
    cursor: hidden,
    ...overrides,
  }
}

function buildCursorResult(data) {
  return {
    status: 'ok',
    data: {
      plan: 'Pro',
      used: 0,
      limit: 100,
      reset: Date.now() + 60 * 60 * 1000,
      onDemand: 0,
      onDemandLimit: null,
      legacy: null,
      ...data,
    },
  }
}

function buildClaudeResult(data) {
  return {
    status: 'ok',
    data: {
      plan: 'Pro',
      fiveHour: { used: 10, reset: Date.now() + 60 * 60 * 1000 },
      weekly: null,
      opus: null,
      extra: { enabled: false, used: 0, limit: 0 },
      ...data,
    },
  }
}

function buildCodexResult(data) {
  return {
    status: 'ok',
    data: {
      plan: 'Plus',
      session: { used: 10, reset: Date.now() + 60 * 60 * 1000 },
      weekly: { used: 20, reset: Date.now() + 2 * 60 * 60 * 1000 },
      credits: { unlimited: false, has: false, balance: 0 },
      ...data,
    },
  }
}

beforeEach(() => {
  clearMocks()
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
  test('returns empty for null timestamp', () => {
    expect(formatReset(null)).toBe('')
  })

  test('returns "now" for past timestamp', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      expect(formatReset(now - 1000)).toBe('now')
    })
  })

  test('formats hours and minutes', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      const future = now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000
      expect(formatReset(future)).toBe('2h 30m')
    })
  })

  test('formats minutes only when less than hour', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      const future = now + 45 * 60 * 1000
      expect(formatReset(future)).toBe('45m')
    })
  })
})

describe('Popup - formatWeeklyReset', () => {
  test('returns empty for null timestamp', () => {
    expect(formatWeeklyReset(null)).toBe('')
  })

  test('returns empty for invalid timestamp', () => {
    expect(formatWeeklyReset('invalid')).toBe('')
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

describe('Popup - formatSessionReset', () => {
  test('returns absolute time with relative countdown', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      const timestamp = now + 5 * 60 * 60 * 1000 + 30 * 60 * 1000
      expect(formatSessionReset(timestamp)).toBe('5:30 PM (5h 30m)')
    })
  })

  test('returns just absolute time when reset is now', () => {
    const now = Date.UTC(2026, 0, 20, 14, 5, 0)
    withMockedDate(now, () => {
      expect(formatSessionReset(now)).toBe('2:05 PM')
    })
  })

  test('returns empty for null timestamp', () => {
    expect(formatSessionReset(null)).toBe('')
  })

  test('returns empty for invalid date string', () => {
    expect(formatSessionReset('invalid-date')).toBe('')
  })

  test('handles epoch seconds', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      const futureSeconds = Math.ceil(now / 1000) + 2 * 60 * 60
      expect(formatSessionReset(futureSeconds)).toBe('2:00 PM (2h)')
    })
  })

  test('handles ISO string timestamps', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      expect(formatSessionReset('2026-01-20T17:30:00Z')).toBe('5:30 PM (5h 30m)')
    })
  })
})

describe('Popup - formatWeeklyResetWithCountdown', () => {
  test('returns absolute and relative in one string', () => {
    const now = Date.UTC(2026, 0, 20, 12, 0, 0)
    withMockedDate(now, () => {
      const timestamp = now + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
      expect(formatWeeklyResetWithCountdown(timestamp)).toBe(
        `${formatWeeklyReset(timestamp)} (2d 3h)`
      )
    })
  })

  test('returns empty when timestamp is null', () => {
    expect(formatWeeklyResetWithCountdown(null)).toBe('')
  })
})

describe('Popup - DOM updates', () => {
  test('hides cards and shows empty state when all hidden', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: false },
      result: buildResult({}),
    })

    const claudeCard = doc.querySelector('[data-service="claude"]')
    const codexCard = doc.querySelector('[data-service="codex"]')
    const cursorCard = doc.querySelector('[data-service="cursor"]')
    const empty = doc.getElementById('empty')

    expect(claudeCard.classList.contains('hidden')).toBe(true)
    expect(codexCard.classList.contains('hidden')).toBe(true)
    expect(cursorCard.classList.contains('hidden')).toBe(true)
    expect(empty.classList.contains('hidden')).toBe(false)
  })

  test('shows only enabled card when visibility is mixed', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({}),
    })

    const claudeCard = doc.querySelector('[data-service="claude"]')
    const codexCard = doc.querySelector('[data-service="codex"]')
    const cursorCard = doc.querySelector('[data-service="cursor"]')
    const empty = doc.getElementById('empty')

    expect(claudeCard.classList.contains('hidden')).toBe(false)
    expect(codexCard.classList.contains('hidden')).toBe(true)
    expect(cursorCard.classList.contains('hidden')).toBe(true)
    expect(empty.classList.contains('hidden')).toBe(true)
  })

  test('sets bar status to ok below warning threshold', async () => {
    const warningPercent = THRESHOLD_WARNING * 100
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ used: warningPercent - 1, limit: 100 }),
      }),
    })

    const bar = doc.querySelector('[data-service="cursor"] [data-field="bar"]')
    expect(bar.dataset.status).toBe('ok')
  })

  test('sets bar status to warning at threshold', async () => {
    const warningPercent = THRESHOLD_WARNING * 100
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ used: warningPercent, limit: 100 }),
      }),
    })

    const bar = doc.querySelector('[data-service="cursor"] [data-field="bar"]')
    expect(bar.dataset.status).toBe('warning')
  })

  test('sets bar status to danger at threshold', async () => {
    const dangerPercent = THRESHOLD_DANGER * 100
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ used: dangerPercent, limit: 100 }),
      }),
    })

    const bar = doc.querySelector('[data-service="cursor"] [data-field="bar"]')
    expect(bar.dataset.status).toBe('danger')
  })

  test('renders Codex credits as Unlimited', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: true, showCursor: false },
      result: buildResult({
        codex: {
          status: 'ok',
          data: {
            plan: 'Plus',
            session: { used: 10, reset: Date.now() + 60 * 60 * 1000 },
            weekly: { used: 20, reset: Date.now() + 2 * 60 * 60 * 1000 },
            credits: { unlimited: true, has: false, balance: 0 },
          },
        },
      }),
    })

    const creditsSection = doc.querySelector('[data-service="codex"] [data-section="credits"]')
    const creditsDisplay = doc.querySelector(
      '[data-service="codex"] [data-field="credits-display"]'
    )

    expect(creditsSection.style.display).toBe('block')
    expect(creditsDisplay.textContent).toBe('Unlimited')
  })

  test('renders Codex credits balance', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: true, showCursor: false },
      result: buildResult({
        codex: {
          status: 'ok',
          data: {
            plan: 'Plus',
            session: { used: 10, reset: Date.now() + 60 * 60 * 1000 },
            weekly: { used: 20, reset: Date.now() + 2 * 60 * 60 * 1000 },
            credits: { unlimited: false, has: true, balance: 12.34 },
          },
        },
      }),
    })

    const creditsDisplay = doc.querySelector(
      '[data-service="codex"] [data-field="credits-display"]'
    )
    expect(creditsDisplay.textContent).toBe('12.34 credits')
  })

  test('renders Claude extra spend section when enabled', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: {
          status: 'ok',
          data: {
            plan: 'Max',
            fiveHour: { used: 15, reset: Date.now() + 60 * 60 * 1000 },
            weekly: null,
            opus: null,
            extra: { enabled: true, used: 12.3, limit: 45.6 },
          },
        },
      }),
    })

    const extraSection = doc.querySelector('[data-service="claude"] [data-section="extra"]')
    const extraUsed = doc.querySelector('[data-service="claude"] [data-field="extra-used"]')
    const extraLimit = doc.querySelector('[data-service="claude"] [data-field="extra-limit"]')

    expect(extraSection.style.display).toBe('block')
    expect(extraUsed.textContent).toBe('12.30')
    expect(extraLimit.textContent).toBe('45.60')
  })

  test('renders Cursor on-demand and legacy details', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({
          used: 10,
          onDemand: 3.5,
          onDemandLimit: null,
          legacy: { requests: 12, max: 500 },
        }),
      }),
    })

    const onDemandSection = doc.querySelector('[data-service="cursor"] [data-section="on-demand"]')
    const onDemandUsed = doc.querySelector('[data-service="cursor"] [data-field="on-demand-used"]')
    const onDemandLimitWrap = doc.querySelector(
      '[data-service="cursor"] [data-field="on-demand-limit-wrap"]'
    )
    const legacySection = doc.querySelector('[data-service="cursor"] [data-section="legacy"]')
    const legacyRequests = doc.querySelector('[data-service="cursor"] [data-field="requests"]')
    const legacyMax = doc.querySelector('[data-service="cursor"] [data-field="max-requests"]')

    expect(onDemandSection.style.display).toBe('block')
    expect(onDemandUsed.textContent).toBe('3.50')
    expect(onDemandLimitWrap.style.display).toBe('none')
    expect(legacySection.style.display).toBe('block')
    expect(legacyRequests.textContent).toBe('12')
    expect(legacyMax.textContent).toBe('500')
  })

  test('renders Cursor on-demand limit when provided', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({
          used: 10,
          onDemand: 2.25,
          onDemandLimit: 10,
          legacy: null,
        }),
      }),
    })

    const onDemandLimitWrap = doc.querySelector(
      '[data-service="cursor"] [data-field="on-demand-limit-wrap"]'
    )
    const onDemandLimit = doc.querySelector(
      '[data-service="cursor"] [data-field="on-demand-limit"]'
    )

    expect(onDemandLimitWrap.style.display).toBe('')
    expect(onDemandLimit.textContent).toBe('10.00')
  })

  test('toggles theme based on stored value and click', async () => {
    const doc = await setupPopup({
      storage: { theme: 'dark', showClaude: false, showCodex: false, showCursor: false },
      result: buildResult({}),
    })

    expect(doc.body.classList.contains('dark')).toBe(true)
    doc.getElementById('toggle').click()
    expect(doc.body.classList.contains('dark')).toBe(false)
  })

  test('toggles dropdown and closes on outside click', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: false },
      result: buildResult({}),
    })

    const dropdown = doc.getElementById('dropdown')
    const wasHidden = dropdown.classList.contains('hidden')
    doc.getElementById('settings').click()
    expect(dropdown.classList.contains('hidden')).toBe(!wasHidden)

    doc.body.dispatchEvent(new Event('click', { bubbles: true }))
    expect(dropdown.classList.contains('hidden')).toBe(true)
  })

  test('handles notice message when cache is used', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: {
        ...buildResult({
          claude: buildClaudeResult({}),
        }),
        meta: { cache: true, message: 'Cached response' },
      },
    })

    const notice = doc.getElementById('notice')
    expect(notice.textContent).toBe('Cached response')
    expect(notice.classList.contains('hidden')).toBe(false)
  })

  test('clears notice when no cache meta provided', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: buildClaudeResult({}),
      }),
    })

    const notice = doc.getElementById('notice')
    expect(notice.textContent).toBe('')
    expect(notice.classList.contains('hidden')).toBe(true)
  })

  test('shows errors when fetch fails', async () => {
    clearMocks()
    const chrome = createChromeMock()
    globalThis.chrome = chrome
    chrome.runtime.sendMessage = async () => {
      throw new Error('network')
    }
    const doc = createDocument()
    if (!popupLoaded) {
      await import('../src/popup/popup.js')
      popupLoaded = true
    }
    doc.dispatchEvent(new Event('DOMContentLoaded'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const errorField = doc.querySelector('[data-service="claude"] [data-field="error"]')
    const dot = doc.querySelector('[data-service="claude"] .dot')
    expect(errorField.textContent).toBe('Fetch failed. Try updating manually.')
    expect(dot.dataset.status).toBe('error')
  })

  test('skips error update when card is missing', async () => {
    clearMocks()
    const chrome = createChromeMock()
    globalThis.chrome = chrome
    chrome.runtime.sendMessage = async () => {
      throw new Error('network')
    }
    const doc = createDocument()
    doc.querySelector('[data-service="cursor"]').remove()
    if (!popupLoaded) {
      await import('../src/popup/popup.js')
      popupLoaded = true
    }
    doc.dispatchEvent(new Event('DOMContentLoaded'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const claudeDot = doc.querySelector('[data-service="claude"] .dot')
    expect(claudeDot.dataset.status).toBe('error')
  })

  test('handles missing notice and card elements gracefully', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: true },
      result: buildResult({
        claude: { status: 'error' },
        cursor: buildCursorResult({}),
      }),
    })

    doc.getElementById('notice').remove()
    doc.querySelector('[data-service="cursor"]').remove()
    doc.getElementById('refresh').click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const claudeDot = doc.querySelector('[data-service="claude"] .dot')
    expect(claudeDot.dataset.status).toBe('error')
  })

  test('handles missing empty state element', async () => {
    clearMocks()
    const chrome = createChromeMock()
    globalThis.chrome = chrome
    chrome.runtime.sendMessage = async () => buildResult({})
    const doc = createDocument()
    doc.getElementById('empty').remove()
    if (!popupLoaded) {
      await import('../src/popup/popup.js')
      popupLoaded = true
    }
    doc.dispatchEvent(new Event('DOMContentLoaded'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const claudeCard = doc.querySelector('[data-service="claude"]')
    expect(claudeCard).toBeTruthy()
  })

  test('shows unknown state without matching state element', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: { status: 'weird', message: 'oops' },
      }),
    })

    const dot = doc.querySelector('[data-service="claude"] .dot')
    expect(dot.dataset.status).toBe('weird')
  })

  test('skips missing fields and sections', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: true, showCursor: true },
      result: buildResult({
        claude: buildClaudeResult({}),
        codex: buildCodexResult({ credits: { unlimited: true, has: true, balance: 0 } }),
        cursor: buildCursorResult({ used: 30 }),
      }),
    })

    doc.querySelector('[data-service="claude"] [data-field="plan"]').remove()
    doc.querySelector('[data-service="codex"] [data-section="credits"]').remove()
    doc.querySelector('[data-service="cursor"] [data-field="bar"]').remove()
    doc.getElementById('refresh').click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const cursorUsage = doc.querySelector('[data-service="cursor"] [data-field="usage"]')
    expect(cursorUsage.textContent).toBe('30')
  })

  test('updates Claude weekly and opus sections', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: buildClaudeResult({
          weekly: { used: 40, reset: Date.now() + 2 * 60 * 60 * 1000 },
          opus: { used: 55, reset: Date.now() + 3 * 60 * 60 * 1000 },
        }),
      }),
    })

    const weeklySection = doc.querySelector('[data-service="claude"] [data-section="weekly"]')
    const opusSection = doc.querySelector('[data-service="claude"] [data-section="opus"]')
    expect(weeklySection.style.display).toBe('block')
    expect(opusSection.style.display).toBe('block')
  })

  test('hides Codex credits section when no credits', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: true, showCursor: false },
      result: buildResult({
        codex: buildCodexResult({ credits: { unlimited: false, has: false, balance: 0 } }),
      }),
    })

    const creditsSection = doc.querySelector('[data-service="codex"] [data-section="credits"]')
    expect(creditsSection.style.display).toBe('none')
  })

  test('hides Cursor on-demand and legacy sections when empty', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ onDemand: 0, legacy: null }),
      }),
    })

    const onDemandSection = doc.querySelector('[data-service="cursor"] [data-section="on-demand"]')
    const legacySection = doc.querySelector('[data-service="cursor"] [data-section="legacy"]')
    expect(onDemandSection.style.display).toBe('none')
    expect(legacySection.style.display).toBe('none')
  })

  test('updates visibility on checkbox change and fetches when enabled', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: false },
      result: buildResult({
        claude: buildClaudeResult({}),
        codex: buildCodexResult({}),
        cursor: buildCursorResult({}),
      }),
    })

    const claudeCheckbox = doc.getElementById('show-claude')
    claudeCheckbox.checked = true
    claudeCheckbox.dispatchEvent(new Event('change', { bubbles: true }))

    const codexCheckbox = doc.getElementById('show-codex')
    codexCheckbox.checked = true
    codexCheckbox.dispatchEvent(new Event('change', { bubbles: true }))

    const cursorCheckbox = doc.getElementById('show-cursor')
    cursorCheckbox.checked = true
    cursorCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const claudeCard = doc.querySelector('[data-service="claude"]')
    expect(claudeCard.classList.contains('hidden')).toBe(false)
  })

  test('clears refresh spinner after delay', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: buildClaudeResult({}),
      }),
    })

    const refresh = doc.getElementById('refresh')
    refresh.click()
    expect(refresh.classList.contains('spinning')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(refresh.classList.contains('spinning')).toBe(false)
  })

  test('reorders cards via drag and drop', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: true, showCursor: true },
      result: buildResult({}),
    })

    const dropdown = doc.getElementById('dropdown')
    const claudeItem = dropdown.querySelector('[data-provider="claude"]')
    const cursorItem = dropdown.querySelector('[data-provider="cursor"]')

    claudeItem.dispatchEvent(createDragEvent(globalThis.window, 'dragstart'))
    cursorItem.dispatchEvent(createDragEvent(globalThis.window, 'dragover'))
    cursorItem.dispatchEvent(createDragEvent(globalThis.window, 'drop'))
    claudeItem.dispatchEvent(createDragEvent(globalThis.window, 'dragend'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const updatedOrder = (await globalThis.chrome.storage.local.get(ORDER_KEY))[ORDER_KEY]
    expect(updatedOrder.includes('claude')).toBe(true)
    expect(updatedOrder[2]).toBe('claude')
  })

  test('ignores drop when no drag source or same target', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: true, showCursor: true },
      result: buildResult({}),
    })

    const dropdown = doc.getElementById('dropdown')
    const codexItem = dropdown.querySelector('[data-provider="codex"]')

    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'drop'))
    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'dragstart'))
    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'drop'))
    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'dragend'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const stored = await globalThis.chrome.storage.local.get(ORDER_KEY)
    expect(stored[ORDER_KEY]).toEqual(DEFAULT_ORDER)
  })

  test('removes drag-over class on drag leave', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: true, showCursor: true },
      result: buildResult({}),
    })

    const dropdown = doc.getElementById('dropdown')
    const claudeItem = dropdown.querySelector('[data-provider="claude"]')
    const codexItem = dropdown.querySelector('[data-provider="codex"]')

    claudeItem.dispatchEvent(createDragEvent(globalThis.window, 'dragstart'))
    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'dragover'))
    expect(codexItem.classList.contains('drag-over')).toBe(true)
    codexItem.dispatchEvent(createDragEvent(globalThis.window, 'dragleave'))
    expect(codexItem.classList.contains('drag-over')).toBe(false)
  })

  test('shows reset row when reset timestamp is valid', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ reset: Date.now() + 60 * 60 * 1000 }),
      }),
    })

    const resetRow = doc.querySelector('[data-service="cursor"] [data-row="reset"]')
    expect(resetRow.style.display).toBe('')
  })

  test('hides reset row when reset timestamp is null', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ reset: null }),
      }),
    })

    const resetRow = doc.querySelector('[data-service="cursor"] [data-row="reset"]')
    expect(resetRow.style.display).toBe('none')
  })

  test('hides Claude session reset row when timestamp is missing', async () => {
    const doc = await setupPopup({
      storage: { showClaude: true, showCodex: false, showCursor: false },
      result: buildResult({
        claude: buildClaudeResult({
          fiveHour: { used: 10, reset: null },
        }),
      }),
    })

    const resetRow = doc.querySelector('[data-service="claude"] [data-row="session-reset"]')
    expect(resetRow.style.display).toBe('none')
  })

  test('shows Codex session reset row when timestamp is valid', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: true, showCursor: false },
      result: buildResult({
        codex: buildCodexResult({
          session: { used: 10, reset: Date.now() + 60 * 60 * 1000 },
        }),
      }),
    })

    const resetRow = doc.querySelector('[data-service="codex"] [data-row="session-reset"]')
    expect(resetRow.style.display).toBe('')
  })

  test('handles missing reset field element gracefully', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ reset: Date.now() + 60 * 60 * 1000 }),
      }),
    })

    doc.querySelector('[data-service="cursor"] [data-field="reset"]').remove()
    doc.getElementById('refresh').click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const dot = doc.querySelector('[data-service="cursor"] .dot')
    expect(dot.dataset.status).toBe('ok')
  })

  test('handles reset field without row parent gracefully', async () => {
    const doc = await setupPopup({
      storage: { showClaude: false, showCodex: false, showCursor: true },
      result: buildResult({
        cursor: buildCursorResult({ reset: Date.now() + 60 * 60 * 1000 }),
      }),
    })

    const resetRow = doc.querySelector('[data-service="cursor"] [data-row="reset"]')
    const resetField = doc.querySelector('[data-service="cursor"] [data-field="reset"]')
    resetRow.parentNode.appendChild(resetField)
    resetRow.remove()
    doc.getElementById('refresh').click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(resetField.textContent).toBeTruthy()
  })
})
