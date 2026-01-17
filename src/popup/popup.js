// Popup script - fetches and displays usage data

import { formatReset, formatWeeklyReset, getUsagePercent } from '../lib/format.js'
import { SERVICES, parseVisibility, isAllHidden, ORDER_KEY, parseOrder } from '../lib/visibility.js'

// Theme constants
const THEME_KEY = 'theme'
const DARK = 'dark'
const LIGHT = 'light'

// Get stored theme
function getTheme() {
  return new Promise((resolve) => {
    chrome.storage.local.get(THEME_KEY, (result) => {
      resolve(result[THEME_KEY] || LIGHT)
    })
  })
}

// Save and apply theme
function setTheme(theme) {
  chrome.storage.local.set({ [THEME_KEY]: theme })
  document.body.classList.toggle(DARK, theme === DARK)
}

// Toggle between themes
function toggleTheme() {
  const next = document.body.classList.contains(DARK) ? LIGHT : DARK
  setTheme(next)
}

// Initialize theme on load
async function initTheme() {
  const theme = await getTheme()
  setTheme(theme)
}

// Get visibility settings from storage
function getVisibility() {
  const keys = SERVICES.map((s) => s.key)
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(parseVisibility(result))
    })
  })
}

// Save visibility setting
function setVisibility(key, value) {
  chrome.storage.local.set({ [key]: value })
}

// Get order from storage
function getOrder() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ORDER_KEY, (result) => {
      resolve(parseOrder(result))
    })
  })
}

// Save order to storage
function setOrder(order) {
  chrome.storage.local.set({ [ORDER_KEY]: order })
}

// Apply CSS order to cards and dropdown items
function applyOrder(order) {
  const dropdown = document.getElementById('dropdown')
  order.forEach((provider, index) => {
    const card = document.querySelector(`[data-service="${provider}"]`)
    const item = dropdown.querySelector(`[data-provider="${provider}"]`)
    if (card) {
      card.style.order = index
    }
    if (item) {
      item.style.order = index
    }
  })
}

// Initialize order and drag-drop on load
async function initOrder() {
  const order = await getOrder()
  applyOrder(order)

  const dropdown = document.getElementById('dropdown')
  const items = dropdown.querySelectorAll('[draggable="true"]')
  let dragged = null

  function onDragStart(e) {
    dragged = e.currentTarget
    dragged.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    dragged.classList.remove('dragging')
    items.forEach((i) => i.classList.remove('drag-over'))
    dragged = null
  }

  function onDragOver(e) {
    e.preventDefault()
    const target = e.currentTarget
    if (dragged && dragged !== target) {
      target.classList.add('drag-over')
    }
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over')
  }

  async function onDrop(e) {
    e.preventDefault()
    const target = e.currentTarget
    target.classList.remove('drag-over')

    if (!dragged || dragged === target) {
      return
    }

    // Capture before await (dragend may null dragged during async)
    const from = dragged.dataset.provider
    const to = target.dataset.provider
    const current = await getOrder()
    const fromIdx = current.indexOf(from)
    const toIdx = current.indexOf(to)

    current.splice(fromIdx, 1)
    current.splice(toIdx, 0, from)
    setOrder(current)
    applyOrder(current)
  }

  items.forEach((item) => {
    item.addEventListener('dragstart', onDragStart)
    item.addEventListener('dragend', onDragEnd)
    item.addEventListener('dragover', onDragOver)
    item.addEventListener('dragleave', onDragLeave)
    item.addEventListener('drop', onDrop)
  })
}

// Run callback for each visible service
function forEachVisible(visibility, callback) {
  for (const s of SERVICES) {
    if (visibility[s.name]) {
      callback(s.name)
    }
  }
}

// Apply visibility to cards and empty state
function applyVisibility(visibility) {
  const claudeCard = document.querySelector('[data-service="claude"]')
  const codexCard = document.querySelector('[data-service="codex"]')
  const cursorCard = document.querySelector('[data-service="cursor"]')
  const empty = document.getElementById('empty')

  if (claudeCard) {
    claudeCard.classList.toggle('hidden', !visibility.claude)
  }
  if (codexCard) {
    codexCard.classList.toggle('hidden', !visibility.codex)
  }
  if (cursorCard) {
    cursorCard.classList.toggle('hidden', !visibility.cursor)
  }

  if (empty) {
    empty.classList.toggle('hidden', !isAllHidden(visibility))
  }
}

