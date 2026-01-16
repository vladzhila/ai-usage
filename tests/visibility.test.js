import { describe, expect, test, beforeEach } from 'bun:test'
import { createChromeMock, clearMocks } from './mocks/chrome.js'
import { parseVisibility, isAllHidden, SERVICES } from '../src/lib/visibility.js'

// Setup global chrome mock
const chrome = createChromeMock()
globalThis.chrome = chrome

describe('Visibility - parseVisibility', () => {
  test('defaults all to true when not set', () => {
    const visibility = parseVisibility({})
    expect(visibility.claude).toBe(true)
    expect(visibility.codex).toBe(true)
    expect(visibility.cursor).toBe(true)
  })

  test('respects showClaude: false', () => {
    const visibility = parseVisibility({ showClaude: false })
    expect(visibility.claude).toBe(false)
    expect(visibility.codex).toBe(true)
    expect(visibility.cursor).toBe(true)
  })

  test('respects showCodex: false', () => {
    const visibility = parseVisibility({ showCodex: false })
    expect(visibility.claude).toBe(true)
    expect(visibility.codex).toBe(false)
    expect(visibility.cursor).toBe(true)
  })

  test('respects showCursor: false', () => {
    const visibility = parseVisibility({ showCursor: false })
    expect(visibility.claude).toBe(true)
    expect(visibility.codex).toBe(true)
    expect(visibility.cursor).toBe(false)
  })

  test('respects all hidden', () => {
    const visibility = parseVisibility({
      showClaude: false,
      showCodex: false,
      showCursor: false,
    })
    expect(visibility.claude).toBe(false)
    expect(visibility.codex).toBe(false)
    expect(visibility.cursor).toBe(false)
  })

  test('treats explicit true correctly', () => {
    const visibility = parseVisibility({
      showClaude: true,
      showCodex: true,
      showCursor: true,
    })
    expect(visibility.claude).toBe(true)
    expect(visibility.codex).toBe(true)
    expect(visibility.cursor).toBe(true)
  })
})

describe('Visibility - isAllHidden', () => {
  test('returns true when all hidden', () => {
    expect(isAllHidden({ claude: false, codex: false, cursor: false })).toBe(true)
  })

  test('returns false when claude visible', () => {
    expect(isAllHidden({ claude: true, codex: false, cursor: false })).toBe(false)
  })

  test('returns false when codex visible', () => {
    expect(isAllHidden({ claude: false, codex: true, cursor: false })).toBe(false)
  })

  test('returns false when cursor visible', () => {
    expect(isAllHidden({ claude: false, codex: false, cursor: true })).toBe(false)
  })

  test('returns false when all visible', () => {
    expect(isAllHidden({ claude: true, codex: true, cursor: true })).toBe(false)
  })
})

describe('Visibility - SERVICES config', () => {
  test('has correct service keys', () => {
    const keys = SERVICES.map((s) => s.key)
    expect(keys).toContain('showClaude')
    expect(keys).toContain('showCodex')
    expect(keys).toContain('showCursor')
  })

  test('has correct service names', () => {
    const names = SERVICES.map((s) => s.name)
    expect(names).toContain('claude')
    expect(names).toContain('codex')
    expect(names).toContain('cursor')
  })
})

describe('Visibility - storage persistence', () => {
  beforeEach(() => {
    clearMocks()
  })

  test('persists showClaude setting', async () => {
    await chrome.storage.local.set({ showClaude: false })
    const result = await chrome.storage.local.get('showClaude')
    expect(result.showClaude).toBe(false)
  })

  test('persists showCodex setting', async () => {
    await chrome.storage.local.set({ showCodex: false })
    const result = await chrome.storage.local.get('showCodex')
    expect(result.showCodex).toBe(false)
  })

  test('retrieves multiple settings', async () => {
    await chrome.storage.local.set({ showClaude: false })
    await chrome.storage.local.set({ showCodex: true })
    const result = await chrome.storage.local.get(['showClaude', 'showCodex'])
    expect(result.showClaude).toBe(false)
    expect(result.showCodex).toBe(true)
  })
})
