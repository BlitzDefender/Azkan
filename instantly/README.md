# Instantly API Integration

Notes and setup for working against the [Instantly](https://instantly.ai) v2
REST API — cold email campaigns, leads, sender accounts, and analytics.

Reference docs: <https://developer.instantly.ai>

## Credentials

**Never commit an API key.** Keys live in `.env`, which is gitignored.

```bash
cp .env.example .env
# then edit .env and paste your key
```

```
INSTANTLY_API_KEY=your_key_here
```

### Where keys come from

Generate a v2 key in the Instantly dashboard under **Settings → Integrations →
API**, or via the API itself (`POST /api/v2/api-keys`). v1 keys do **not** work
against v2 endpoints — the two schemes are separate and a v2 key must be
generated explicitly.

A v2 key is base64 of `<workspace-uuid>:<secret>`. That means the key is
*encoded*, not *encrypted* — anyone holding the string can decode the workspace
ID and secret. Treat it exactly like a password.

API v2 access requires the **Growth plan or above**.

### Scopes

Keys are scoped at creation time and can be revoked individually without
disturbing other integrations. Scopes follow a `resource:action` shape:

| Scope | Grants |
|---|---|
| `all:all` | Everything — avoid outside of local development |
| `all:read` | Read-only across every resource |
| `all:create` / `all:update` / `all:delete` | That verb across every resource |
| `campaigns:read`, `leads:create`, … | A single verb on a single resource |
| `campaigns:all`, `api_keys:all`, … | Every verb on a single resource |

Resource names in scopes are snake_case and plural, and do not always match the
URL segment — `/api-keys` is `api_keys:*`, `/email-verification` is
`email_verifications:*`. Each endpoint's docs page lists the scopes that satisfy
it.

Prefer the narrowest scope that works. A reporting dashboard wants `all:read`;
only a lead-import job needs `leads:create`.

## Making requests

Base URL: `https://api.instantly.ai/api/v2`

Authenticate with a bearer token:

```bash
curl https://api.instantly.ai/api/v2/campaigns?limit=10 \
  -H "Authorization: Bearer $INSTANTLY_API_KEY"
```

```js
const res = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=10", {
  headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
});
```

## Resources

| Group | Path | What it covers |
|---|---|---|
| Campaigns | `/campaigns` | Create, list, fetch, update; launch, pause, schedule; sequences, A/B variants, sender assignment |
| Leads | `/leads` | Create, fetch, update, delete; bulk add; move between campaigns/lists; interest status |
| Lead lists | `/lead-lists` | Grouping leads independently of campaigns |
| Accounts | `/accounts` | Sender mailboxes: add, update, remove; sending limits and warmup |
| Email verification | `/email-verification` | Single and bulk checks — syntax, MX, deliverability, risk scoring |
| Inbox placement | `/inbox-placement-tests` | Placement tests across major mailbox providers |
| Webhooks | `/webhooks` | Subscriptions for sent, opened, replied, bounced, unsubscribed events |
| Analytics | `/campaigns/analytics` | Plus `/campaigns/analytics/overview` and `/campaigns/analytics/daily`: sent, open, click, reply, bounce, unsubscribe |
| API keys | `/api-keys` | Create, list, revoke (`DELETE /api-keys/{id}`); scopes are fixed at creation |
| Workspaces | `/workspaces` | Multi-tenant boundaries; `GET /workspaces/current` resolves the workspace behind the key |

Two things the table shape hides:

- **Listing leads is a POST, not a GET.** `POST /leads/list` with the filters in
  the body — `GET /leads` is not a list endpoint. Every other group here lists
  with a plain `GET`.
- **Analytics is not one group.** Campaign metrics live under `/campaigns/analytics*`,
  warmup metrics under `/accounts`, and inbox-placement metrics under their own
  `/inbox-placement-analytics` resource.

## Pagination

List endpoints are cursor-based, not offset-based. Pass `limit`, and pass
`starting_after` with the ID of the last item you saw. Responses carry
`next_starting_after`; feed it back in to get the following page, and stop when
it comes back absent. The cursor is not always a UUID — depending on the
endpoint it may be a timestamp or an email — so treat it as an opaque string
rather than parsing it.

```
GET /api/v2/api-keys?limit=10&starting_after=01956fbd-0eb1-72db-a565-82977a586084
```

```js
async function* paginate(path, key, limit = 100) {
  let cursor;
  do {
    const url = new URL(`https://api.instantly.ai/api/v2/${path}`);
    url.searchParams.set("limit", limit);
    if (cursor) url.searchParams.set("starting_after", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

    const page = await res.json();
    yield* page.items ?? [];
    cursor = page.next_starting_after;
  } while (cursor);
}
```

## Rate limits

6,000 requests per minute. Two things to know about how that budget is counted:

- It is shared between v1 and v2 — using both does not double it.
- It applies per **workspace**, not per key. Issuing more API keys does not buy
  more throughput, so a runaway job on one key will throttle every other
  integration in the same workspace.

Exceeding it returns **429**. Back off exponentially and retry rather than
hammering.

## Handling errors

Standard HTTP status codes apply. The ones worth branching on:

- `401` — missing, malformed, or revoked key.
- `403` — key is valid but lacks the scope for this call. Check the scopes it
  was created with; this is not fixable by retrying.
- `429` — rate limited. Back off and retry.
- `5xx` — transient on Instantly's side. Retry with backoff.
