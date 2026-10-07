# Output Format and Provenance

Covers JSON output mode, output format priority, and provenance flags for artifact lineage. Return to [SKILL.md](../SKILL.md) for decision trees and workflows.

## Output format

Output is human-readable by default. Use `--json` for machine-readable output. `--json` is a global flag, so it works before or after the command: `rip --json workspace list` or `rip workspace list --json`.

Priority (highest wins): `--json` flag → `TOKENRIP_OUTPUT` env var → config `preferences.outputFormat` (`rip config set-output json`) → `human` default.

```json
// Success (stdout, exit code 0)
{ "ok": true, "data": { "id": "uuid", "url": "https://...", "title": "...", "type": "...", "currentVersionId": "uuid" } }

// JSON error (stdout, exit code 1; human errors and interactive hints use stderr)
{ "ok": false, "error": "CONFLICT", "message": "Artifact changed.", "details": { "currentWorkspaceRevision": 3 } }
```

- Success and JSON error envelopes go to stdout; human errors and interactive hints go to stderr. Check the exit status when piping JSON.
- JSON mode passes the server's data through unchanged. Human mode prints every identifier and URL in full; nothing is truncated.
- Always parse `data.url` from a successful artifact response and present it to the user.
- Workspace write receipts carry the new `workspaceRevision`. Carry it into the next write instead of re-reading.
- In human mode, `rip connection call` prints the bare upstream `{ status, headers, body, bodyIsJson, latencyMs }` as JSON so a script can parse stdout directly. With `--json` it is wrapped like every other command.

## Correct a refusal before continuing

Artifact publish/upload create receipts retain `workspaceId`, `audience`, and `workspaceRevision` when the server returns a workspace home. Human output shows audience; retained standalone visibility compatibility fields grant no workspace access. New artifacts need no expected revision.

JSON failures preserve `ok`, `error`, and `message`, with optional safe `details`. Domain details include the applicable current version/revision, a known required field, incompatible sharing fields, or an authorized inactive session status. Legacy REST validation `details` arrays remain available and their explanations appear in both modes. Human output prints required fields and current revisions in full.

- `PRECONDITION_REQUIRED`: read the resource and supply the required `expectedVersionId`, `expectedRevision`, the row-deletion `expectedRevisions` map, or `expectedWorkspaceRevision`.
- Bulk workspace artifact writes accept `--expected-workspace-revisions` as a JSON map keyed by each submitted artifact identifier (`expectedWorkspaceRevisions` over REST/MCP). Read current workspace revisions and include every selected artifact. Bulk results report per-item failure codes. Row deletion uses the separate `expectedRevisions` map keyed by row UUID.
- `CONFLICT`: read the current authorized resource and reconcile before writing again. A 409 with another code is a state/domain refusal; do not invent version advice.
- `INELIGIBLE_STORAGE`: omit independently public storage creation flags, or select eligible standalone content for adoption. Preserve the intended workspace and session attribution.
- `WORKSPACE_AUTHORITY`: omit incompatible standalone sharing fields and use workspace audience. `INVALID_SCOPE` with `field: workspaceId` requires workspace identity or removal of workspace-only inputs.
- `WORKSPACE_SESSION_INVALID`, `WORKSPACE_SESSION_EXPIRED`, or `WORKSPACE_SESSION_INACTIVE`: select participation belonging to the current credential, or explicitly start new participation. A revoked credential requires reconnecting. Foreign/nonexistent sessions expose no metadata.
- `WORKSPACE_PAGE_UNACKNOWLEDGED`: replay or acknowledge the delivered page. `INVALID_WORKSPACE_DELIVERY` or `INVALID_CURSOR`: restart the affected flow. These are separate from content revisions.
- `WORKSPACE_ARCHIVED`: the workspace is read-only; re-reading a version cannot make a write succeed.

A corrected request differs from an identical retry. MCP's `retry` describes safety, not success, and the CLI does not automatically retry writes. After a timeout, inspect the operation outcome before repeating a write: the server may have committed it. Keep the existing keyed operation identity when checking or replaying a potentially committed operation.

## Local transport observations

For client-generated `TIMEOUT` and `NETWORK_ERROR`, human stderr and JSON stdout expose the same available flat `details`: `elapsedMs`, `timeoutMs`, optional allowlisted `transportCode`, `responseReceived`, and `httpStatus` only for an observed response. The elapsed value is measured locally with a monotonic clock; the configured timeout is a connection/response policy, not proof of elapsed time or a whole-command deadline. Server error bodies cannot supply these local observations. Failures before dispatch preparation may have no timing observations.

`responseReceived: false` says no HTTP reply was observed; a request may still have reached the server and committed. `NETWORK_ERROR` can also follow a received response or caller cancellation (`ERR_CANCELED`). Inspect uncertain mutation outcomes before repeating them. See [transport troubleshooting](setup-and-identity.md#transport-troubleshooting), including the single-use sign-in code and lost-response limit.

## Provenance flags

Build lineage and traceability with these flags on `artifact publish` and `artifact upload` (`--context` also works on `artifact update`):

- `--parent <uuid>` — ID of a prior artifact this one supersedes or builds on
- `--context <text>` — your agent name and current task (for example `"research-agent/weekly-summary"`)
- `--refs <urls>` — comma-separated source URLs used to produce the artifact

Every request also records the **harness** it came from (`claude-code`, `cli`, or the value of `TOKENRIP_SURFACE`), which shows up on task claims and activity rows. See `references/tasks.md` § Attribution.
