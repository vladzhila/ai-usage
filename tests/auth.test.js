import { describe, expect, test, beforeEach } from 'bun:test';
import { createChromeMock, setCookie, clearMocks, getStorage } from './mocks/chrome.js';

// Setup global chrome mock before importing auth module
const chrome = createChromeMock();
globalThis.chrome = chrome;

// Import after setting up chrome mock
const { getSessionCookie, isAuthenticated, saveAuthState, getAuthState, disconnectService, AUTH_CONFIG, AUTH_STORAGE_KEYS } = await import('../src/lib/auth.js');

describe('AUTH_CONFIG', () => {
  test('has chatgpt config', () => {
    expect(AUTH_CONFIG.chatgpt).toBeDefined();
    expect(AUTH_CONFIG.chatgpt.loginUrl).toBe('https://chatgpt.com');
    expect(AUTH_CONFIG.chatgpt.cookieName).toBe('__Secure-next-auth.session-token');
  });

  test('has claude config', () => {
    expect(AUTH_CONFIG.claude).toBeDefined();
    expect(AUTH_CONFIG.claude.loginUrl).toBe('https://claude.ai/login');
    expect(AUTH_CONFIG.claude.cookieName).toBe('sessionKey');
  });
});

describe('getSessionCookie', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('returns null for unknown service', async () => {
    const result = await getSessionCookie('unknown');
    expect(result).toBeNull();
  });

  test('returns null when no cookie exists', async () => {
    const result = await getSessionCookie('claude');
    expect(result).toBeNull();
  });

  test('returns cookie value for claude', async () => {
    setCookie('https://claude.ai/login', 'sessionKey', 'sk-ant-test-token');
    const result = await getSessionCookie('claude');
    expect(result).toBe('sk-ant-test-token');
  });

  test('returns cookie value for chatgpt', async () => {
    setCookie('https://chatgpt.com', '__Secure-next-auth.session-token', 'test-session-token');
    const result = await getSessionCookie('chatgpt');
    expect(result).toBe('test-session-token');
  });
});

describe('isAuthenticated', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('returns false when no cookie', async () => {
    const result = await isAuthenticated('claude');
    expect(result).toBe(false);
  });

  test('returns true when cookie exists', async () => {
    setCookie('https://claude.ai/login', 'sessionKey', 'sk-ant-test');
    const result = await isAuthenticated('claude');
    expect(result).toBe(true);
  });

  test('returns false for unknown service', async () => {
    const result = await isAuthenticated('unknown');
    expect(result).toBe(false);
  });
});

describe('saveAuthState', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('saves chatgpt connected state', async () => {
    await saveAuthState('chatgpt', true);
    const stored = getStorage(AUTH_STORAGE_KEYS.CHATGPT_CONNECTED);
    expect(stored).toBe(true);
  });

  test('saves claude connected state', async () => {
    await saveAuthState('claude', true);
    const stored = getStorage(AUTH_STORAGE_KEYS.CLAUDE_CONNECTED);
    expect(stored).toBe(true);
  });

  test('saves disconnected state', async () => {
    await saveAuthState('chatgpt', false);
    const stored = getStorage(AUTH_STORAGE_KEYS.CHATGPT_CONNECTED);
    expect(stored).toBe(false);
  });
});

describe('getAuthState', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('returns default false for both services', async () => {
    const state = await getAuthState();
    expect(state.chatgpt).toBe(false);
    expect(state.claude).toBe(false);
  });

  test('returns saved state', async () => {
    await saveAuthState('chatgpt', true);
    await saveAuthState('claude', true);
    const state = await getAuthState();
    expect(state.chatgpt).toBe(true);
    expect(state.claude).toBe(true);
  });
});

describe('disconnectService', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('sets connected state to false', async () => {
    await saveAuthState('chatgpt', true);
    await disconnectService('chatgpt');
    const state = await getAuthState();
    expect(state.chatgpt).toBe(false);
  });
});
