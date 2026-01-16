// Popup script - fetches and displays usage data

// Theme constants
const THEME_KEY = 'theme'
const DARK = 'dark'
const LIGHT = 'light'

// Visibility constants
const SHOW_CLAUDE_KEY = 'showClaude'
const SHOW_CODEX_KEY = 'showCodex'

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
  return new Promise((resolve) => {
    chrome.storage.local.get([SHOW_CLAUDE_KEY, SHOW_CODEX_KEY], (result) => {
      resolve({
        claude: result[SHOW_CLAUDE_KEY] !== false,
        codex: result[SHOW_CODEX_KEY] !== false,
      })
    })
  })
}

// Save visibility setting
function setVisibility(key, value) {
  chrome.storage.local.set({ [key]: value })
}

// Apply visibility to cards and empty state
function applyVisibility(visibility) {
  const claudeCard = document.querySelector('[data-service="claude"]')
  const codexCard = document.querySelector('[data-service="codex"]')
  const empty = document.getElementById('empty')

  if (claudeCard) {
    claudeCard.classList.toggle('hidden', !visibility.claude)
  }
  if (codexCard) {
    codexCard.classList.toggle('hidden', !visibility.codex)
  }

  const bothHidden = !visibility.claude && !visibility.codex
  if (empty) {
    empty.classList.toggle('hidden', !bothHidden)
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

function getUsagePercent(used, limit) {
  if (limit <= 0) {
    return 0
  }
  const ratio = used / limit
  const percent = Math.round(ratio * MAX_PERCENT)
  return Math.min(MAX_PERCENT, percent)
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
    setField(card, 'weekly-reset', formatResetDate(weekly.reset))
    return
  }

  // Claude: single window
  const used = data.used || 0
  const limit = data.limit || 0
  const percent = getUsagePercent(used, limit)

  setField(card, 'usage', percent)
  updateBar(card, 'bar', percent)

  setField(card, 'reset', formatReset(data.reset))
}

const MS_PER_MINUTE = 60000
const MS_PER_HOUR = 3600000
const MS_PER_DAY = 86400000
const SPIN_DELAY_MS = 300
const MAX_PERCENT = 100
const NOTICE_MESSAGE = 'Fetch failed — showing cached data. Try updating manually.'
const ERROR_MESSAGE = 'Fetch failed. Try updating manually.'
const NOTICE_ID = 'notice'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format reset time as relative (Xh Xm)
function formatReset(timestamp) {
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

// Format reset time as date (Jan 20) or relative if within 24h
function formatResetDate(timestamp) {
  if (!timestamp) {
    return '--'
  }

  const reset = new Date(timestamp)
  const diff = reset - new Date()

  if (diff <= 0) {
    return 'now'
  }

  if (diff < MS_PER_DAY) {
    return formatReset(timestamp)
  }

  return `${MONTHS[reset.getMonth()]} ${reset.getDate()}`
}

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
  if (visibility.claude) {
    showState('claude', 'loading')
  }
  if (visibility.codex) {
    showState('codex', 'loading')
  }

  chrome.runtime
    .sendMessage({ type: 'FETCH_USAGE', force, visibility })
    .then((result) => {
      if (visibility.claude && result.claude.status !== 'hidden') {
        updateCard('claude', result.claude)
      }
      if (visibility.codex && result.codex.status !== 'hidden') {
        updateCard('codex', result.codex)
      }

      if (result?.meta?.cache) {
        setNotice(result.meta.message || NOTICE_MESSAGE)
        return
      }

      setNotice('')
    })
    .catch(() => {
      if (visibility.claude) {
        setError('claude', ERROR_MESSAGE)
      }
      if (visibility.codex) {
        setError('codex', ERROR_MESSAGE)
      }
      setNotice('')
    })
    .finally(() => {
      setTimeout(() => btn.classList.remove('spinning'), SPIN_DELAY_MS)
    })
}

// Initialize visibility settings
async function initVisibility() {
  const visibility = await getVisibility()
  const claudeCheckbox = document.getElementById('show-claude')
  const codexCheckbox = document.getElementById('show-codex')

  // Set checkbox states
  claudeCheckbox.checked = visibility.claude
  codexCheckbox.checked = visibility.codex

  // Apply visibility to cards
  applyVisibility(visibility)

  // Wire up checkbox handlers
  claudeCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked
    setVisibility(SHOW_CLAUDE_KEY, checked)
    applyVisibility({ claude: checked, codex: codexCheckbox.checked })
    if (checked) {
      fetchData()
    }
  })

  codexCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked
    setVisibility(SHOW_CODEX_KEY, checked)
    applyVisibility({ claude: claudeCheckbox.checked, codex: checked })
    if (checked) {
      fetchData()
    }
  })
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
