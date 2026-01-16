// Authentication service for ChatGPT and Claude
// Handles login flow and session token capture via cookies

export const AUTH_CONFIG = {
  chatgpt: {
    loginUrl: 'https://chatgpt.com',
    domain: '.chatgpt.com',
    cookieName: '__Secure-next-auth.session-token',
    altCookieName: 'session_token',
  },
  claude: {
    loginUrl: 'https://claude.ai/login',
    domain: '.claude.ai',
    cookieName: 'sessionKey',
    altCookieName: '__session',
  },
};

// Storage keys for auth state
export const AUTH_STORAGE_KEYS = {
  CHATGPT_CONNECTED: 'chatgpt_connected',
  CLAUDE_CONNECTED: 'claude_connected',
  CHATGPT_TOKEN: 'chatgpt_token',
  CLAUDE_TOKEN: 'claude_token',
};

// Get session cookie for a service
export async function getSessionCookie(service) {
  const config = AUTH_CONFIG[service];
  if (!config) {
    return null;
  }

  // Try primary cookie name
  let cookie = await chrome.cookies.get({
    url: config.loginUrl,
    name: config.cookieName,
  });

  // Try alternate cookie name if primary not found
  if (!cookie && config.altCookieName) {
    cookie = await chrome.cookies.get({
      url: config.loginUrl,
      name: config.altCookieName,
    });
  }

  return cookie?.value || null;
}

// Check if user is authenticated with a service
export async function isAuthenticated(service) {
  const token = await getSessionCookie(service);
  return !!token;
}

// Open login window for a service
export function openLoginWindow(service) {
  const config = AUTH_CONFIG[service];
  if (!config) {
    return null;
  }

  const width = 500;
  const height = 700;
  const left = Math.round((screen.width - width) / 2);
  const top = Math.round((screen.height - height) / 2);

  return chrome.windows.create({
    url: config.loginUrl,
    type: 'popup',
    width,
    height,
    left,
    top,
  });
}

// Poll for authentication cookie after login window opens
export async function waitForAuthentication(service, timeoutMs = 300000) {
  const startTime = Date.now();
  const pollInterval = 1000;

  return new Promise((resolve, reject) => {
    const checkAuth = async () => {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Authentication timeout'));
        return;
      }

      // Check if authenticated
      const token = await getSessionCookie(service);
      if (token) {
        resolve(token);
        return;
      }

      // Keep polling
      setTimeout(checkAuth, pollInterval);
    };

    checkAuth();
  });
}

// Save auth state to storage
export async function saveAuthState(service, isConnected) {
  const key =
    service === 'chatgpt'
      ? AUTH_STORAGE_KEYS.CHATGPT_CONNECTED
      : AUTH_STORAGE_KEYS.CLAUDE_CONNECTED;

  await chrome.storage.local.set({ [key]: isConnected });
}

// Get auth state from storage
export async function getAuthState() {
  const data = await chrome.storage.local.get([
    AUTH_STORAGE_KEYS.CHATGPT_CONNECTED,
    AUTH_STORAGE_KEYS.CLAUDE_CONNECTED,
  ]);

  return {
    chatgpt: data[AUTH_STORAGE_KEYS.CHATGPT_CONNECTED] || false,
    claude: data[AUTH_STORAGE_KEYS.CLAUDE_CONNECTED] || false,
  };
}

// Disconnect a service (clear auth state)
export async function disconnectService(service) {
  await saveAuthState(service, false);
}
