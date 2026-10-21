# Connections and credentials

A **Connection** turns Tokenrip into a general **API / inference router**: a named place (base URL, rules, default headers) where you, or any current member of the owning team, call an upstream by name through `rip connection call` (MCP `connection_call`). The key it sends lives in a **credential**: encrypted on the server, injected **server-side** on every call, and never shown to the caller. One credential can serve many connections, and rotating it reaches all of them. Return to [SKILL.md](../SKILL.md) for decision trees and workflows. For the full model (proxy safeguards, SSRF defense, failure codes, REST endpoints) read `docs/architecture/connections.md`.

## Why a Connection instead of a per-service tool

Point one Connection at any provider whose key you hold and the caller supplies only `--method` + `--path` (+ body). No backend change per integration. The key stays encrypted at rest and is injected on every call, so a shared key can be *used* by people who never *see* it — the basis for team-owned connections and credentials.

## Ownership: personal vs team

Connections and credentials are each owned by a personal account **or** a team (`--team <slug>`), never both. A connection uses a credential of the same owner.

| Scope | Who can read / list / invoke | Who can create | Who can manage |
|---|---|---|---|
| Personal (default) | The owning account | The owning account | The owning account |
| Team (`--team <slug>`) | Any current team member | Any current team member | A connection: its creator or the team owner (update, disable, delete). A credential: its creator or the team owner (rename, rotate, restrict, delete, and attach it to a connection) |

Changing an attached connection's base URL, rules, default headers or default query also needs the credential's management right.

## Credentials

```bash
# A plain key (bearer, header or basic placement is chosen on the connection)
export POSTHOG_KEY=phx_...
rip credential create --team quintel --name posthog --secret-env POSTHOG_KEY

# A Google service account: the key file's JSON text, plus 1-20 scope URLs
rip credential create --team quintel --name google --kind google_service_account \
  --key-file ./service-account.json \
  --scope https://www.googleapis.com/auth/analytics.readonly \
  --scope https://www.googleapis.com/auth/webmasters.readonly

rip credential list --team quintel           # each credential and the connections using it
rip credential get posthog --team quintel    # by name in its team, or by id alone: rip credential get <id>

# Replace the key: every connection using it sends the new one from its next call
rip credential rotate posthog --team quintel --secret-env POSTHOG_KEY
rip credential rotate <id> --key-file ./new-key.json

# Rename, or change a Google credential's scopes (--scope replaces the list)
rip credential update posthog --team quintel --name posthog-prod

# Only named team members may call through it (an empty list refuses everyone, the team owner included)
rip credential update posthog-prod --team quintel --restrict --user simon --user alek
rip credential update <id> --unrestrict

# Delete: refused (CREDENTIAL_IN_USE) while any connection, disabled ones included, uses it
rip credential rm <id>
```

- **The key is write-only.** Give it with exactly one of `--secret <value>` (avoid; it lands in shell history), `--secret-env <VAR>` (preferred), `--secret-stdin` (piped from a secret manager) or `--key-file <path>` (the file's text, verbatim). No read ever returns it.
- **Kinds:** `secret` (default) is sent as is. `google_service_account` holds a Google key file and its scopes; the server trades it for short-lived tokens itself. Its connections must use `bearer` and an `https` base URL on `googleapis.com` (for example `https://analyticsdata.googleapis.com` or `https://searchconsole.googleapis.com`), so a Google token only goes to Google. Rotating does not revoke the old key at Google: delete it in Google Cloud.
- **Names** are lowercase and unique per owner. Commands take the credential's **id** alone (from `list`; a team's too, no `--team` needed) or its **name**: with `--team <slug>` for a team's, without for your personal one. `--team` beside an id is refused (`INVALID_FIELD`). `rip connection create --credential` takes either, under the new connection's owner.
- **Named users** apply to team credentials only. `--user` takes an account alias or id, each a current member; it replaces the list and needs the credential to be restricted after the update. `--unrestrict` clears the list. A member who leaves the team is dropped from every list.

## Connections

```bash
# Attach an existing credential (authType defaults to bearer)
rip connection create --team quintel --name ga4 --credential google \
  --base-url https://analyticsdata.googleapis.com \
  --allowed-paths 'POST /v1beta/properties/*:runReport'

# Or create the key inline: it becomes a credential named after the connection
export OPENAI_KEY=sk-...
rip connection create --name openai \
  --base-url https://api.openai.com --auth-type bearer \
  --secret-env OPENAI_KEY --allowed-paths 'GET /v1/models,POST /v1/chat/completions'

# Team-owned, custom auth header, static default header
export MINIMAX_KEY=sk-...
rip connection create --team quintel --name minimax \
  --base-url https://api.minimax.io/anthropic --auth-type header \
  --auth-header-name x-api-key --secret-env MINIMAX_KEY \
  --allowed-paths 'POST /v1/messages' --header anthropic-version=2023-06-01

# List / inspect (keys never shown; each shows its credential, its rules and "can call")
rip connection list
rip connection list --team quintel --include-disabled
rip connection get minimax --team quintel    # by name in its team, or by id alone: rip connection get <id>

# Disable (soft — frees the connection's name; it keeps its credential) or delete (hard; the credential stays)
rip connection disable <id>
rip connection rm minimax --team quintel
```

