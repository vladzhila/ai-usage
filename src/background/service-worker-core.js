// Core service worker logic - extracted for testability

export const CACHE_KEY = 'usage_cache';
export const CACHE_TTL = 60000; // 1 minute

export const SERVICES = {
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

export async function getCookie(service) {
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

export function isValid(service, value) {
  if (!value) {
    return false;
  }
  const config = SERVICES[service];
  if (config.prefix) {
    return value.startsWith(config.prefix);
  }
  return true;
}

export async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });

  if (response.status === 401 || response.status === 403) {
    return { status: 'expired' };
  }

  if (!response.ok) {
    return { status: 'error', message: `HTTP ${response.status}` };
  }

  return { status: 'ok', data: await response.json() };
}

export async function getCache() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] || null;
}

export async function setCache(data) {
  await chrome.storage.local.set({
    [CACHE_KEY]: { ...data, timestamp: Date.now() },
  });
}

export function isCacheValid(cache) {
  if (!cache?.timestamp) {
    return false;
  }
  return Date.now() - cache.timestamp < CACHE_TTL;
}

export async function fetchClaude() {
  const cookie = await getCookie('claude');

  if (!isValid('claude', cookie)) {
    return { status: 'logged_out', message: 'Log into claude.ai to see usage' };
  }

  const orgs = await fetchJson('https://claude.ai/api/organizations');
  if (orgs.status !== 'ok') {
    return orgs;
  }

  const org = orgs.data?.[0];
  if (!org?.uuid) {
    return { status: 'error', message: 'No organization found' };
  }

  const usage = await fetchJson(`https://claude.ai/api/organizations/${org.uuid}/usage`);
  if (usage.status !== 'ok') {
    return usage;
  }

  const isPro = org.capabilities?.includes('claude_pro');
  const fiveHour = usage.data?.five_hour;

  return {
    status: 'ok',
    data: {
      plan: isPro ? 'Pro' : 'Free',
      used: fiveHour?.utilization || 0,
      limit: 100,
      reset: fiveHour?.resets_at || null,
    },
  };
}
