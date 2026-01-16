// Session window durations in milliseconds
export const CHATGPT_SESSION_WINDOW_MS = 3 * 60 * 60 * 1000 // 3 hours
export const CLAUDE_SESSION_WINDOW_MS = 5 * 60 * 60 * 1000 // 5 hours
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Default limits (ChatGPT Plus / Claude Pro)
export const CHATGPT_SESSION_LIMIT = 150
export const CLAUDE_SESSION_LIMIT = 45

// Storage keys
export const STORAGE_KEYS = {
  CHATGPT: 'chatgpt',
  CLAUDE: 'claude',
  OPENAI_API: 'openaiApi',
  ANTHROPIC_API: 'anthropicApi',
  SHOW_CLAUDE: 'showClaude',
  SHOW_CODEX: 'showCodex',
}

// Usage thresholds for color indicators
export const THRESHOLD_WARNING = 0.5 // 50% - yellow
export const THRESHOLD_DANGER = 0.8 // 80% - red

// Default data structure
export const createDefaultUsageData = () => ({
  [STORAGE_KEYS.CHATGPT]: {
    session: { count: 0, limit: CHATGPT_SESSION_LIMIT, windowStart: Date.now() },
    weekly: { count: 0, weekStart: getWeekStart() },
  },
  [STORAGE_KEYS.CLAUDE]: {
    session: { count: 0, limit: CLAUDE_SESSION_LIMIT, windowStart: Date.now() },
    weekly: { count: 0, weekStart: getWeekStart() },
  },
  [STORAGE_KEYS.OPENAI_API]: { spend: 0, updatedAt: null },
  [STORAGE_KEYS.ANTHROPIC_API]: { spend: 0, updatedAt: null },
})

// Get start of current week (Monday 00:00)
export function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}
