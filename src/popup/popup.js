import {
  formatSessionReset,
  getUsagePercent,
  formatWeeklyResetWithCountdown,
} from '../lib/format.js'
import {
  THRESHOLD_DANGER,
  THRESHOLD_WARNING,
  CACHE_FALLBACK_MESSAGE,
  FETCH_FALLBACK_MESSAGE,
} from '../lib/constants.js'
import { SERVICES, parseVisibility, isAllHidden, ORDER_KEY, parseOrder } from '../lib/visibility.js'

const THEME_KEY = 'theme'
const DARK = 'dark'
const LIGHT = 'light'
const WARNING_PERCENT = THRESHOLD_WARNING * 100
const DANGER_PERCENT = THRESHOLD_DANGER * 100

function getTheme() {
  return new Promise((resolve) => {
    chrome.storage.local.get(THEME_KEY, (result) => {
      resolve(result[THEME_KEY] || LIGHT)
    })
  })
}

function setTheme(theme) {
  chrome.storage.local.set({ [THEME_KEY]: theme })
  document.body.classList.toggle(DARK, theme === DARK)
}

function toggleTheme() {
  const next = document.body.classList.contains(DARK) ? LIGHT : DARK
  setTheme(next)
}

async function initTheme() {
  const theme = await getTheme()
  setTheme(theme)
}

function getCard(service) {
  return document.querySelector(`[data-service="${service}"]`)
}

function getVisibility() {
  const keys = SERVICES.map((s) => s.key)
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(parseVisibility(result))
    })
  })
}

function setVisibility(key, value) {
  chrome.storage.local.set({ [key]: value })
}

function getOrder() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ORDER_KEY, (result) => {
      resolve(parseOrder(result))
    })
  })
}

function setOrder(order) {
  chrome.storage.local.set({ [ORDER_KEY]: order })
}

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

    // dragend can clear `dragged` during the await.
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

function applyVisibility(visibility) {
  for (const { name } of SERVICES) {
    const card = document.querySelector(`[data-service="${name}"]`)
    if (card) {
      card.classList.toggle('hidden', !visibility[name])
    }
  }

  const empty = document.getElementById('empty')
  if (!empty) {
    return
  }
  empty.classList.toggle('hidden', !isAllHidden(visibility))
}

function toggleDropdown() {
  const dropdown = document.getElementById('dropdown')
  dropdown.classList.toggle('hidden')
}

function handleClickOutside(event) {
  const wrap = document.querySelector('.settings-wrap')
  const dropdown = document.getElementById('dropdown')
  if (wrap && !wrap.contains(event.target)) {
    dropdown.classList.add('hidden')
  }
}

function showState(service, state) {
  const card = getCard(service)
  if (!card) {
    return
  }

  card.querySelectorAll('[data-state]').forEach((el) => {
    el.style.display = 'none'
  })

  const target = card.querySelector(`[data-state="${state}"]`)
  if (target) {
    target.style.display = 'block'
  }

  const dot = card.querySelector('.dot')
  if (dot) {
    dot.dataset.status = state
  }
}

function updateBar(card, field, percent) {
  const bar = card.querySelector(`[data-field="${field}"]`)
  if (!bar) {
    return
  }
  bar.style.width = `${percent}%`
  if (percent >= DANGER_PERCENT) {
    bar.dataset.status = 'danger'
    return
  }
  if (percent >= WARNING_PERCENT) {
    bar.dataset.status = 'warning'
    return
  }
  bar.dataset.status = 'ok'
}

function setField(card, field, value) {
  const el = card.querySelector(`[data-field="${field}"]`)
  if (el) {
    el.textContent = value
  }
}

function setResetField(card, field, timestamp, formatter) {
  const el = card.querySelector(`[data-field="${field}"]`)
  if (!el) {
    return
  }
  const value = formatter(timestamp)
  el.textContent = value
  const row = el.closest('.row')
  if (row) {
    row.style.display = value ? '' : 'none'
  }
}

function showSection(card, name, visible) {
  const section = card.querySelector(`[data-section="${name}"]`)
  if (section) {
    section.style.display = visible ? 'block' : 'none'
  }
}

function updateWindow(card, prefix, window, formatter) {
  setField(card, `${prefix}-used`, window.used || 0)
  updateBar(card, `${prefix}-bar`, window.used || 0)
  setResetField(card, `${prefix}-reset`, window.reset, formatter)
}

function updateWeeklyWindow(card, prefix, window) {
  updateWindow(card, prefix, window, formatWeeklyResetWithCountdown)
}

