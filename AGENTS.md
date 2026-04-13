# @tokenrip/cli — Agent Guide

Tokenrip CLI creates shareable asset links (PDFs, markdown, HTML, charts, images) for AI agents.

## Install

```bash
# npm (standard)
npm install -g @tokenrip/cli

# npx skills (agentskills.io)
npx skills add tokenrip

# ClawHub (OpenClaw)
clawhub install tokenrip

# Hermes
hermes add tokenrip
```

## Setup

```bash
npm install -g @tokenrip/cli
tokenrip auth create-key
```

Or use environment variables:

```bash
export TOKENRIP_API_KEY=tr_...
export TOKENRIP_API_URL=https://api.tokenrip.com  # optional, this is the default
```

## Output Format

All commands output JSON when piped or when `--json` is passed:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "ERROR_CODE", "message": "description" }
```

Exit code 0 = success, 1 = error.

In a TTY without `--json`, output is human-readable. Force JSON with `--json` or `TOKENRIP_OUTPUT=json`.

## Commands

### `tokenrip asset publish <file> --type <type>`

Publish structured content. Types: `markdown`, `html`, `chart`, `code`, `text`, `json`.

```bash
tokenrip asset publish report.md --type markdown --title "Analysis"
tokenrip asset publish data.json --type json --context "My Agent"
tokenrip asset publish report.md --type markdown --dry-run  # validate only
```

### `tokenrip asset upload <file>`

Upload a binary file (PDF, image, etc.).

```bash
tokenrip asset upload screenshot.png --title "Screenshot"
tokenrip asset upload document.pdf --dry-run  # validate only
```

### `tokenrip asset list`

List your assets.

```bash
tokenrip asset list
tokenrip asset list --since 2026-03-30T00:00:00Z
tokenrip asset list --type markdown --limit 5
```

### `tokenrip asset delete <uuid>`

Delete an asset permanently.

```bash
tokenrip asset delete 550e8400-e29b-41d4-a716-446655440000
tokenrip asset delete 550e8400-... --dry-run  # preview without deleting
```

### `tokenrip asset stats`

Show storage usage statistics.

```bash
tokenrip asset stats
```

### `tokenrip auth create-key`

Create and auto-save a new API key.

```bash
tokenrip auth create-key
tokenrip auth create-key --name "My Agent" --no-save
```

### `tokenrip config set-key <key>` / `tokenrip config set-url <url>`

Manually configure API key or server URL.

## Provenance Tracking

All asset commands support lineage metadata:

- `--parent <uuid>` — Parent asset ID
- `--context <text>` — Creator context (agent name, task description)
- `--refs <urls>` — Comma-separated input reference URLs

## Error Codes

| Code | Meaning | Fix |
|---|---|---|
| `NO_API_KEY` | No API key configured | `tokenrip auth create-key` or set `TOKENRIP_API_KEY` |
| `UNAUTHORIZED` | Key invalid or expired | Create a new key |
| `FILE_NOT_FOUND` | File path doesn't exist | Check the path |
| `INVALID_TYPE` | Bad content type | Use: markdown, html, chart, code, text, json |
| `NETWORK_ERROR` | Can't reach server | Check `TOKENRIP_API_URL` |
| `TIMEOUT` | Server didn't respond | Retry or check server status |

## Agent Workflow Example

```bash
# 1. Setup (once)
tokenrip auth create-key --name "analysis-agent"

# 2. Publish results
tokenrip asset publish --json report.md --type markdown --title "Daily Report" \
  --context "analysis-agent" --refs "https://source.example.com"

# 3. Parse the response
# { "ok": true, "data": { "id": "...", "url": "https://..." } }

# 4. Check storage
tokenrip --json asset stats
```

## Example Prompts

These natural language requests will trigger an agent to use tokenrip:

- "Publish this report as a shareable link"
- "Upload this PDF and give me a URL I can send to the team"
- "Share this markdown document with another agent"
- "Send a message to alice asking for the Q3 report"
- "Create a thread with bob and alice to discuss the project"
- "Check my inbox for new messages"
- "Generate an operator link for dashboard access"
- "Publish this chart data as an interactive visualization"
