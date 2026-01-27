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

Primary endpoints called in parallel. Legacy endpoint used as fallback when `individualUsage` is missing and the user response includes `sub`.

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

Unknown types are title-cased. Fallback: "Cursor". Legacy plans detected when `individualUsage` is missing and `sub` is available.

## Usage Window

### Billing Cycle (monthly)

- Single window based on monthly billing cycle
- Usage: `individualUsage.plan.used` (cents)
- Limit: `individualUsage.plan.limit` (cents)
- Reset: `billingCycleEnd` (ISO 8601 timestamp, parsed via `Date.parse`, null if invalid)
- Returned as percentage (can exceed 100%)
- Falls back to `individualUsage.plan.totalPercentUsed` when plan limits are missing
- `totalPercentUsed` may be 0-1 or 0-100 (normalized to 0-100)

### On-Demand Spend

- Field: `individualUsage.onDemand.used` (cents)
- Converted to dollars for internal tracking
- Displayed in popup UI when usage is greater than $0
- If `onDemand.limit` is missing, the limit display is hidden

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
    plan: 'Pro' | 'Pro+' | 'Ultra' | 'Free' | 'Hobby' | 'Team' | 'Enterprise' | 'Cursor',
    used: 25,           // percentage (can exceed 100)
    limit: 100,         // always normalized to 100
    reset: 'Unix-timestamp-ms',
    onDemand: 5.00,     // dollars, displayed when > 0
    onDemandLimit: 20.00, // dollars, optional (null if unlimited)
    email: 'user@example.com',
    legacy: { requests: 250, max: 500 }, // legacy only
  }
}
```

### Raw `/api/usage-summary` Response (Example)

```js
{
  billingCycleStart: '2025-12-30T14:19:04.000Z',
  billingCycleEnd: '2026-01-30T14:19:04.000Z',
  membershipType: 'pro_plus',
  limitType: 'user',
  isUnlimited: false,
  autoModelSelectedDisplayMessage: "You've used 6% of your included total usage",
  namedModelSelectedDisplayMessage: "You've used 28% of your included API usage",
  individualUsage: {
    plan: {
      enabled: true,
      used: 3097,
      limit: 7000,
      remaining: 3903,
      breakdown: { included: 3097, bonus: 0, total: 3097 },
      autoPercentUsed: 0,
      apiPercentUsed: 28.154545454545456,
      totalPercentUsed: 6.072549019607843,
    },
    onDemand: {
      enabled: true,
      used: 0,
      limit: 1000,
      remaining: 1000,
    },
  },
  teamUsage: {},
}
```

### Raw -> Normalized Mapping

- `usage-summary.membershipType` -> `data.plan` (via `formatCursorPlan`)
- `usage-summary.billingCycleEnd` -> `data.reset` (ISO to ms)
- `usage-summary.individualUsage.plan.used` + `plan.limit` -> `data.used` percent, `data.limit = 100`
- `usage-summary.individualUsage.plan.totalPercentUsed` -> fallback for `data.used` when `plan.limit` missing
- `usage-summary.individualUsage.onDemand.used` -> `data.onDemand` (cents to dollars)
- `usage-summary.individualUsage.onDemand.limit` -> `data.onDemandLimit` (cents to dollars, null if missing)
- `auth/me.email` -> `data.email`
- Legacy flow (`/api/usage?user={sub}`) -> `data.legacy` and `plan: 'Legacy'`

### Legacy Response

```js
{
  status: 'ok',
  data: {
    plan: 'Legacy',
    used: 50,           // percentage (can exceed 100)
    limit: 100,
    reset: null,
    onDemand: 0,
    email: 'user@example.com',
    legacy: { requests: 250, max: 500 },
  }
}
```

## Error States

| Status       | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `logged_out` | No valid session cookie found                        |
| `expired`    | Usage or user endpoint returned 401/403              |
| `error`      | API error, missing usage/user data, or network issue |

## Key Files

- `src/background/service-worker.js` - `fetchCursorUsage()`, API URLs, legacy fallback
- `src/background/service-worker-core.js` - `fetchCursor()`, `parseCursorSummary()`, `parseLegacyCursor()`, `formatCursorPlan()`
- `src/popup/popup.js` - `updateCard()` Cursor section with breakdown/legacy/team
- `src/popup/popup.html` - Cursor card template
- `tests/service-worker.test.js` - Cursor API + `parseLegacyCursor()` tests

## Limitations

- **Percent can exceed 100** - Usage can be above plan limit
- **Deeply nested API** - Usage at `usage.usage.individualUsage.plan.used`
- **On-demand conditional** - Only shown when usage is greater than $0
- **No hourly/daily granularity** - Only monthly billing cycle tracking
- **Breakdown optional** - Auto/API split only available on some accounts
- **Legacy detection** - Requires missing `individualUsage` and user `sub`
