# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome extension (Manifest v3) tracking AI service usage limits for Claude, ChatGPT/Codex, and Cursor.

## Commands

```bash
bun run dev          # Build + watch mode (auto-reloads extension)
bun run build        # Production build to dist/
bun test             # Run all tests
bun test <file>      # Run single test file
bun test --coverage  # Test with coverage
bun run lint         # ESLint check
bun run lint:fix     # ESLint autofix
bun run format       # Prettier format all
bun run format:check # Check formatting
```

## Architecture

**Message Flow**: Popup → `chrome.runtime.sendMessage({ type: 'FETCH_USAGE' })` → Service Worker → fetch APIs → cache + respond

**Key Files**:

- `src/background/service-worker.js` - Message listener, orchestrates fetches for all providers
- `src/background/service-worker-core.js` - Shared fetch logic, caching, response parsing
- `src/popup/popup.js` - UI logic, sends `FETCH_USAGE` messages to background
- `src/lib/constants.js` - Time constants, usage thresholds
- `src/lib/format.js` - Time formatting utilities
- `src/lib/visibility.js` - Provider visibility state management
- `src/background/dev-reload.js` - Dev mode auto-reload polling

**Provider APIs**:

- Claude: `claude.ai/api/organizations/{uuid}/usage` + `/overage_spend_limit`
- Codex: `chatgpt.com/backend-api/wham/usage` (requires bearer token from session)
- Cursor: `cursor.com/api/usage-summary` with legacy fallback to `/api/usage`

**Caching**: Results cached 60s in `chrome.storage.local`. On transient errors, returns cached data with staleness notice. Definitive statuses (`logged_out`) are never replaced by cache.

## Development

- Use `code-simplifier:code-simplifier` subagent to refactor code
- Dev mode polls `dist/dev-reload.json` and auto-reloads extension

### Verification Workflow

**Before declaring a feature "done":**

1. **CRITICAL:** Every implementation must end with adding/updating tests
2. **CRITICAL:** Run `bun run lint && bun test --coverage` - all must pass with 100% coverage

## Testing

Tests in `tests/` use `bun:test`. Chrome APIs mocked in `tests/mocks/chrome.js`.

Mock helpers: `setStorage(key, value)`, `getStorage(key)`, `clearMocks()`

## Pre-commit Hook

1. `bunx lint-staged` - Prettier formats staged files
2. `bun run lint` - ESLint checks all src/
3. `bun test` - Runs test suite

All must pass to commit.

## Bun

Use Bun for all tooling. Avoid npm/vite/webpack. Use `bun install`, `bun test`, `bun run <script>`.
