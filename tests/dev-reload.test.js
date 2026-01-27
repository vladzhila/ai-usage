import { describe, expect, test, mock } from 'bun:test'
import { startDevReload } from '../src/background/dev-reload.js'

function createFetchSequence(responses) {
  const state = { index: 0 }
  return function () {
    const response = responses[state.index] || responses[responses.length - 1]
    state.index += 1
    if (response instanceof Error) {
      return Promise.reject(response)
    }
    if (typeof response === 'function') {
      return response()
    }
    return Promise.resolve(response)
  }
}

function createResponse(ok, stamp, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve({ stamp }),
  }
}

function createResponseWithData(ok, data, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  }
}

function createResponseWithBrokenJson(ok, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.reject(new Error('bad json')),
  }
}

describe('startDevReload', () => {
  test('returns false when dev file missing', async () => {
    const fetchFn = createFetchSequence([createResponse(false, null, 404)])
    const runtime = { getURL: () => 'chrome-extension://id/dev-reload.json', reload: mock() }
    const timers = []
    const setTimer = (callback) => {
      timers.push(callback)
      return callback
    }

    const result = await startDevReload({ fetchFn, runtime, setTimer })

    expect(result).toBe(false)
    expect(timers.length).toBe(0)
    expect(runtime.reload).not.toHaveBeenCalled()
  })

  test('returns false when runtime is unavailable', async () => {
    const fetchFn = createFetchSequence([createResponse(true, 1)])
    const result = await startDevReload({ fetchFn, runtime: null })

    expect(result).toBe(false)
  })

  test('returns false when stamp is invalid', async () => {
    const fetchFn = createFetchSequence([createResponseWithData(true, { stamp: 'nope' })])
    const runtime = { getURL: () => 'chrome-extension://id/dev-reload.json', reload: mock() }
    const result = await startDevReload({ fetchFn, runtime })

    expect(result).toBe(false)
  })

  test('reloads when stamp changes', async () => {
    const fetchFn = createFetchSequence([
      createResponse(true, 1),
      createResponse(true, 1),
      createResponse(true, 2),
    ])
    const reload = mock()
    const runtime = { getURL: () => 'chrome-extension://id/dev-reload.json', reload }
    const timers = []
    const clearTimer = mock()
    const setTimer = (callback) => {
      timers.push(callback)
      return callback
    }

    const result = await startDevReload({ fetchFn, runtime, setTimer, clearTimer })

    expect(Boolean(result)).toBe(true)
    expect(timers.length).toBe(1)

    await timers[0]()
    expect(reload).not.toHaveBeenCalled()

    await timers[0]()
    expect(reload).toHaveBeenCalledTimes(1)

    result.stop()
    expect(clearTimer).toHaveBeenCalledTimes(1)
  })

  test('does not reload when poll fails', async () => {
    const fetchFn = createFetchSequence([createResponse(true, 1), new Error('fetch failed')])
    const reload = mock()
    const runtime = { getURL: () => 'chrome-extension://id/dev-reload.json', reload }
    const timers = []
    const setTimer = (callback) => {
      timers.push(callback)
      return callback
    }

    await startDevReload({ fetchFn, runtime, setTimer })

    await timers[0]()
    expect(reload).not.toHaveBeenCalled()
  })

  test('does not reload when json is invalid', async () => {
    const fetchFn = createFetchSequence([
      createResponse(true, 1),
      createResponseWithBrokenJson(true),
    ])
    const reload = mock()
    const runtime = { getURL: () => 'chrome-extension://id/dev-reload.json', reload }
    const timers = []
    const setTimer = (callback) => {
      timers.push(callback)
      return callback
    }

    await startDevReload({ fetchFn, runtime, setTimer })

    await timers[0]()
    expect(reload).not.toHaveBeenCalled()
  })
})
