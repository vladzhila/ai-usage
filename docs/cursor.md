# Cursor Provider

Cursor provider fetches usage data from cursor.com Web API using browser session cookies.

## Data Source

Uses browser cookies (automatic via Chrome extension cookies API).

**Cookie required:**

- Name: `WorkosCursorSessionToken`
- Domain: `cursor.com`
- Value: any non-empty string

## API Endpoints

| Endpoint                 | Returns                                         |
| ------------------------ | ----------------------------------------------- |
| `GET /api/usage-summary` | `membershipType`, `billingCycleEnd`, usage data |
| `GET /api/auth/me`       | User `email`                                    |

Both endpoints called in parallel.

## Plan Detection

Plan is detected from `membershipType` in usage response:

| Type         | Display    |
| ------------ | ---------- |
| `free`       | Free       |
| `pro`        | Pro        |
| `hobby`      | Hobby      |
| `team`       | Team       |
| `enterprise` | Enterprise |

Unknown types are title-cased. Fallback: "Cursor".

## Usage Window

### Billing Cycle (monthly)

- Single window based on monthly billing cycle
- Usage: `individualUsage.plan.used` (cents)
- Limit: `individualUsage.plan.breakdown.total` or `individualUsage.plan.limit` (cents)
- Reset: `billingCycleEnd` (ISO 8601 timestamp)
- Returned as percentage (0-100%)

### On-Demand Spend

- Field: `individualUsage.onDemand.used` (cents)
- Converted to dollars for internal tracking
- Not currently displayed in popup UI

## Data Structure

```js
{
  status: 'ok',
  data: {
    plan: 'Pro' | 'Free' | 'Hobby' | 'Team' | 'Enterprise',
    used: 25,           // percentage (0-100)
    limit: 100,         // always normalized to 100
    reset: 'Unix-timestamp-ms',
    onDemand: 5.00,     // dollars (tracked, not displayed)
    email: 'user@example.com',
  }
}
```

## Error States

| Status       | Meaning                          |
| ------------ | -------------------------------- |
| `logged_out` | No valid session cookie found    |
| `expired`    | Session cookie expired (401/403) |
| `error`      | API error or no data returned    |

## Key Files

- `src/background/service-worker.js` - `fetchCursorUsage()`, API URLs, error messages
- `src/background/service-worker-core.js` - `fetchCursor()`, `parseCursorSummary()`, `formatCursorPlan()`, cookie config
- `src/popup/popup.js` - `updateCard()` Cursor section (single window)
- `src/popup/popup.html` - Cursor card template
- `tests/service-worker.test.js` - Cursor API tests

## Limitations

- **Single window only** - No per-model or session breakdown like Claude Max
- **Percentage normalized** - Returns 0-100%, actual limits not exposed in UI
- **Deeply nested API** - Usage at `usage.usage.individualUsage.plan.used`
- **On-demand unused** - Tracked internally but not shown in popup
- **No hourly/daily granularity** - Only monthly billing cycle tracking
