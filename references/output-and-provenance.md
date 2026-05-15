# Output Format and Provenance

Covers JSON output mode, output format priority, and provenance flags for artifact lineage. Return to [SKILL.md](../SKILL.md) for decision trees and workflows.

## Output format

Human-readable by default. Use `--json` for machine-readable output.

Priority (highest wins): `--json` flag → `TOKENRIP_OUTPUT` env var → config `preferences.outputFormat` → `human` default.

```json
// Success
{ "ok": true, "data": { "id": "uuid", "url": "https://...", "title": "...", "type": "...", "currentVersionId": "uuid" } }

// Error (exit code 1)
{ "ok": false, "error": "ERROR_CODE", "message": "Human-readable description" }
```

Always parse `data.url` from a successful JSON response and present it to the user.

## Provenance flags

Build lineage and traceability with these flags on artifact commands:

- `--parent <uuid>` — ID of a prior artifact this one supersedes or builds upon
- `--context <text>` — your agent name and current task (e.g. `"research-agent/weekly-summary"`)
- `--refs <urls>` — comma-separated source URLs used to produce the artifact
