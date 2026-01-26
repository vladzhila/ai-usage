# Cursor Provider

Cursor provider fetches usage data from cursor.com Web API using browser session cookies.

## Data Source

Uses browser cookies (automatic via Chrome extension cookies API).

**Cookie required:**

- Name: `WorkosCursorSessionToken`, `__Secure-next-auth.session-token`, or `next-auth.session-token`
- Domain: `cursor.com` or `cursor.sh`
- Value: any non-empty string

## API Endpoints

| Endpoint                 | Returns                                         |
| ------------------------ | ----------------------------------------------- |
| `GET /api/usage-summary` | `membershipType`, `billingCycleEnd`, usage data |
| `GET /api/auth/me`       | User `email`, `sub` (user ID)                   |
| `GET /api/usage`         | Legacy request-based usage (gpt-4 requests)     |

Primary endpoints called in parallel. Legacy endpoint used as fallback when `individualUsage` is missing.

## Plan Detection

Plan is detected from `membershipType` in usage response:

| Type         | Display    |
| ------------ | ---------- |
| `free`       | Free       |
| `pro`        | Pro        |
| `pro_plus`   | Pro+       |
| `ultra`      | Ultra      |
| `hobby`      | Hobby      |
| `team`       | Team       |
| `enterprise` | Enterprise |
| (legacy)     | Legacy     |

Unknown types are title-cased. Fallback: "Cursor". Legacy plans detected when `individualUsage` is missing.

## Usage Window

### Billing Cycle (monthly)

- Single window based on monthly billing cycle
- Usage: `individualUsage.plan.used` (cents)
- Limit: `individualUsage.plan.limit` (cents)
- Reset: `billingCycleEnd` (ISO 8601 timestamp)
- Returned as percentage (0-100%)
- Falls back to `individualUsage.plan.totalPercentUsed` when plan limits are missing

### On-Demand Spend

- Field: `individualUsage.onDemand.used` (cents)
- Converted to dollars for internal tracking
- Displayed in popup UI when usage is greater than $0

## Usage Breakdown

Auto vs API percentage breakdown fields are present in the API but are not currently displayed in the popup UI.

- Field: `individualUsage.plan.autoPercentUsed` (0-1 float)
- Field: `individualUsage.plan.apiPercentUsed` (0-1 float)

## Team Usage

Team on-demand spend fields are present in the API but are not currently displayed in the popup UI.

- Field: `teamUsage.onDemand.used` (cents)
- Field: `teamUsage.onDemand.limit` (cents, optional)

## Legacy Plans

Request-based usage for older Cursor plans.

- Endpoint: `GET /api/usage?user={sub}` (fallback)
- Triggered when `individualUsage` is missing from usage-summary
- Field: `gpt-4.numRequestsTotal` (preferred) or `gpt-4.numRequests` - requests used
- Field: `gpt-4.maxRequestUsage` - max requests (default 500)
- Displayed as percentage + "X / Y" request count
- Plan shows as "Legacy"

## Data Structure

### Standard Response

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
    legacy: { requests: 250, max: 500 }, // legacy only
  }
}
```

### Legacy Response

```js
{
  status: 'ok',
  data: {
    plan: 'Legacy',
    used: 50,           // percentage (0-100)
    limit: 100,
    reset: null,
    onDemand: 0,
    email: 'user@example.com',
    legacy: { requests: 250, max: 500 },
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

- `src/background/service-worker.js` - `fetchCursorUsage()`, API URLs, legacy fallback
- `src/background/service-worker-core.js` - `fetchCursor()`, `parseCursorSummary()`, `parseLegacyCursor()`, `formatCursorPlan()`
- `src/popup/popup.js` - `updateCard()` Cursor section with breakdown/legacy/team
- `src/popup/popup.html` - Cursor card template
- `tests/service-worker.test.js` - Cursor API + `parseLegacyCursor()` tests

## Limitations

- **Percentage normalized** - Returns 0-100%, actual limits not exposed in UI
- **Deeply nested API** - Usage at `usage.usage.individualUsage.plan.used`
- **On-demand conditional** - Only shown when usage is greater than $0
- **No hourly/daily granularity** - Only monthly billing cycle tracking
- **Breakdown optional** - Auto/API split only available on some accounts
- **Legacy detection** - Relies on missing `individualUsage` to trigger fallback
