// Visibility configuration and helpers

// Service visibility configuration
export const SERVICES = [
  { key: 'showClaude', id: 'show-claude', name: 'claude' },
  { key: 'showCodex', id: 'show-codex', name: 'codex' },
  { key: 'showCursor', id: 'show-cursor', name: 'cursor' },
]

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
