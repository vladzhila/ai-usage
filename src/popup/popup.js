// Popup script - fetches and displays usage data

// Show specific state for a card
function showState(service, state) {
  const card = document.querySelector(`[data-service="${service}"]`);
  if (!card) {
    return;
  }

  // Hide all states
  card.querySelectorAll('[data-state]').forEach((el) => {
    el.style.display = 'none';
  });

  // Show target state
  const target = card.querySelector(`[data-state="${state}"]`);
  if (target) {
    target.style.display = 'block';
  }

  // Update status dot
  const dot = card.querySelector('.dot');
  if (dot) {
    dot.dataset.status = state;
  }
}

// Update progress bar
function updateBar(card, field, percent) {
  const bar = card.querySelector(`[data-field="${field}"]`);
  if (!bar) {
    return;
  }
  bar.style.width = `${percent}%`;
  if (percent >= 80) {
    bar.dataset.status = 'danger';
  } else if (percent >= 50) {
    bar.dataset.status = 'warning';
  } else {
    bar.dataset.status = 'ok';
  }
}

// Set text content of a field within a card
function setField(card, field, value) {
  const el = card.querySelector(`[data-field="${field}"]`);
  if (el) {
    el.textContent = value;
  }
}

// Update card with data
function updateCard(service, result) {
  const card = document.querySelector(`[data-service="${service}"]`);
  if (!card) {
    return;
  }

  // Handle non-ok status
  if (result.status !== 'ok') {
    showState(service, result.status);
    if (result.message) {
      setField(card, 'error', result.message);
    }
    return;
  }

  // Show ok state
  showState(service, 'ok');
  const data = result.data;

  setField(card, 'plan', data.plan || 'Unknown');

  // Codex: dual windows (session + weekly)
  if (service === 'codex') {
    const session = data.session || {};
    const weekly = data.weekly || {};

    setField(card, 'session-used', session.used || 0);
    updateBar(card, 'session-bar', session.used || 0);
    setField(card, 'session-reset', formatReset(session.reset));

    setField(card, 'weekly-used', weekly.used || 0);
    updateBar(card, 'weekly-bar', weekly.used || 0);
    setField(card, 'weekly-reset', formatResetDate(weekly.reset));
    return;
  }

  // Claude: single window
  const used = data.used || 0;
  setField(card, 'used', used);
  setField(card, 'limit', data.limit || '\u221e');

  const percent = data.limit > 0 ? Math.min(100, (used / data.limit) * 100) : 0;
  updateBar(card, 'bar', percent);

  setField(card, 'reset', formatReset(data.reset));
}

const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format reset time as relative (Xh Xm)
function formatReset(timestamp) {
  if (!timestamp) {
    return '--';
  }

  const diff = new Date(timestamp) - new Date();

  if (diff <= 0) {
    return 'now';
  }

  const hours = Math.floor(diff / MS_PER_HOUR);
  const mins = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Format reset time as date (Jan 20) or relative if within 24h
function formatResetDate(timestamp) {
  if (!timestamp) {
    return '--';
  }

  const reset = new Date(timestamp);
  const diff = reset - new Date();

  if (diff <= 0) {
    return 'now';
  }

  if (diff < MS_PER_DAY) {
    return formatReset(timestamp);
  }

  return `${MONTHS[reset.getMonth()]} ${reset.getDate()}`;
}

// Fetch data from service worker
async function fetchData(force = false) {
  const btn = document.getElementById('refresh');
  btn.classList.add('spinning');

  // Show loading
  showState('claude', 'loading');
  showState('codex', 'loading');

  const result = await chrome.runtime.sendMessage({ type: 'FETCH_USAGE', force });

  updateCard('claude', result.claude);
  updateCard('codex', result.codex);

  setTimeout(() => btn.classList.remove('spinning'), 300);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  fetchData();
  document.getElementById('refresh').addEventListener('click', () => fetchData(true));
});
