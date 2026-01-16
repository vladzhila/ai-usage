# Project

Chrome extension (Manifest v3) tracking AI service usage limits for Claude, ChatGPT/Codex, and Cursor.

# Commands

```bash
bun run dev          # Build + watch mode
bun run build        # Production build to dist/
bun test             # Run all tests
bun test <file>      # Run single test file
bun test --coverage  # Test with coverage
bun run lint         # ESLint check
bun run lint:fix     # ESLint autofix
bun run format       # Prettier format all
```

# Architecture

**Message Flow**: Popup → `chrome.runtime.sendMessage` → Service Worker → fetch APIs → cache + respond

**Key Files**:

- `src/background/service-worker.js` - Fetches usage from claude.ai, chatgpt.com, cursor.com APIs
- `src/popup/popup.js` - UI logic, sends `FETCH_USAGE` messages to background
- `src/lib/constants.js` - Time windows (Claude 5h/ChatGPT 3h), limits, storage keys
- `src/lib/storage.js` - Chrome storage wrapper with 1-minute cache TTL

**Providers**: Each has session windows, limits, and API-specific fetch logic. Data cached with fallback on fetch failure.

# Development

- After making changes, always add/update tests if applicable and run `bun test` to ensure all tests pass.
- Use `code-simplifier:code-simplifier` subagent to refactor code.

# Testing

Tests in `tests/` use `bun:test`. Chrome APIs mocked in `tests/mocks/chrome.js`.

# Pre-commit Hook

1. `bunx lint-staged` - Prettier formats staged files
2. `bun run lint` - ESLint checks all src/
3. `bun test` - Runs test suite

All must pass to commit. Configured in `.husky/pre-commit` and `package.json`.

# Bun

Use Bun for all tooling. Avoid npm/vite/webpack. Use `bun install`, `bun test`, `bun run <script>`.
