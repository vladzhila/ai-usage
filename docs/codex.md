# Codex (ChatGPT) Provider

Codex provider fetches usage data from chatgpt.com Web API using browser session cookies.

## Data Source

Uses browser cookies (automatic via Chrome extension cookies API).

**Cookie required:**

- Name: `__Secure-next-auth.session-token` or `next-auth.session-token`
- Domain: `chatgpt.com`
- Value: any non-empty string

## API Endpoints

| Endpoint                      | Returns                           |
| ----------------------------- | --------------------------------- |
| `GET /api/auth/session`       | `accessToken` for Bearer auth     |
| `GET /backend-api/wham/usage` | `plan_type`, `rate_limit` windows |

The usage endpoint requires `Authorization: Bearer ${accessToken}` header.
If the session response does not include `accessToken`, the provider returns `expired`.

## Plan Detection

Plan is detected from `plan_type` in usage response via `formatCodexPlan()`:

| Value                   | Display        |
| ----------------------- | -------------- |
| `guest`                 | Guest          |
| `free`                  | Free           |
| `go`                    | Go             |
| `plus`                  | Plus           |
| `pro`                   | Pro            |
| `free_workspace`        | Free Workspace |
| `team`                  | Team           |
| `business`              | Business       |
| `education`             | Education      |
| `quorum`                | Quorum         |
| `k12`                   | K-12           |
| `enterprise`            | Enterprise     |
| `edu`                   | Education      |
| (empty/whitespace/null) | Free           |

Unknown types are title-cased.

## Usage Windows

### Session (3-hour)

- Field: `rate_limit.primary_window`
- Usage: `used_percent` (0-100%)
- Reset: `reset_at` (Unix timestamp in seconds, converted to ms)
- If the window is missing, `used` defaults to 0 and `reset` is null

### Weekly (7-day)

- Field: `rate_limit.secondary_window`
- Usage: `used_percent` (0-100%)
- Reset: `reset_at` (Unix timestamp in seconds, converted to ms)
- If the window is missing, `used` defaults to 0 and `reset` is null

## Credits

API credits for additional usage beyond subscription limits.

- Field: `credits` object in usage response
- `has_credits` - boolean, whether credits are available
- `unlimited` - boolean, unlimited credits enabled
- `balance` - number, current credit balance (parsed with `parseFloat`, defaults to 0)
- Displayed as "X.XX credits" or "Unlimited"
- Only shown when `has_credits`, `unlimited`, or `balance > 0`

## Data Structure

```js
{
  status: 'ok',
  data: {
    plan: 'Plus' | 'Pro' | 'Team' | 'Business' | 'Enterprise' | 'Free' | ...,
    session: { used: 45, reset: 'Unix-timestamp-ms' },
    weekly: { used: 30, reset: 'Unix-timestamp-ms' },
    credits: { has: true, unlimited: false, balance: 10.50 },
  }
}
```

### Raw API Responses (Examples)

`GET /api/auth/session`

```js
{
  accessToken: 'eyJhbGciOi...'
}
```

`GET /backend-api/wham/usage`

```js
{
  plan_type: 'plus',
  rate_limit: {
    primary_window: { used_percent: 45, reset_at: 1735756800 },
    secondary_window: { used_percent: 30, reset_at: 1736361600 },
  },
  credits: {
    has_credits: true,
    unlimited: false,
    balance: '10.5',
  },
}
```

### Raw -> Normalized Mapping

- `usage.plan_type` -> `data.plan` (via `formatCodexPlan`)
- `usage.rate_limit.primary_window.used_percent` -> `data.session.used`
- `usage.rate_limit.primary_window.reset_at` -> `data.session.reset` (seconds to ms)
- `usage.rate_limit.secondary_window.used_percent` -> `data.weekly.used`
- `usage.rate_limit.secondary_window.reset_at` -> `data.weekly.reset` (seconds to ms)
- `usage.credits.has_credits` -> `data.credits.has`
- `usage.credits.unlimited` -> `data.credits.unlimited`
- `usage.credits.balance` -> `data.credits.balance` (parseFloat, default 0)
- Missing windows -> `used: 0`, `reset: null`

## Error States

| Status       | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `logged_out` | No valid session cookie found                                        |
| `expired`    | Session or usage endpoint returned 401/403, or token missing         |
| `error`      | API error or network issue (catch returns "Refresh chatgpt.com tab") |

## Key Files

- `src/background/service-worker.js` - `fetchCodex()`, API URLs, credits parsing
- `src/background/service-worker-core.js` - `formatCodexPlan()`, `getCookie()`, `isValid()`, cookie config
- `src/popup/popup.js` - `updateCard()` Codex section with dual windows + credits
- `src/popup/popup.html` - Codex card template
- `src/lib/format.js` - `formatSessionReset()`, `formatWeeklyResetWithCountdown()`
- `tests/service-worker.test.js` - Codex API + `formatCodexPlan()` tests

## Limitations

- **No absolute limits** - API returns percentage only, not actual message counts
- **Plan label only** - Uses `plan_type` string, no granular feature info
- **Two-step auth** - Must fetch session first to get access token
- **Timestamp conversion** - API returns seconds, code converts to milliseconds
