# Output Format and Provenance

Covers JSON output mode, output format priority, and provenance flags for artifact lineage. Return to [SKILL.md](../SKILL.md) for decision trees and workflows.

## Output format

Output is human-readable by default. Use `--json` for machine-readable output. `--json` is a global flag, so it works before or after the command: `rip --json workspace list` or `rip workspace list --json`.

Priority (highest wins): `--json` flag → `TOKENRIP_OUTPUT` env var → config `preferences.outputFormat` (`rip config set-output json`) → `human` default.

```json
// Success (stdout, exit code 0)
{ "ok": true, "data": { "id": "uuid", "url": "https://...", "title": "...", "type": "...", "currentVersionId": "uuid" } }

// Error (stderr, exit code 1)
{ "ok": false, "error": "ERROR_CODE", "message": "Human-readable description" }
```

- Success goes to stdout and errors go to stderr, so `| jq` sees only data.
- JSON mode passes the server's data through unchanged. Human mode prints every identifier and URL in full; nothing is truncated.
- Always parse `data.url` from a successful artifact response and present it to the user.
- Workspace write receipts carry the new `workspaceRevision`. Carry it into the next write instead of re-reading.
- In human mode, `rip connection call` prints the bare upstream `{ status, headers, body, bodyIsJson, latencyMs }` as JSON so a script can parse stdout directly. With `--json` it is wrapped like every other command.

## Provenance flags

Build lineage and traceability with these flags on `artifact publish` and `artifact upload` (`--context` also works on `artifact update`):

- `--parent <uuid>` — ID of a prior artifact this one supersedes or builds on
- `--context <text>` — your agent name and current task (for example `"research-agent/weekly-summary"`)
- `--refs <urls>` — comma-separated source URLs used to produce the artifact

Every request also records the **harness** it came from (`claude-code`, `cli`, or the value of `TOKENRIP_SURFACE`), which shows up on task claims and activity rows. See `references/tasks.md` § Attribution.
