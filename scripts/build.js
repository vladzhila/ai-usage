import { existsSync, mkdirSync, readdirSync, rmSync, watch as fsWatch } from 'fs'
import { extname, join } from 'path'

const SCRIPT_SUFFIX = '/scripts'
const ROOT = import.meta.dir.replace(SCRIPT_SUFFIX, '')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')
const ICONS = join(ROOT, 'icons')
const MANIFEST_NAME = 'manifest.json'
const MANIFEST = join(ROOT, MANIFEST_NAME)
const WATCH_FLAG = '--watch'
const MODE_DEV = 'development'
const MODE_PROD = 'production'
const BUILD_MESSAGE = 'Build complete: dist/'
const WATCH_MESSAGE = 'Watching for changes...'
const ICON_MESSAGE = 'Generated placeholder icons (replace with real icons for production)'
const SKIP_EXT = new Set(['.js', '.css'])
const ENTRYPOINTS = ['background/service-worker.js', 'popup/popup.js', 'popup/popup.css'].map(
  (entry) => join(SRC, entry)
)
const STATICS = ['popup', 'background', 'lib']
const ICON_SIZES = [16, 32, 48, 128]
const DEV_RELOAD_FILE = 'dev-reload.json'
const DEV_RELOAD_KEY = 'stamp'
const WATCH_DEBOUNCE_MS = 100
const WATCH_RECURSIVE_OPTIONS = { recursive: true }
const MIN_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

function ensure(path) {
  mkdirSync(path, { recursive: true })
}

function clean(path) {
  if (!existsSync(path)) {
    return
  }
  rmSync(path, { recursive: true })
}

async function copy(from, to) {
  await Bun.write(to, Bun.file(from))
}

async function copytree(from, to) {
  if (!existsSync(from)) {
    return
  }

  ensure(to)

  for (const item of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, item.name)
    const target = join(to, item.name)

    if (item.isDirectory()) {
      await copytree(source, target)
      continue
    }

    const ext = extname(item.name)
    if (SKIP_EXT.has(ext)) {
      continue
    }

    await copy(source, target)
  }
}

async function icons(from, to) {
  ensure(to)

  if (existsSync(from)) {
    for (const item of readdirSync(from, { withFileTypes: true })) {
      if (item.isDirectory()) {
        await copytree(join(from, item.name), join(to, item.name))
        continue
      }
      await copy(join(from, item.name), join(to, item.name))
    }
    return
  }

  for (const size of ICON_SIZES) {
    await Bun.write(join(to, `${size}.png`), MIN_PNG)
  }
  console.log(ICON_MESSAGE)
}

function hasWatchFlag(args) {
  return args.includes(WATCH_FLAG)
}

async function bundle(isDev) {
  const mode = isDev ? MODE_DEV : MODE_PROD
  const minify = isDev
    ? false
    : {
        whitespace: true,
        identifiers: true,
        syntax: true,
      }

  const result = await Bun.build({
    entrypoints: ENTRYPOINTS,
    outdir: DIST,
    root: SRC,
    format: 'iife',
    target: 'browser',
    splitting: false,
    minify,
    sourcemap: 'none',
  })

  if (result.success) {
    console.log(`Build mode: ${mode}`)
    return
  }

  const errors = result.logs
    .filter((log) => log.level === 'error')
    .map((log) => log.message)
    .join('\n')

  throw new Error(errors || 'Build failed')
}

async function writeDevReload() {
  const payload = { [DEV_RELOAD_KEY]: Date.now() }
  await Bun.write(join(DIST, DEV_RELOAD_FILE), JSON.stringify(payload))
}

async function buildAll(isDev) {
  await copy(MANIFEST, join(DIST, MANIFEST_NAME))

  for (const dir of STATICS) {
    await copytree(join(SRC, dir), join(DIST, dir))
  }

  await icons(ICONS, join(DIST, 'icons'))
  await bundle(isDev)

  if (isDev) {
    await writeDevReload()
  }

  console.log(BUILD_MESSAGE)
}

function createDebounced(callback, delay) {
  const state = { timer: null }
  return function () {
    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.timer = setTimeout(() => {
      state.timer = null
      callback()
    }, delay)
  }
}

function createBuildQueue(builder) {
  const state = { running: false, queued: false }

  async function run() {
    if (state.running) {
      state.queued = true
      return
    }

    state.running = true
    await builder()
    state.running = false

    if (!state.queued) {
      return
    }

    state.queued = false
    await run()
  }

  return run
}

function watchDir(path, onChange) {
  if (!existsSync(path)) {
    return null
  }
  return fsWatch(path, WATCH_RECURSIVE_OPTIONS, onChange)
}

function watchFile(path, onChange) {
  if (!existsSync(path)) {
    return null
  }
  return fsWatch(path, onChange)
}

function startWatch(onChange) {
  const watchers = [
    watchDir(SRC, onChange),
    watchDir(ICONS, onChange),
    watchFile(MANIFEST, onChange),
  ].filter(Boolean)

  return function () {
    for (const watcher of watchers) {
      watcher.close()
    }
  }
}

async function run() {
  const args = process.argv.slice(2)
  const isWatch = hasWatchFlag(args)

  clean(DIST)
  ensure(DIST)

  if (!isWatch) {
    await buildAll(false)
    return
  }

  const runBuild = createBuildQueue(() => buildAll(true))
  const onChange = createDebounced(runBuild, WATCH_DEBOUNCE_MS)
  await runBuild()
  startWatch(onChange)
  console.log(WATCH_MESSAGE)
  await new Promise(() => {})
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