// Toggle dropdown visibility
function toggleDropdown() {
  const dropdown = document.getElementById('dropdown')
  dropdown.classList.toggle('hidden')
}

// Close dropdown when clicking outside
function handleClickOutside(event) {
  const wrap = document.querySelector('.settings-wrap')
  const dropdown = document.getElementById('dropdown')
  if (wrap && !wrap.contains(event.target)) {
    dropdown.classList.add('hidden')
  }
}

// Show specific state for a card
function showState(service, state) {
  const card = document.querySelector(`[data-service="${service}"]`)
  if (!card) {
    return
  }

  // Hide all states
  card.querySelectorAll('[data-state]').forEach((el) => {
    el.style.display = 'none'
  })

  // Show target state
  const target = card.querySelector(`[data-state="${state}"]`)
  if (target) {
    target.style.display = 'block'
  }

  // Update status dot
  const dot = card.querySelector('.dot')
  if (dot) {
    dot.dataset.status = state
  }
}

// Update progress bar
function updateBar(card, field, percent) {
  const bar = card.querySelector(`[data-field="${field}"]`)
  if (!bar) {
    return
  }
  bar.style.width = `${percent}%`
  if (percent >= 80) {
    bar.dataset.status = 'danger'
  } else if (percent >= 50) {
    bar.dataset.status = 'warning'
  } else {
    bar.dataset.status = 'ok'
  }
}

// Set text content of a field within a card
function setField(card, field, value) {
  const el = card.querySelector(`[data-field="${field}"]`)
  if (el) {
    el.textContent = value
  }
}

// Show/hide a section element
function showSection(card, name, visible) {
  const section = card.querySelector(`[data-section="${name}"]`)
  if (section) {
    section.style.display = visible ? 'block' : 'none'
  }
}

// Update a usage window section (used %, bar, reset)
function updateWindow(card, prefix, window, formatter) {
  setField(card, `${prefix}-used`, window.used || 0)
  updateBar(card, `${prefix}-bar`, window.used || 0)
  setField(card, `${prefix}-reset`, formatter(window.reset))
}

// Format dollar amount with 2 decimal places
function formatDollars(amount) {
  return (amount || 0).toFixed(2)
}

// Update card with data
function updateCard(service, result) {
  const card = document.querySelector(`[data-service="${service}"]`)
  if (!card) {
    return
  }

  // Handle non-ok status
  if (result.status !== 'ok') {
    showState(service, result.status)
    if (result.message) {
      setField(card, 'error', result.message)
    }
    return
  }

  // Show ok state
  showState(service, 'ok')
  const data = result.data

  setField(card, 'plan', data.plan || 'Unknown')

  // Claude: multi-window (session + weekly/opus for Max + extra)
  if (service === 'claude') {
    const { fiveHour, weekly, opus, extra = {} } = data

    // Session window (always shown)
    if (fiveHour) {
      updateWindow(card, 'session', fiveHour, formatReset)
    }

    // Weekly/Opus sections (Max only)
    showSection(card, 'weekly', weekly)
    if (weekly) {
      updateWindow(card, 'weekly', weekly, formatWeeklyReset)
    }

    showSection(card, 'opus', opus)
    if (opus) {
      updateWindow(card, 'opus', opus, formatWeeklyReset)
    }

    // Extra spend section
    showSection(card, 'extra', extra.enabled)
    if (extra.enabled) {
      setField(card, 'extra-used', formatDollars(extra.used))
      setField(card, 'extra-limit', formatDollars(extra.limit))
    }
    return
  }

  // Codex: dual windows (session + weekly) + credits
  if (service === 'codex') {
    const { session = {}, weekly = {}, credits = {} } = data
    updateWindow(card, 'session', session, formatReset)
    updateWindow(card, 'weekly', weekly, formatWeeklyReset)

    // Credits section
    const hasCredits = credits.has || credits.unlimited || credits.balance > 0
    showSection(card, 'credits', hasCredits)
    if (hasCredits) {
      const display = credits.unlimited ? 'Unlimited' : `$${credits.balance.toFixed(2)}`
      setField(card, 'credits-display', display)
    }
    return
  }

  // Cursor: single window + breakdown/legacy/team
  const used = data.used || 0
  const limit = data.limit || 0
  const percent = getUsagePercent(used, limit)

  setField(card, 'usage', percent)
  updateBar(card, 'bar', percent)
  setField(card, 'reset', formatWeeklyReset(data.reset))

  // Breakdown section
  const breakdown = data.breakdown || {}
  const hasBreakdown = breakdown.auto !== null || breakdown.api !== null
  showSection(card, 'breakdown', hasBreakdown)
  if (hasBreakdown) {
    setField(card, 'auto-percent', breakdown.auto ?? 0)
    setField(card, 'api-percent', breakdown.api ?? 0)
  }

  // Legacy section
  const legacy = data.legacy
  showSection(card, 'legacy', Boolean(legacy))
  if (legacy) {
    setField(card, 'requests', legacy.requests)
    setField(card, 'max-requests', legacy.max)
  }

  // Team section
  const team = data.team
  showSection(card, 'team', Boolean(team))
  if (team) {
    setField(card, 'team-used', team.used.toFixed(2))
    const limitWrap = card.querySelector('[data-field="team-limit-wrap"]')
    if (limitWrap) {
      limitWrap.style.display = team.limit ? '' : 'none'
    }
    if (team.limit) {
      setField(card, 'team-limit', team.limit.toFixed(2))
    }
  }
}

