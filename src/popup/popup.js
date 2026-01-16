// Popup script - fetches and displays usage data

import { formatReset, formatWeeklyReset, getUsagePercent } from '../lib/format.js'
import { SERVICES, parseVisibility, isAllHidden } from '../lib/visibility.js'

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
  if (theme === DARK) {
    document.body.classList.add(DARK)
  } else {
    document.body.classList.remove(DARK)
  }
}

// Toggle between themes
function toggleTheme() {
  const current = document.body.classList.contains(DARK) ? DARK : LIGHT
  const next = current === DARK ? LIGHT : DARK
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

  // Codex: dual windows (session + weekly)
  if (service === 'codex') {
    const session = data.session || {}
    const weekly = data.weekly || {}

    setField(card, 'session-used', session.used || 0)
    updateBar(card, 'session-bar', session.used || 0)
    setField(card, 'session-reset', formatReset(session.reset))

    setField(card, 'weekly-used', weekly.used || 0)
    updateBar(card, 'weekly-bar', weekly.used || 0)
    setField(card, 'weekly-reset', formatWeeklyReset(weekly.reset))
    return
  }

  // Claude + Cursor: single window
  const used = data.used || 0
  const limit = data.limit || 0
  const percent = getUsagePercent(used, limit)

  setField(card, 'usage', percent)
  updateBar(card, 'bar', percent)

  if (service === 'cursor') {
    setField(card, 'reset', formatWeeklyReset(data.reset))
    return
  }

  setField(card, 'reset', formatReset(data.reset))
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

  if (!message) {
    notice.textContent = ''
    notice.classList.add('hidden')
    return
  }

  notice.textContent = message
  notice.classList.remove('hidden')
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
  fetchData()
  document.getElementById('refresh').addEventListener('click', () => fetchData(true))
  document.getElementById('toggle').addEventListener('click', toggleTheme)
  document.getElementById('settings').addEventListener('click', toggleDropdown)
  document.addEventListener('click', handleClickOutside)
})
