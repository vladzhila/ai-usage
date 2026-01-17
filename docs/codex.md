# Codex (ChatGPT) Provider

Codex provider fetches usage data from chatgpt.com Web API using browser session cookies.

## Data Source

Uses browser cookies (automatic via Chrome extension cookies API).

**Cookie required:**

- Name: `__Secure-next-auth.session-token`
- Domain: `chatgpt.com`
- Value: any non-empty string

## API Endpoints

| Endpoint                      | Returns                           |
| ----------------------------- | --------------------------------- |
| `GET /api/auth/session`       | `accessToken` for Bearer auth     |
| `GET /backend-api/wham/usage` | `plan_type`, `rate_limit` windows |

The usage endpoint requires `Authorization: Bearer ${accessToken}` header.

## Plan Detection

Plan is detected from `plan_type` in usage response:

| Value   | Display |
| ------- | ------- |
| `Plus`  | Plus    |
| (empty) | Free    |

No tier mapping - uses API value directly.

## Usage Windows

### Session (3-hour)

- Field: `rate_limit.primary_window`
- Usage: `used_percent` (0-100%)
- Reset: `reset_at` (Unix timestamp in seconds, converted to ms)

### Weekly (7-day)

- Field: `rate_limit.secondary_window`
- Usage: `used_percent` (0-100%)
- Reset: `reset_at` (Unix timestamp in seconds, converted to ms)

## Data Structure

```js
{
  status: 'ok',
  data: {
    plan: 'Plus' | 'Free',
    session: { used: 45, reset: 'Unix-timestamp-ms' },
    weekly: { used: 30, reset: 'Unix-timestamp-ms' },
  }
}
```

## Error States

| Status       | Meaning                           |
| ------------ | --------------------------------- |
| `logged_out` | No valid session cookie found     |
| `expired`    | Session cookie expired (401/403)  |
| `error`      | API error or missing access token |

## Key Files

- `src/background/service-worker.js` - `fetchCodex()`, API URLs, error messages
- `src/background/service-worker-core.js` - `getCookie()`, `isValid()`, cookie config
- `src/popup/popup.js` - `updateCard()` Codex section with dual windows
- `src/popup/popup.html` - Codex card template
- `src/lib/constants.js` - `CHATGPT_SESSION_WINDOW_MS` (3 hours)
- `tests/service-worker.test.js` - Codex API tests

## Limitations

- **No absolute limits** - API returns percentage only, not actual message counts
- **No plan tier details** - Only knows Plus vs Free, no granular feature info
- **Two-step auth** - Must fetch session first to get access token
- **Timestamp conversion** - API returns seconds, code converts to milliseconds
