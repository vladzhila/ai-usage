import { describe, expect, test } from 'bun:test'
import { createChromeMock, setStorage, getStorage, clearMocks } from './mocks/chrome.js'

describe('chrome mock storage', () => {
  test('returns empty object for unsupported key types', () => {
    const chrome = createChromeMock()
    setStorage('foo', 'bar')

    const result = chrome.storage.local.get({ foo: true })
    expect(result).toEqual({})
  })

  test('clears storage with callback', () => {
    const chrome = createChromeMock()
    setStorage('foo', 'bar')

    let called = false
    chrome.storage.local.clear(() => {
      called = true
    })

    expect(called).toBe(true)
    expect(getStorage('foo')).toBeUndefined()
  })

  test('supports promise-based storage APIs', async () => {
    const chrome = createChromeMock()
    await chrome.storage.local.set({ alpha: 'beta' })
    const all = await chrome.storage.local.get(null)
    expect(all.alpha).toBe('beta')

    await chrome.storage.local.clear()
    const empty = await chrome.storage.local.get(null)
    expect(Object.keys(empty).length).toBe(0)
  })

  test('set with callback', () => {
    const chrome = createChromeMock()
    let called = false
    chrome.storage.local.set({ foo: 'bar' }, () => {
      called = true
    })
    expect(called).toBe(true)
    expect(getStorage('foo')).toBe('bar')
  })
})

describe('chrome mock helpers', () => {
  test('clearMocks removes storage and cookies', () => {
    setStorage('foo', 'bar')
    clearMocks()
    expect(getStorage('foo')).toBeUndefined()
  })

  test('cookie and runtime helpers', async () => {
    const chrome = createChromeMock()
    const result = await chrome.runtime.sendMessage()
    expect(result).toEqual({})

    const windowResult = await chrome.windows.create()
    expect(windowResult.id).toBe(1)

    const cookie = await chrome.cookies.get({ url: 'https://example.com', name: 'session' })
    expect(cookie).toBeNull()
  })
})
