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
- `src/lib/constants.js` - Thresholds, plan labels
- `src/lib/format.js` - Time formatting (session reset, weekly reset, countdown)

**Providers**: Each has session windows, limits, and API-specific fetch logic. Data cached with fallback on fetch failure.

# Development

- Use `code-simplifier:code-simplifier` subagent to refactor code.

## Verification Workflow

**Before declaring a feature "done":**

1. **CRITICAL:** Every implementation must end with adding/updating tests
2. **CRITICAL:** Run `bun run lint && bun test --coverage` - all must pass with 100% coverage

# Testing

Tests in `tests/` use `bun:test`. Chrome APIs mocked in `tests/mocks/chrome.js`.

# Pre-commit Hook

1. `bunx lint-staged` - Prettier formats staged files
2. `bun run lint` - ESLint checks all src/
3. `bun test` - Runs test suite

All must pass to commit. Configured in `.husky/pre-commit` and `package.json`.

# Bun

Use Bun for all tooling. Avoid npm/vite/webpack. Use `bun install`, `bun test`, `bun run <script>`.
