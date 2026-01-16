// Service Worker - handles API calls and caching

const CACHE_KEY = 'usage_cache';
const CACHE_TTL = 60000; // 1 minute

// ============ Cookie Helpers ============

const SERVICES = {
  claude: {
    url: 'https://claude.ai',
    cookie: 'sessionKey',
    prefix: 'sk-ant-',
  },
  chatgpt: {
    url: 'https://chatgpt.com',
    cookie: '__Secure-next-auth.session-token',
    prefix: null,
  },
};

async function getCookie(service) {
  const config = SERVICES[service];
  if (!config) {
    return null;
  }

  const cookie = await chrome.cookies.get({
    url: config.url,
    name: config.cookie,
  });

  return cookie?.value || null;
}

function isValid(service, value) {
  if (!value) {
    return false;
  }
  const config = SERVICES[service];
  if (config.prefix) {
    return value.startsWith(config.prefix);
  }
  return true;
}

// ============ API Fetchers ============

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });

  if (response.status === 401 || response.status === 403) {
    return { status: 'expired' };
  }

  if (!response.ok) {
    return { status: 'error', message: `HTTP ${response.status}` };
  }

  return { status: 'ok', data: await response.json() };
}

async function fetchClaude() {
  const cookie = await getCookie('claude');
  console.log('[DEBUG] Claude cookie:', cookie ? 'found' : 'missing');

  if (!isValid('claude', cookie)) {
    return { status: 'logged_out', message: 'Log into claude.ai to see usage' };
  }

  const orgs = await fetchJson('https://claude.ai/api/organizations');
  console.log('[DEBUG] Claude orgs:', JSON.stringify(orgs, null, 2));
  if (orgs.status !== 'ok') {
    return orgs;
  }

  const org = orgs.data?.[0];
  console.log('[DEBUG] Claude org[0]:', JSON.stringify(org, null, 2));
  if (!org?.uuid) {
    return { status: 'error', message: 'No organization found' };
  }

  const usage = await fetchJson(`https://claude.ai/api/organizations/${org.uuid}/usage`);
  console.log('[DEBUG] Claude usage:', JSON.stringify(usage, null, 2));
  if (usage.status !== 'ok') {
    return usage;
  }

  // Check for Pro via capabilities array
  const isPro = org.capabilities?.includes('claude_pro');
  const fiveHour = usage.data?.five_hour;

  return {
    status: 'ok',
    data: {
      plan: isPro ? 'Pro' : 'Free',
      used: fiveHour?.utilization || 0,
      limit: 100, // utilization is percentage
      reset: fiveHour?.resets_at || null,
    },
  };
}

async function fetchCodex() {
  const cookie = await getCookie('chatgpt');
  console.log('[DEBUG] Codex cookie:', cookie ? 'found' : 'missing');

  if (!isValid('chatgpt', cookie)) {
    return { status: 'logged_out', message: 'Log into chatgpt.com to see usage' };
  }

  // Find a chatgpt.com tab
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  console.log('[DEBUG] Found chatgpt.com tabs:', tabs.length);

  if (tabs.length === 0) {
    return {
      status: 'error',
      message: 'Open chatgpt.com in a tab',
    };
  }

  try {
    // Step 1: Get access token from session API
    const session = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: async () => {
        try {
          const res = await fetch('https://chatgpt.com/api/auth/session', {
            credentials: 'include',
          });
          if (!res.ok) {
            return { error: `Session HTTP ${res.status}` };
          }
          return res.json();
        } catch (err) {
          return { error: err.message };
        }
      },
    });

    const sessionData = session?.[0]?.result;
    console.log('[DEBUG] Session result:', sessionData?.accessToken ? 'token found' : 'no token');

    if (sessionData?.error) {
      return { status: 'error', message: sessionData.error };
    }

    const token = sessionData?.accessToken;
    if (!token) {
      return { status: 'expired', message: 'No access token in session' };
    }

    // Step 2: Fetch usage with Bearer token
    const usage = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: async (bearerToken) => {
        try {
          const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
            credentials: 'include',
            headers: {
              Authorization: `Bearer ${bearerToken}`,
            },
          });

          if (res.status === 401 || res.status === 403) {
            return { status: 'expired' };
          }

          if (!res.ok) {
            return { status: 'error', message: `HTTP ${res.status}` };
          }

          const data = await res.json();
          const primary = data.rate_limit?.primary_window;
          const secondary = data.rate_limit?.secondary_window;

          const toMs = (seconds) => (seconds ? seconds * 1000 : null);

          return {
            status: 'ok',
            data: {
              plan: data.plan_type || 'Free',
              session: {
                used: primary?.used_percent || 0,
                reset: toMs(primary?.reset_at),
              },
              weekly: {
                used: secondary?.used_percent || 0,
                reset: toMs(secondary?.reset_at),
              },
            },
          };
        } catch (err) {
          return { status: 'error', message: err.message };
        }
      },
      args: [token],
    });

    const result = usage?.[0]?.result;
    console.log('[DEBUG] Codex usage result:', JSON.stringify(result, null, 2));
    return result || { status: 'error', message: 'No result from script' };
  } catch (err) {
    console.log('[DEBUG] Script execution error:', err.message);
    return { status: 'error', message: 'Refresh chatgpt.com tab' };
  }
}

// ============ Cache ============

async function getCache() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] || null;
}

async function setCache(data) {
  await chrome.storage.local.set({
    [CACHE_KEY]: { ...data, timestamp: Date.now() },
  });
}

function isCacheValid(cache) {
  if (!cache?.timestamp) {
    return false;
  }
  return Date.now() - cache.timestamp < CACHE_TTL;
}

// ============ Main Handler ============

async function fetchAll(force = false) {
  // Check cache first
  if (!force) {
    const cache = await getCache();
    if (isCacheValid(cache)) {
      return cache;
    }
  }

  // Fetch fresh data
  const [claude, codex] = await Promise.all([fetchClaude(), fetchCodex()]);

  const result = { claude, codex };
  await setCache(result);

  return result;
}

// ============ Message Listener ============

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'FETCH_USAGE') {
    fetchAll(message.force).then(respond);
    return true;
  }
});

console.log('[AI Usage] Service worker ready');