function formatDollars(amount) {
  return (amount || 0).toFixed(2)
}

function updateClaudeCard(card, data) {
  const { fiveHour, weekly, sonnet, extra = {} } = data

  if (fiveHour) {
    updateWindow(card, 'session', fiveHour, formatSessionReset)
  }

  showSection(card, 'weekly', weekly)
  if (weekly) {
    updateWeeklyWindow(card, 'weekly', weekly)
  }

  showSection(card, 'sonnet', sonnet)
  if (sonnet) {
    updateWeeklyWindow(card, 'sonnet', sonnet)
  }

  showSection(card, 'extra', extra.enabled)
  if (!extra.enabled) {
    return
  }
  setField(card, 'extra-used', formatDollars(extra.used))
  setField(card, 'extra-limit', formatDollars(extra.limit))
}

function updateCodexCard(card, data) {
  const { session = {}, weekly = {}, credits = {} } = data
  updateWindow(card, 'session', session, formatSessionReset)
  updateWeeklyWindow(card, 'weekly', weekly)

  const hasCredits = credits.has || credits.unlimited || credits.balance > 0
  showSection(card, 'credits', hasCredits)
  if (!hasCredits) {
    return
  }
  const display = credits.unlimited ? 'Unlimited' : `${formatDollars(credits.balance)} credits`
  setField(card, 'credits-display', display)
}

function updateCursorCard(card, data) {
  const used = data.used || 0
  const limit = data.limit || 0
  const percent = getUsagePercent(used, limit)

  setField(card, 'usage', percent)
  updateBar(card, 'bar', percent)
  setResetField(card, 'reset', data.reset, formatWeeklyResetWithCountdown)

  const onDemand = data.onDemand || 0
  const onDemandLimit = data.onDemandLimit
  const hasOnDemand = onDemand > 0
  showSection(card, 'on-demand', hasOnDemand)
  if (hasOnDemand) {
    setField(card, 'on-demand-used', formatDollars(onDemand))
    const limitWrap = card.querySelector('[data-field="on-demand-limit-wrap"]')
    if (limitWrap) {
      limitWrap.style.display = onDemandLimit !== null ? '' : 'none'
    }
    if (onDemandLimit !== null) {
      setField(card, 'on-demand-limit', formatDollars(onDemandLimit))
    }
  }

  const legacy = data.legacy
  showSection(card, 'legacy', Boolean(legacy))
  if (!legacy) {
    return
  }
  setField(card, 'requests', legacy.requests)
  setField(card, 'max-requests', legacy.max)
}

const CARD_HANDLERS = {
  claude: updateClaudeCard,
  codex: updateCodexCard,
  cursor: updateCursorCard,
}

function updateCard(service, result) {
  const card = getCard(service)
  if (!card) {
    return
  }

  if (result.status !== 'ok') {
    showState(service, result.status)
    if (result.message) {
      setField(card, 'error', result.message)
    }
    return
  }

  showState(service, 'ok')
  const data = result.data

  setField(card, 'plan', data.plan || 'Unknown')

  const handler = CARD_HANDLERS[service] || updateCursorCard
  handler(card, data)
}

const SPIN_DELAY_MS = 300
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
  const card = getCard(service)
  if (!card) {
    return
  }

  showState(service, 'error')
  setField(card, 'error', message)
}

async function fetchData(force = false) {
  const btn = document.getElementById('refresh')
  btn.classList.add('spinning')

  const visibility = await getVisibility()

  for (const s of SERVICES) {
    if (visibility[s.name]) {
      showState(s.name, 'loading')
    }
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
      if (visibility.cursor && result.cursor && result.cursor.status !== 'hidden') {
        updateCard('cursor', result.cursor)
      }

      if (result?.meta?.cache) {
        setNotice(result.meta.message || CACHE_FALLBACK_MESSAGE)
        return
      }

      setNotice('')
    })
    .catch(() => {
      for (const s of SERVICES) {
        if (visibility[s.name]) {
          setError(s.name, FETCH_FALLBACK_MESSAGE)
        }
      }
      setNotice('')
    })
    .finally(() => {
      setTimeout(() => btn.classList.remove('spinning'), SPIN_DELAY_MS)
    })
}

async function initVisibility() {
  const visibility = await getVisibility()
  const checkboxes = {}

  for (const s of SERVICES) {
    const checkbox = document.getElementById(s.id)
    checkboxes[s.name] = checkbox
    checkbox.checked = visibility[s.name]
  }

  applyVisibility(visibility)

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
