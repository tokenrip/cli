# Connections

A **Connection** is an encrypted, server-side credential that turns Tokenrip into a general **API / inference router**. You store an upstream API key once (an LLM provider, a data API, anything HTTP); you, or any current member of the owning team, then call that upstream by name through `rip connection call` (MCP `connection_call`) and the platform injects the auth **server-side** — the caller never sees the plaintext secret. Return to [SKILL.md](../SKILL.md) for decision trees and workflows. For the full model (proxy safeguards, SSRF defense, failure codes, REST endpoints) read `docs/architecture/connections.md`.

## Why a Connection instead of a per-service tool

Point one Connection at any provider whose key you hold and the caller supplies only `--method` + `--path` (+ body). No backend change per integration. The secret stays encrypted at rest and is injected on every call, so a shared key can be *used* by people who never *see* it — the basis for team-owned Connections.

## Ownership: personal vs team

A Connection is owned by a personal account **or** a team (`--team <slug>`), never both.

| Scope | Who can read / list / invoke | Who can create / rotate / disable / delete |
|---|---|---|
| Personal (default) | The owning account | The owning account |
| Team (`--team <slug>`) | Any current team member (members may also create) | The connection's creator or the team owner |

Team ownership is the point: someone configures a key once, every current member can invoke it with `rip connection call --team <slug>`, and nobody ever sees the secret.

## The secret is write-only

Set the secret at create time (and again on rotate) via exactly one of:

- `--secret <value>` — literal (avoid; it lands in shell history)
- `--secret-env <VAR>` — read from an environment variable (preferred)
- `--secret-stdin` — read from stdin (e.g. piped from a secret manager)

The secret is **never returned** by any read command. `rip connection get` / `list` show config (base URL, auth type, allowed paths, default headers/query, quotas) but never the key.

## Lifecycle

```bash
# Create — personal (auth as an Authorization: Bearer header)
export OPENAI_KEY=sk-...
rip connection create --name openai \
  --base-url https://api.openai.com --auth-type bearer \
  --secret-env OPENAI_KEY --allowed-paths '/v1/*'

# Create — team-owned, custom auth header, static default header
export MINIMAX_KEY=sk-...
rip connection create --team quintel --name minimax \
  --base-url https://api.minimax.io/anthropic --auth-type header \
  --auth-header-name x-api-key --secret-env MINIMAX_KEY \
  --allowed-paths '/v1/*' --header anthropic-version=2023-06-01

# List / inspect (secrets never shown)
rip connection list
rip connection list --team quintel --include-disabled
rip connection get <id>
rip connection get <id> --team quintel

# Rotate the secret (same secret-input rules as create)
rip connection rotate-secret <id> --secret-stdin < ./new-key.txt
rip connection rotate-secret <id> --team quintel --secret-env MINIMAX_KEY

# Disable (soft — frees the name for reuse) or delete (hard)
rip connection disable <id>
rip connection rm <id>
rip connection rm <id> --team quintel
```

### Create flags

| Flag | Meaning |
|---|---|
| `--name <name>` | Connection name, unique per owner. This is the handle `call` targets. |
| `--base-url <url>` | Upstream API origin (SSRF-checked; private/loopback addresses are rejected). |
| `--auth-type <type>` | `bearer` (Authorization: Bearer), `header` (custom header — needs `--auth-header-name`), `basic`, or `query`. |
| `--auth-header-name <name>` | Header the secret is injected into when `--auth-type header` (e.g. `x-api-key`). |
| `--allowed-paths <csv>` | Comma-separated path globs a call may hit (`*` matches any chars incl. `/`), e.g. `'/v1/*'`. Omit to allow any path. |
| `--header k=v` | Static **default header**, always sent (repeatable). This is how required provider statics like `anthropic-version` reach upstream — they bypass the caller header allowlist. Must not name the auth header. |
| `--query k=v` | Static **default query** param, always sent (repeatable). |
| `--rate-limit-per-min <n>` | Per-minute call cap (default 60). |
| `--daily-quota <n>` | 24h call cap (default 1000). |
| `--team <slug>` | Make it team-owned (member-invokable; creator or team owner manages it). |

There is no CLI update for non-secret fields — disable + recreate, or use the REST `PATCH /v0/connections/:id` documented in `docs/architecture/connections.md`.

## `rip connection call` — invoking an upstream

Call one of your own personal connections, or a team connection of a team you currently belong to, by name. The call goes straight to the connection; nothing else needs to be set up first. Auth and default headers/query are injected server-side; you provide the method, path, and body. Every call is audited with the calling account (metadata only, never bodies).

```bash
# Team connection (you must be a current member of the team)
rip connection call --team <slug> --connection <name> \
  --method <M> --path <path> [--body <json>] [--query <json>] [--header k=v]

# Personal connection (you own it)
rip connection call --connection <name> --method <M> --path <path>
```

| Flag | Meaning |
|---|---|
| `--team <slug>` | Call the team's connection. A non-member gets `403 CONNECTION_FORBIDDEN`. Omit for a personal connection. |
| `--connection <name>` | The connection name. A missing or disabled one is `404 CONNECTION_NOT_FOUND`. |
| `--method <M>` | `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. |
| `--path <path>` | Path under the connection's base URL; must pass `--allowed-paths`. |
| `--body <json>` | JSON request body (parsed and re-serialized; invalid JSON errors locally). |
| `--query <json>` | JSON object of query params (merged with the connection's `--query` defaults; caller wins on conflict). |
| `--header k=v` | Extra request header (repeatable). Only `Content-Type` / `Accept` / `Accept-Language` / `User-Agent` are forwarded; the connection's defaults and injected auth win. |

### Worked example — MiniMax (Anthropic-compatible)

Using the team `minimax` connection created above (`--auth-header-name x-api-key`, `--header anthropic-version=2023-06-01`, `--allowed-paths '/v1/*'`):

```bash
rip connection call --team quintel --connection minimax \
  --method POST --path /v1/messages \
  --body '{"model":"MiniMax-M2.5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
```

The x-api-key auth and the `anthropic-version` header are added server-side. **Output in human mode is the bare upstream response** `{ status, headers, body, bodyIsJson, latencyMs }` printed as JSON on stdout — so a skill can `JSON.parse(stdout)` directly. `--json` wraps that same object in the standard `{ ok, data }` envelope. Non-streaming responses only; a 30s timeout and a 5MB response cap apply.

## Related

- Concept + safety model (proxy safeguards, SSRF, failure codes, REST endpoints): `docs/architecture/connections.md`
- MiniMax / Anthropic / generic provider configs: the "verified provider configs" table in `docs/architecture/connections.md`
