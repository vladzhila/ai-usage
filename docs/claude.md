# Claude Provider

Claude provider fetches usage data from claude.ai Web API using browser session cookies.

## Data Source

Uses browser cookies (automatic via Chrome extension cookies API).

**Cookie required:**

- Name: `sessionKey`
- Domain: `claude.ai`
- Value prefix: `sk-ant-...`

## API Endpoints

| Endpoint                                          | Returns                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/organizations`                          | Organization UUID                                                      |
| `GET /api/organizations/{id}/usage`               | `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet` windows |
| `GET /api/organizations/{id}/overage_spend_limit` | Extra usage: `is_enabled`, `used_credits`, `monthly_credit_limit`      |
| `GET /api/account`                                | `rate_limit_tier`, `billing_type` for plan detection                   |

## Plan Detection

Plan is detected from `rate_limit_tier` in account response, with a billing fallback:

| Tier                | Display    |
| ------------------- | ---------- |
| `claude_max`        | Max        |
| `claude_pro`        | Pro        |
| `claude_team`       | Team       |
| `claude_enterprise` | Enterprise |
| `claude_ultra`      | Ultra      |

Fallbacks:

- If `rate_limit_tier` is missing and `billing_type` indicates paid (e.g., `stripe`), assume Pro.
- If billing info is missing, checks `capabilities` array for `claude_pro` capability.

## Usage Windows

### Session (5-hour)

- Available for all plans
- Field: `five_hour.utilization` (0-100%)
- Reset: `five_hour.resets_at` (ISO timestamp)

### Weekly (7-day)

- **Max and Ultra plans**
- Field: `seven_day.utilization` (0-100%)
- Reset: `seven_day.resets_at` (ISO timestamp)

### Opus (7-day model-specific)

- **Max and Ultra plans**
- Field: `seven_day_opus.utilization` (0-100%)
- Reset: `seven_day_opus.resets_at` (ISO timestamp)

### Sonnet (7-day model-specific)

- **Max and Ultra plans**
- Field: `seven_day_sonnet.utilization` (0-100%)
- Tracked but not currently displayed in UI

## Extra Usage (Overage)

Shows additional spend beyond subscription limits.

- Endpoint: `/api/organizations/{id}/overage_spend_limit`
- Only displayed when `is_enabled: true`
- Values in cents, converted to dollars for display
- Fields: `used_credits`, `monthly_credit_limit`, `currency`

## Data Structure

```js
{
  status: 'ok',
  data: {
    plan: 'Max' | 'Pro' | 'Team' | 'Enterprise' | 'Ultra' | 'Free',
    fiveHour: { used: 45, reset: 'ISO-timestamp' },
    weekly: { used: 30, reset: 'ISO-timestamp' },    // Max only, null otherwise
    opus: { used: 20, reset: 'ISO-timestamp' },      // Max only, null otherwise
    sonnet: { used: 10, reset: 'ISO-timestamp' },    // Max only, null otherwise
    extra: { enabled: true, used: 5.50, limit: 20.00 }
  }
}
```

## Error States

| Status       | Meaning                            |
| ------------ | ---------------------------------- |
| `logged_out` | No valid session cookie found      |
| `expired`    | Session cookie expired (401/403)   |
| `error`      | API error or no organization found |

## Key Files

- `src/background/service-worker-core.js` - `fetchClaude()`, `parseWindow()`, `parseOverage()`, `detectPlan()`
- `src/popup/popup.js` - `updateCard()` Claude section
- `src/popup/popup.html` - Claude card template
- `tests/service-worker.test.js` - Claude API tests

## Limitations

- **No local cost tracking** - Chrome extensions cannot access filesystem (`~/.claude/projects`)
- **No OAuth API** - Would require Claude CLI credentials; extension uses web cookies only
- **Extra Usage opt-in** - Only shows when enabled in claude.ai account settings
