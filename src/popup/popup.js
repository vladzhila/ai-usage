// AI Usage Tracker Popup

// Constants
const CHATGPT_SESSION_WINDOW_MS = 3 * 60 * 60 * 1000;
const CLAUDE_SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
const THRESHOLD_WARNING = 0.5;
const THRESHOLD_DANGER = 0.8;

// Format time remaining (e.g., "2h 14m")
function formatTimeRemaining(ms) {
  if (ms <= 0) {
    return 'now';
  }
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Format timestamp to relative time (e.g., "3h ago")
function formatUpdatedAt(timestamp) {
  if (!timestamp) {
    return 'never';
  }
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor(diff / (60 * 1000));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

// Get status based on usage percentage
function getStatus(percentage) {
  if (percentage >= THRESHOLD_DANGER) {
    return 'danger';
  }
  if (percentage >= THRESHOLD_WARNING) {
    return 'warning';
  }
  return 'ok';
}

// Update card UI for ChatGPT/Claude
function updateSessionCard(service, data) {
  const card = document.querySelector(`[data-service="${service}"]`);
  if (!card || !data) {
    return;
  }

  const { session, weekly } = data;
  const windowMs = service === 'chatgpt' ? CHATGPT_SESSION_WINDOW_MS : CLAUDE_SESSION_WINDOW_MS;
  const elapsed = Date.now() - session.windowStart;
  const remaining = Math.max(0, windowMs - elapsed);
  const percentage = session.count / session.limit;
  const status = getStatus(percentage);

  // Update values
  card.querySelector('[data-field="session-count"]').textContent = session.count;
  card.querySelector('[data-field="session-limit"]').textContent = session.limit;
  card.querySelector('[data-field="reset-time"]').textContent = formatTimeRemaining(remaining);
  card.querySelector('[data-field="weekly-count"]').textContent = weekly.count;

  // Update progress bar
  const progressFill = card.querySelector('[data-field="progress"]');
  progressFill.style.width = `${Math.min(100, percentage * 100)}%`;
  progressFill.dataset.status = status;

  // Update status dot
  card.querySelector('.status-dot').dataset.status = status;
}

// Update card UI for API services
function updateApiCard(service, data) {
  const card = document.querySelector(`[data-service="${service}"]`);
  if (!card || !data) {
    return;
  }

  card.querySelector('[data-field="spend"]').textContent = data.spend.toFixed(2);
  card.querySelector('[data-field="updated"]').textContent =
    `updated ${formatUpdatedAt(data.updatedAt)}`;
}

// Fetch and render all data
async function refreshData() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spinning');

  try {
    const data = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' }, resolve);
    });

    if (data.chatgpt) {
      updateSessionCard('chatgpt', data.chatgpt);
    }
    if (data.claude) {
      updateSessionCard('claude', data.claude);
    }
    if (data.openaiApi) {
      updateApiCard('openaiApi', data.openaiApi);
    }
    if (data.anthropicApi) {
      updateApiCard('anthropicApi', data.anthropicApi);
    }
  } catch (err) {
    console.error('[AI Usage Tracker] Error fetching data:', err);
  }

  setTimeout(() => {
    refreshBtn.classList.remove('spinning');
  }, 500);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  refreshData();

  // Refresh button click
  document.getElementById('refreshBtn').addEventListener('click', refreshData);

  // Auto-refresh timer display every minute
  setInterval(() => {
    refreshData();
  }, 60000);
});
