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
| `GET /api/organizations`                          | Organization UUID (first organization is used)                         |
| `GET /api/organizations/{id}/usage`               | `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet` windows |
| `GET /api/organizations/{id}/overage_spend_limit` | Extra usage: `is_enabled`, `used_credits`, `monthly_credit_limit`      |
| `GET /api/account`                                | `rate_limit_tier`, `billing_type` for plan detection                   |

## Plan Detection

Plan is detected from `rate_limit_tier` in account response, with heuristics:

| Tier                | Display    |
| ------------------- | ---------- |
| `claude_max`        | Max        |
| `claude_pro`        | Pro        |
| `claude_team`       | Team       |
| `claude_enterprise` | Enterprise |
| `claude_ultra`      | Ultra      |

Heuristics:

- If `rate_limit_tier` is missing or unrecognized, but contains `ultra` (case-insensitive), returns Ultra.
- If `billing_type` indicates paid (e.g., `stripe`) and the tier is missing or Claude-like, returns Pro.
- If `capabilities` includes `claude_pro`, returns Pro.
- Otherwise returns Free.

## Usage Windows

### Session (5-hour)

- Available for all plans
- Field: `five_hour.utilization` (0-100%)
- Reset: `five_hour.resets_at` (ISO timestamp)

### Weekly (7-day)

- **Only Max and Ultra plans** (null otherwise)
- Field: `seven_day.utilization` (0-100%)
- Reset: `seven_day.resets_at` (ISO timestamp)

### Opus (7-day model-specific)

- **Only Max and Ultra plans** (null otherwise)
- Field: `seven_day_opus.utilization` (0-100%)
- Reset: `seven_day_opus.resets_at` (ISO timestamp)

### Sonnet (7-day model-specific)

- **Only Max and Ultra plans** (null otherwise)
- Field: `seven_day_sonnet.utilization` (0-100%)
- Tracked in data but not displayed in UI

## Extra Usage (Overage)

Shows additional spend beyond subscription limits.

- Endpoint: `/api/organizations/{id}/overage_spend_limit`
- Only displayed when `is_enabled: true`
- Values in cents, converted to dollars for display
- Fields: `used_credits`, `monthly_credit_limit`
- When the overage endpoint fails or is disabled, `enabled: false` and values are zeroed

## Data Structure

```js
{
  status: 'ok',
  data: {
    plan: 'Max' | 'Pro' | 'Team' | 'Enterprise' | 'Ultra' | 'Free',
    fiveHour: { used: 45, reset: 'ISO-timestamp' },
    weekly: { used: 30, reset: 'ISO-timestamp' },    // Max/Ultra only, null otherwise
    opus: { used: 20, reset: 'ISO-timestamp' },      // Max/Ultra only, null otherwise
    sonnet: { used: 10, reset: 'ISO-timestamp' },    // Max/Ultra only, null otherwise
    extra: { enabled: true, used: 5.50, limit: 20.00 }
  }
}
```

### Raw API Responses (Examples)

`GET /api/organizations`

```js
;[
  {
    uuid: 'org-123',
    capabilities: ['claude_pro'],
  },
]
```

`GET /api/organizations/{id}/usage`

```js
{
  five_hour: { utilization: 45, resets_at: '2026-01-01T05:00:00Z' },
  seven_day: { utilization: 30, resets_at: '2026-01-08T00:00:00Z' },
  seven_day_opus: { utilization: 20, resets_at: '2026-01-08T00:00:00Z' },
  seven_day_sonnet: { utilization: 10, resets_at: '2026-01-08T00:00:00Z' },
}
```

`GET /api/organizations/{id}/overage_spend_limit`

```js
{
  is_enabled: true,
  used_credits: 550,
  monthly_credit_limit: 2000,
}
```

`GET /api/account`

```js
{
  rate_limit_tier: 'claude_pro',
  billing_type: 'stripe',
}
```

### Raw -> Normalized Mapping

- `organizations[0].uuid` -> used to build `/api/organizations/{id}` URLs
- `organizations[0].capabilities` -> fallback plan detection (`claude_pro`)
- `usage.five_hour` -> `data.fiveHour`
- `usage.seven_day` -> `data.weekly` (Max/Ultra only)
- `usage.seven_day_opus` -> `data.opus` (Max/Ultra only)
- `usage.seven_day_sonnet` -> `data.sonnet` (Max/Ultra only)
- `overage_spend_limit.is_enabled` -> `data.extra.enabled`
- `overage_spend_limit.used_credits` -> `data.extra.used` (cents to dollars)
- `overage_spend_limit.monthly_credit_limit` -> `data.extra.limit` (cents to dollars)
- `account.rate_limit_tier` + `account.billing_type` + `organizations[0].capabilities` -> `data.plan`

## Error States

| Status       | Meaning                                      |
| ------------ | -------------------------------------------- |
| `logged_out` | No valid session cookie found                |
| `expired`    | Session cookie expired (401/403)             |
| `error`      | API error, network error, or no organization |

## Key Files

- `src/background/service-worker-core.js` - `fetchClaude()`, `parseWindow()`, `parseOverage()`, `detectPlan()`
- `src/popup/popup.js` - `updateCard()` Claude section
- `src/popup/popup.html` - Claude card template
- `tests/service-worker.test.js` - Claude API tests

## Limitations

- **No local cost tracking** - Chrome extensions cannot access filesystem (`~/.claude/projects`)
- **No OAuth API** - Would require Claude CLI credentials; extension uses web cookies only
- **Extra Usage opt-in** - Only shows when enabled in claude.ai account settings
