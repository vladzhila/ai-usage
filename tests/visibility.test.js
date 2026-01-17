import { describe, expect, test, beforeEach } from 'bun:test'
import { createChromeMock, clearMocks } from './mocks/chrome.js'
import {
  parseVisibility,
  isAllHidden,
  SERVICES,
  ORDER_KEY,
  DEFAULT_ORDER,
  parseOrder,
} from '../src/lib/visibility.js'

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

describe('Order - constants', () => {
  test('ORDER_KEY is providerOrder', () => {
    expect(ORDER_KEY).toBe('providerOrder')
  })

  test('DEFAULT_ORDER has all providers', () => {
    expect(DEFAULT_ORDER).toEqual(['claude', 'codex', 'cursor'])
  })
})

describe('Order - parseOrder', () => {
  test('returns default when not set', () => {
    const order = parseOrder({})
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when not array', () => {
    const order = parseOrder({ providerOrder: 'invalid' })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when missing provider', () => {
    const order = parseOrder({ providerOrder: ['claude', 'codex'] })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when extra provider', () => {
    const order = parseOrder({ providerOrder: ['claude', 'codex', 'cursor', 'extra'] })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when unknown provider', () => {
    const order = parseOrder({ providerOrder: ['claude', 'codex', 'unknown'] })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns valid custom order', () => {
    const order = parseOrder({ providerOrder: ['cursor', 'claude', 'codex'] })
    expect(order).toEqual(['cursor', 'claude', 'codex'])
  })

  test('returns copy not reference', () => {
    const stored = ['cursor', 'claude', 'codex']
    const order = parseOrder({ providerOrder: stored })
    order[0] = 'modified'
    expect(stored[0]).toBe('cursor')
  })

  test('returns default when null', () => {
    const order = parseOrder({ providerOrder: null })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when empty array', () => {
    const order = parseOrder({ providerOrder: [] })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })

  test('returns default when duplicates', () => {
    const order = parseOrder({ providerOrder: ['claude', 'claude', 'codex'] })
    expect(order).toEqual(['claude', 'codex', 'cursor'])
  })
})

describe('Order - storage persistence', () => {
  beforeEach(() => {
    clearMocks()
  })

  test('persists providerOrder setting', async () => {
    const order = ['cursor', 'claude', 'codex']
    await chrome.storage.local.set({ providerOrder: order })
    const result = await chrome.storage.local.get('providerOrder')
    expect(result.providerOrder).toEqual(order)
  })

  test('retrieves order with parseOrder', async () => {
    await chrome.storage.local.set({ providerOrder: ['codex', 'cursor', 'claude'] })
    const result = await chrome.storage.local.get('providerOrder')
    const order = parseOrder(result)
    expect(order).toEqual(['codex', 'cursor', 'claude'])
  })
})
