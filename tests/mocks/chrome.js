const storage = new Map()

function getStorageResult(keys) {
  if (keys === null) {
    return Object.fromEntries(storage)
  }
  if (Array.isArray(keys)) {
    const result = {}
    for (const key of keys) {
      if (storage.has(key)) {
        result[key] = storage.get(key)
      }
    }
    return result
  }
  if (typeof keys === 'string') {
    return storage.has(keys) ? { [keys]: storage.get(keys) } : {}
  }
  return {}
}

export function createChromeMock() {
  storage.clear()

  return {
    storage: {
      local: {
        get: (keys, callback) => {
          const result = getStorageResult(keys)
          if (callback) {
            callback(result)
            return
          }
          return Promise.resolve(result)
        },
        set: (data, callback) => {
          for (const [key, value] of Object.entries(data)) {
            storage.set(key, value)
          }
          if (callback) {
            callback()
            return
          }
          return Promise.resolve()
        },
        clear: (callback) => {
          storage.clear()
          if (callback) {
            callback()
            return
          }
          return Promise.resolve()
        },
      },
    },
    runtime: {
      sendMessage: async () => ({}),
      onMessage: {
        addListener: () => {},
      },
    },
    windows: {
      create: async () => ({ id: 1 }),
    },
  }
}

export function setStorage(key, value) {
  storage.set(key, value)
}

export function getStorage(key) {
  return storage.get(key)
}

export function clearMocks() {
  storage.clear()
}
