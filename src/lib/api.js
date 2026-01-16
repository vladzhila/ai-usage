// Cookie-based API service for fetching usage data

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

const STATUS = {
  OK: 'ok',
  LOGGED_OUT: 'logged_out',
  EXPIRED: 'expired',
  ERROR: 'error',
};

// Get session cookie for a service
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

// Check if cookie is valid
function isValidCookie(service, value) {
  if (!value) {
    return false;
  }

  const config = SERVICES[service];
  if (config.prefix) {
    return value.startsWith(config.prefix);
  }
  return true;
}

// Fetch with error handling
async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });

  if (response.status === 401 || response.status === 403) {
    return { status: STATUS.EXPIRED };
  }

  if (!response.ok) {
    return { status: STATUS.ERROR, message: `HTTP ${response.status}` };
  }

  const data = await response.json();
  return { status: STATUS.OK, data };
}

// ============ Claude API ============

async function fetchClaude() {
  const cookie = await getCookie('claude');

  if (!isValidCookie('claude', cookie)) {
    return {
      status: STATUS.LOGGED_OUT,
      message: 'Log into claude.ai to see usage',
    };
  }

  // Get organizations
  const orgs = await fetchJson('https://claude.ai/api/organizations');
  if (orgs.status !== STATUS.OK) {
    return orgs;
  }

  const org = orgs.data?.[0];
  if (!org?.uuid) {
    return { status: STATUS.ERROR, message: 'No organization found' };
  }

  // Get usage data
  const usage = await fetchJson(`https://claude.ai/api/organizations/${org.uuid}/usage`);
  if (usage.status !== STATUS.OK) {
    return usage;
  }

  // Parse usage data
  const data = usage.data;
  return {
    status: STATUS.OK,
    data: {
      plan: org.active_subscription ? 'Pro' : 'Free',
      daily: data?.daily_usage || 0,
      limit: data?.daily_limit || 0,
      reset: data?.reset_at || null,
      raw: data,
    },
  };
}

// ============ ChatGPT API ============

async function fetchChatGPT() {
  const cookie = await getCookie('chatgpt');

  if (!isValidCookie('chatgpt', cookie)) {
    return {
      status: STATUS.LOGGED_OUT,
      message: 'Log into chatgpt.com to see usage',
    };
  }

  // Get usage data
  const usage = await fetchJson('https://chatgpt.com/backend-api/wham/usage');
  if (usage.status !== STATUS.OK) {
    return usage;
  }

  const data = usage.data;
  return {
    status: STATUS.OK,
    data: {
      plan: data?.subscription_plan || 'Free',
      used: data?.usage_count || 0,
      limit: data?.usage_limit || 0,
      reset: data?.reset_at || null,
      raw: data,
    },
  };
}

// ============ Exports ============

export { fetchClaude, fetchChatGPT, getCookie, STATUS };
