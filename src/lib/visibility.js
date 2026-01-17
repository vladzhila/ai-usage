// Visibility and order configuration/helpers

// Service visibility configuration
export const SERVICES = [
  { key: 'showClaude', id: 'show-claude', name: 'claude' },
  { key: 'showCodex', id: 'show-codex', name: 'codex' },
  { key: 'showCursor', id: 'show-cursor', name: 'cursor' },
]

// Provider order constants
export const ORDER_KEY = 'providerOrder'
export const DEFAULT_ORDER = ['claude', 'codex', 'cursor']

// Parse stored order, fallback to default
export function parseOrder(result) {
  const stored = result[ORDER_KEY]
  const valid =
    Array.isArray(stored) &&
    stored.length === DEFAULT_ORDER.length &&
    DEFAULT_ORDER.every((p) => stored.includes(p))
  return valid ? [...stored] : [...DEFAULT_ORDER]
}

// Parse storage result into visibility map
export function parseVisibility(result) {
  const visibility = {}
  for (const s of SERVICES) {
    visibility[s.name] = result[s.key] !== false
  }
  return visibility
}

// Check if all services are hidden (for empty state)
export function isAllHidden(visibility) {
  return !visibility.claude && !visibility.codex && !visibility.cursor
}
