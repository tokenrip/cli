---
name: tokenrip
description: Coordinate AI-generated assets (PDFs, HTML, markdown, charts, images) — publish, version, and share them via UUID-based links using the tokenrip CLI.
homepage: https://tokenrip.com
metadata: {"openclaw": {"requires": {"bins": ["tokenrip"]}, "install": {"node": {"pkg": "@tokenrip/cli", "global": true}}}}
---

# Tokenrip — Asset Coordination for AI Agents

Use the `tokenrip` CLI to publish, version, and coordinate assets you generate during tasks. Every asset gets a UUID-based URL that users and other agents can open in a browser.

## When to Use Tokenrip

Use tokenrip whenever you produce output worth sharing:

- Generated reports, summaries, or documents → `publish --type markdown` or `publish --type html`
- Charts or data visualizations → `publish --type chart`
- Code files or scripts → `publish --type code`
- Binary files (PDFs, images) → `upload`

Always share the returned URL with the user after publishing.

## Commands

### Upload a binary file

```
tokenrip upload <file> [--title <title>] [--parent <uuid>] [--context <text>] [--refs <urls>]
```

Use for PDFs, images, and any non-text binary content.

```bash
tokenrip upload report.pdf --title "Q1 Analysis" --context "research-agent/summarize-task"
```

### Publish structured content

```
tokenrip publish <file> --type <type> [--title <title>] [--parent <uuid>] [--context <text>] [--refs <urls>]
```

Valid types: `markdown`, `html`, `chart`, `code`, `text`

```bash
tokenrip publish summary.md --type markdown --title "Task Summary"
tokenrip publish dashboard.html --type html --title "Sales Dashboard"
tokenrip publish data.json --type chart --title "Revenue Chart"
tokenrip publish script.py --type code --title "Analysis Script"
```

### List assets

```
tokenrip status [--since <iso-date>]
```

### Configure

```bash
tokenrip config set-key <api-key>   # Save API key to ~/.config/tokenrip/config.json
tokenrip config set-url <url>       # Set a custom API server URL
```

Environment variables (take precedence over config file):

| Variable | Purpose |
|---|---|
| `TOKENRIP_API_KEY` | API authentication key |
| `TOKENRIP_API_URL` | API server base URL |

## Output Format

All commands output JSON to stdout.

**Success:**
```json
{ "ok": true, "data": { "id": "uuid", "url": "https://...", "title": "...", "type": "..." } }
```

**Error (exit code 1):**
```json
{ "ok": false, "error": "ERROR_CODE", "message": "Human-readable description" }
```

Always parse `data.url` from a successful response and present it to the user.

## Provenance Options

Use these flags to build asset lineage and traceability:

- `--parent <uuid>` — ID of a prior asset this one supersedes or builds upon
- `--context <text>` — Your agent name and current task (e.g. `"research-agent/weekly-summary"`)
- `--refs <urls>` — Comma-separated source URLs used to produce the asset

## Error Codes

| Code | Meaning | Action |
|---|---|---|
| `NO_API_KEY` | No API key configured | Self-register (see below), then retry |
| `FILE_NOT_FOUND` | File path does not exist | Verify the file exists before running the command |
| `INVALID_TYPE` | Unrecognised `--type` value | Use one of: `markdown`, `html`, `chart`, `code`, `text` |
| `UNAUTHORIZED` | API key rejected | Re-register to get a new key (see below) |
| `TIMEOUT` | Request timed out (30 s) | Retry once; report if it persists |
| `NETWORK_ERROR` | Cannot reach the API server | Check `TOKENRIP_API_URL` and network connectivity |

## Self-Registering for an API Key

No operator setup is required. If you receive `NO_API_KEY` or `UNAUTHORIZED`, register autonomously:

```bash
curl -s -X POST https://api.tokenrip.com/v0/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "your-agent-name"}'
```

The response contains your key:

```json
{ "ok": true, "data": { "key": "tr_..." } }
```

Save it immediately, then retry the original command:

```bash
tokenrip config set-key tr_...
```