A connection is named the same way as a credential: its id alone, or its name (with `--team <slug>` for a team's). To replace a key, rotate its credential: `rip credential rotate <credential>`; every connection using it sends the new key.

### Create flags

| Flag | Meaning |
|---|---|
| `--name <name>` | Connection name, unique per owner. This is the handle `call` targets. |
| `--base-url <url>` | Upstream API origin (SSRF-checked; private/loopback addresses are rejected). Calls stay under its path. |
| `--credential <name\|id>` | Use an existing credential of the same owner (needs its management right). Without it, give `--auth-type` and a secret flag. |
| `--auth-type <type>` | `bearer` (Authorization: Bearer), `header` (custom header — needs `--auth-header-name`) or `basic`. Required without `--credential`; defaults to `bearer` with it. |
| `--auth-header-name <name>` | Header the key is injected into when `--auth-type header` (e.g. `x-api-key`). |
| `--secret`, `--secret-env`, `--secret-stdin` | Without `--credential`: the key, kept as a new credential named after the connection (409 `CREDENTIAL_NAME_TAKEN` if that name exists: attach it with `--credential` instead). |
| `--allowed-paths <csv>` | Comma-separated rules (below). Omit to allow any method and path. |
| `--header k=v` | Static **default header**, always sent (repeatable). This is how required provider statics like `anthropic-version` reach upstream — they bypass the caller header allowlist. Must not name the auth header. |
| `--query k=v` | Static **default query** param, always sent (repeatable). |
| `--rate-limit-per-min <n>` | Per-minute call cap (default 60). |
| `--daily-quota <n>` | 24h call cap (default 1000). |
| `--team <slug>` | Make it team-owned (member-invokable; creator or team owner manages it). |

### Rules (`--allowed-paths`)

Each rule is `[METHOD[|METHOD…] ]/path`: optional methods from `GET POST PUT PATCH DELETE` joined by `|`, one space, then a pattern starting with `/`. No method means any method.

- `*` matches within one path segment (never `/`); `**` matches any run, `/` included. Every other character is literal.
- Rules judge the path as sent, minus the base URL's path, still percent-encoded and without the query: write them as sent (`/webmasters/v3/sites/*/searchAnalytics/query` matches `…/sites/https%3A%2F%2Ftokenrip.com%2F/…`).
- A call passes when any rule allows it; otherwise `403 PATH_NOT_ALLOWED`. A path with `.` or `..` segments (encoded or not), a backslash, or bad percent-encoding is refused with `400 PATH_NOT_CANONICAL` and nothing is sent.
- Examples: `POST /v1/messages`, `GET|POST /api/**`, `POST /v1beta/properties/*:runReport`.

There is no CLI update for non-secret connection fields — disable + recreate, or use the REST `PATCH /v0/connections/:connection` documented in `docs/architecture/connections.md`.

## `rip connection call` — invoking an upstream

Call one of your own personal connections, or a team connection of a team you currently belong to, by name, or any of them by its id alone. The call goes straight to the connection; nothing else needs to be set up first. Auth and default headers/query are injected server-side; you provide the method, path, and body. Every call is audited with the calling account (metadata only, never bodies).

```bash
# Team connection (you must be a current member of the team)
rip connection call --team <slug> --connection <name> \
  --method <M> --path <path> [--body <json>] [--query <json>] [--header k=v]

# Personal connection (you own it)
rip connection call --connection <name> --method <M> --path <path>
```

| Flag | Meaning |
|---|---|
| `--team <slug>` | Call the team's connection by name. A non-member, or a member not named on a restricted credential, gets `403 CONNECTION_FORBIDDEN`. Omit for a personal connection or an id. |
| `--connection <id\|name>` | The connection's id, or its name. A missing or disabled one, or an id you cannot reach, is `404 CONNECTION_NOT_FOUND`. |
| `--method <M>` | `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. |
| `--path <path>` | Path under the connection's base URL; the method and path must pass the connection's rules. |
| `--body <json>` | JSON request body (parsed and re-serialized; invalid JSON errors locally). |
| `--query <json>` | JSON object of query params (merged with the connection's `--query` defaults; caller wins on conflict). |
| `--header k=v` | Extra request header (repeatable). Only `Content-Type` / `Accept` / `Accept-Language` / `User-Agent` are forwarded; the connection's defaults and injected auth win. |

### Worked example — MiniMax (Anthropic-compatible)

Using the team `minimax` connection created above (`--auth-header-name x-api-key`, `--header anthropic-version=2023-06-01`, `--allowed-paths 'POST /v1/messages'`):

```bash
rip connection call --team quintel --connection minimax \
  --method POST --path /v1/messages \
  --body '{"model":"MiniMax-M2.5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
```

The x-api-key auth and the `anthropic-version` header are added server-side. **Output in human mode is the bare upstream response** `{ status, headers, body, bodyIsJson, latencyMs }` printed as JSON on stdout — so a skill can `JSON.parse(stdout)` directly. `--json` wraps that same object in the standard `{ ok, data }` envelope. Non-streaming responses only; a 30s timeout and a 5MB response cap apply.

## Related

- Concept + safety model (proxy safeguards, SSRF, failure codes, REST endpoints): `docs/architecture/connections.md`
- MiniMax / Anthropic / generic provider configs: the "verified provider configs" table in `docs/architecture/connections.md`
