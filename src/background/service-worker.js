// Service Worker for AI Usage Tracker
// Handles messages from content scripts and manages storage

// Constants (duplicated here since service workers can't easily import ES modules)
const CHATGPT_SESSION_WINDOW_MS = 3 * 60 * 60 * 1000;
const CLAUDE_SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
const CHATGPT_SESSION_LIMIT = 150;
const CLAUDE_SESSION_LIMIT = 45;

const STORAGE_KEYS = {
  CHATGPT: 'chatgpt',
  CLAUDE: 'claude',
  OPENAI_API: 'openaiApi',
  ANTHROPIC_API: 'anthropicApi',
};

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function createDefaultUsageData() {
  return {
    [STORAGE_KEYS.CHATGPT]: {
      session: { count: 0, limit: CHATGPT_SESSION_LIMIT, windowStart: Date.now() },
      weekly: { count: 0, weekStart: getWeekStart() },
    },
    [STORAGE_KEYS.CLAUDE]: {
      session: { count: 0, limit: CLAUDE_SESSION_LIMIT, windowStart: Date.now() },
      weekly: { count: 0, weekStart: getWeekStart() },
    },
    [STORAGE_KEYS.OPENAI_API]: { spend: 0, updatedAt: null },
    [STORAGE_KEYS.ANTHROPIC_API]: { spend: 0, updatedAt: null },
  };
}

async function getUsageData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      if (!data || Object.keys(data).length === 0) {
        resolve(createDefaultUsageData());
      } else {
        resolve(data);
      }
    });
  });
}

async function saveUsageData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function incrementCount(serviceKey) {
  const data = await getUsageData();
  const service = serviceKey === 'chatgpt' ? STORAGE_KEYS.CHATGPT : STORAGE_KEYS.CLAUDE;
  let serviceData = data[service];

  if (!serviceData) {
    serviceData = createDefaultUsageData()[service];
  }

  const now = Date.now();
  const windowMs =
    service === STORAGE_KEYS.CHATGPT ? CHATGPT_SESSION_WINDOW_MS : CLAUDE_SESSION_WINDOW_MS;

  // Reset session if window expired
  if (now - serviceData.session.windowStart >= windowMs) {
    serviceData.session.count = 0;
    serviceData.session.windowStart = now;
  }

  // Reset weekly if week rolled over
  const currentWeekStart = getWeekStart();
  if (serviceData.weekly.weekStart < currentWeekStart) {
    serviceData.weekly.count = 0;
    serviceData.weekly.weekStart = currentWeekStart;
  }

  serviceData.session.count++;
  serviceData.weekly.count++;

  await saveUsageData({ [service]: serviceData });
  updateBadge(serviceData.session.count, serviceData.session.limit);
  return serviceData;
}

async function updateApiSpend(serviceKey, spend) {
  const service = serviceKey === 'openaiApi' ? STORAGE_KEYS.OPENAI_API : STORAGE_KEYS.ANTHROPIC_API;
  const data = {
    spend,
    updatedAt: Date.now(),
  };
  await saveUsageData({ [service]: data });
  return data;
}

function updateBadge(count, limit) {
  const percentage = count / limit;
  let color = '#22c55e'; // green
  if (percentage >= 0.8) {
    color = '#ef4444'; // red
  } else if (percentage >= 0.5) {
    color = '#eab308'; // yellow
  }

  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text: percentage >= 0.5 ? `${count}` : '' });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'INCREMENT_COUNT') {
    incrementCount(message.service).then((data) => {
      sendResponse({ success: true, data });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'UPDATE_API_SPEND') {
    updateApiSpend(message.service, message.spend).then((data) => {
      sendResponse({ success: true, data });
    });
    return true;
  }

  if (message.type === 'GET_USAGE_DATA') {
    getUsageData().then((data) => {
      sendResponse(data);
    });
    return true;
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await getUsageData();
  if (Object.keys(data).length === 0) {
    await saveUsageData(createDefaultUsageData());
  }
  console.log('[AI Usage Tracker] Extension installed');
});

console.log('[AI Usage Tracker] Service worker initialized');
