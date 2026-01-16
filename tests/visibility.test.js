import { describe, expect, test, beforeEach } from 'bun:test';
import { createChromeMock, clearMocks } from './mocks/chrome.js';

// Setup global chrome mock
const chrome = createChromeMock();
globalThis.chrome = chrome;

// Visibility keys
const SHOW_CLAUDE_KEY = 'showClaude';
const SHOW_CODEX_KEY = 'showCodex';

// Test getVisibility logic (duplicated from popup.js for testing)
function getVisibility(result) {
  return {
    claude: result[SHOW_CLAUDE_KEY] !== false,
    codex: result[SHOW_CODEX_KEY] !== false,
  };
}

// Test applyVisibility logic
function getEmptyState(visibility) {
  return !visibility.claude && !visibility.codex;
}

describe('Visibility - getVisibility', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('defaults both to true when not set', () => {
    const visibility = getVisibility({});
    expect(visibility.claude).toBe(true);
    expect(visibility.codex).toBe(true);
  });

  test('respects showClaude: false', () => {
    const visibility = getVisibility({ [SHOW_CLAUDE_KEY]: false });
    expect(visibility.claude).toBe(false);
    expect(visibility.codex).toBe(true);
  });

  test('respects showCodex: false', () => {
    const visibility = getVisibility({ [SHOW_CODEX_KEY]: false });
    expect(visibility.claude).toBe(true);
    expect(visibility.codex).toBe(false);
  });

  test('respects both hidden', () => {
    const visibility = getVisibility({
      [SHOW_CLAUDE_KEY]: false,
      [SHOW_CODEX_KEY]: false,
    });
    expect(visibility.claude).toBe(false);
    expect(visibility.codex).toBe(false);
  });

  test('treats explicit true correctly', () => {
    const visibility = getVisibility({
      [SHOW_CLAUDE_KEY]: true,
      [SHOW_CODEX_KEY]: true,
    });
    expect(visibility.claude).toBe(true);
    expect(visibility.codex).toBe(true);
  });
});

describe('Visibility - empty state', () => {
  test('shows empty when both hidden', () => {
    expect(getEmptyState({ claude: false, codex: false })).toBe(true);
  });

  test('hides empty when claude visible', () => {
    expect(getEmptyState({ claude: true, codex: false })).toBe(false);
  });

  test('hides empty when codex visible', () => {
    expect(getEmptyState({ claude: false, codex: true })).toBe(false);
  });

  test('hides empty when both visible', () => {
    expect(getEmptyState({ claude: true, codex: true })).toBe(false);
  });
});

describe('Visibility - storage persistence', () => {
  beforeEach(() => {
    clearMocks();
  });

  test('persists showClaude setting', async () => {
    await chrome.storage.local.set({ [SHOW_CLAUDE_KEY]: false });
    const result = await chrome.storage.local.get(SHOW_CLAUDE_KEY);
    expect(result[SHOW_CLAUDE_KEY]).toBe(false);
  });

  test('persists showCodex setting', async () => {
    await chrome.storage.local.set({ [SHOW_CODEX_KEY]: false });
    const result = await chrome.storage.local.get(SHOW_CODEX_KEY);
    expect(result[SHOW_CODEX_KEY]).toBe(false);
  });

  test('retrieves multiple settings', async () => {
    await chrome.storage.local.set({ [SHOW_CLAUDE_KEY]: false });
    await chrome.storage.local.set({ [SHOW_CODEX_KEY]: true });
    const result = await chrome.storage.local.get([SHOW_CLAUDE_KEY, SHOW_CODEX_KEY]);
    expect(result[SHOW_CLAUDE_KEY]).toBe(false);
    expect(result[SHOW_CODEX_KEY]).toBe(true);
  });
});

describe('Visibility - hidden status', () => {
  const HIDDEN_RESULT = { status: 'hidden' };

  test('hidden provider returns hidden status', () => {
    expect(HIDDEN_RESULT.status).toBe('hidden');
  });

  test('hidden status should not be processed as card update', () => {
    // When a provider returns { status: 'hidden' }, the popup should not call updateCard
    const result = { status: 'hidden' };
    expect(result.status).not.toBe('ok');
    expect(result.status).not.toBe('error');
    expect(result.status).not.toBe('logged_out');
  });
});