const SPIN_DELAY_MS = 300
const NOTICE_MESSAGE = 'Fetch failed — showing cached data. Try updating manually.'
const ERROR_MESSAGE = 'Fetch failed. Try updating manually.'
const NOTICE_ID = 'notice'

function setNotice(message) {
  const notice = document.getElementById(NOTICE_ID)
  if (!notice) {
    return
  }
  notice.textContent = message || ''
  notice.classList.toggle('hidden', !message)
}

function setError(service, message) {
  const card = document.querySelector(`[data-service="${service}"]`)
  if (!card) {
    return
  }

  showState(service, 'error')
  setField(card, 'error', message)
}

// Fetch data from service worker
async function fetchData(force = false) {
  const btn = document.getElementById('refresh')
  btn.classList.add('spinning')

  const visibility = await getVisibility()

  // Show loading only for visible providers
  forEachVisible(visibility, (name) => showState(name, 'loading'))

  chrome.runtime
    .sendMessage({ type: 'FETCH_USAGE', force, visibility })
    .then((result) => {
      if (visibility.claude && result.claude.status !== 'hidden') {
        updateCard('claude', result.claude)
      }
      if (visibility.codex && result.codex.status !== 'hidden') {
        updateCard('codex', result.codex)
      }
      if (visibility.cursor && result.cursor && result.cursor.status !== 'hidden') {
        updateCard('cursor', result.cursor)
      }

      if (result?.meta?.cache) {
        setNotice(result.meta.message || NOTICE_MESSAGE)
        return
      }

      setNotice('')
    })
    .catch(() => {
      forEachVisible(visibility, (name) => setError(name, ERROR_MESSAGE))
      setNotice('')
    })
    .finally(() => {
      setTimeout(() => btn.classList.remove('spinning'), SPIN_DELAY_MS)
    })
}

// Initialize visibility settings
async function initVisibility() {
  const visibility = await getVisibility()
  const checkboxes = {}

  // Set checkbox states and build lookup
  for (const s of SERVICES) {
    const checkbox = document.getElementById(s.id)
    checkboxes[s.name] = checkbox
    checkbox.checked = visibility[s.name]
  }

  // Apply visibility to cards
  applyVisibility(visibility)

  // Wire up checkbox handlers
  for (const s of SERVICES) {
    checkboxes[s.name].addEventListener('change', (e) => {
      const checked = e.target.checked
      setVisibility(s.key, checked)

      const updated = {}
      for (const svc of SERVICES) {
        updated[svc.name] = svc.name === s.name ? checked : checkboxes[svc.name].checked
      }
      applyVisibility(updated)

      if (checked) {
        fetchData()
      }
    })
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  initVisibility()
  initOrder()
  fetchData()
  document.getElementById('refresh').addEventListener('click', () => fetchData(true))
  document.getElementById('toggle').addEventListener('click', toggleTheme)
  document.getElementById('settings').addEventListener('click', toggleDropdown)
  document.addEventListener('click', handleClickOutside)
})
