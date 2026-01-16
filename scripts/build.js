import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
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
const ICON_MESSAGE = 'Generated placeholder icons (replace with real icons for production)'
const SKIP_EXT = new Set(['.js', '.css'])
const ENTRYPOINTS = [
  'background/service-worker.js',
  'content-scripts/codex-fetcher.js',
  'popup/popup.js',
  'popup/popup.css',
].map((entry) => join(SRC, entry))
const STATICS = ['popup', 'background', 'lib', 'content-scripts']
const ICON_SIZES = [16, 48, 128]
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
    await Bun.write(join(to, `icon${size}.png`), MIN_PNG)
  }
  console.log(ICON_MESSAGE)
}

function watch(args) {
  return args.includes(WATCH_FLAG)
}

async function bundle(isWatch) {
  const mode = isWatch ? MODE_DEV : MODE_PROD
  const minify = isWatch
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
    watch: isWatch,
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

async function run() {
  const args = process.argv.slice(2)
  const isWatch = watch(args)

  clean(DIST)
  ensure(DIST)

  await copy(MANIFEST, join(DIST, MANIFEST_NAME))

  for (const dir of STATICS) {
    await copytree(join(SRC, dir), join(DIST, dir))
  }

  await icons(ICONS, join(DIST, 'icons'))
  await bundle(isWatch)

  console.log(BUILD_MESSAGE)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
