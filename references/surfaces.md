# Surfaces

Build, publish, validate, and promote a Tokenrip **Surface** — a single-file HTML UI hosted at `https://tokenrip.com/x/<publicId>` that reads and writes Tokenrip data through the `window.tokenrip.*` SDK. Use the `rip surface` command group (or the matching MCP tools). Return to [SKILL.md](../SKILL.md) for the top-level decision trees.

Use a Surface for "build me a dashboard / editor / review queue / workflow trigger on top of my Tokenrip data." Do **not** use it for non-Tokenrip UIs, backend code, or editing an artifact's content directly (use `rip artifact update` for that).

> **Canonical spec.** The full SDK contract — error codes, CDN allowlist, ES5 rules, three worked examples — lives at `https://tokenrip.com/for-ai/surfaces.md`. **Read it before generating non-trivial code.** This reference is the flow; that doc is the spec.

## The flow: inspect → generate → publish → fix → present → promote

### 1. Inspect (get the binding — don't hand-craft it)

```bash
rip mount inspect <mountId>        # table schemas, ≤5 sample rows each, recommendedBindingKey + recommendedBinding
rip artifact inspect <alias-or-id> # type, editability, content preview, recommendedBinding
```

Use the returned `recommendedBindingKey` + `recommendedBinding` **verbatim** in publish. The validator rejects hand-rolled binding maps built from raw `/v0` URLs.

### 2. Generate a single HTML file

| Constraint | Why |
|---|---|
| Single file, served verbatim at `/x/<publicId>` | No build step, no assets |
| Read/write via `window.tokenrip.*` only — never `fetch('/v0/...')` | Validator flags raw calls; the SDK is auth-aware |
| ES5 outside JSX (`var`, function expressions; no arrow-destructuring / optional chaining in `<script>`) | Runtime is Babel-standalone; modern syntax breaks silently |
| CDN allowlist: `unpkg.com`, `cdn.jsdelivr.net`, `esm.sh`, `cdn.tailwindcss.com` | Anything else is CSP-blocked at render |
| Wrap every SDK call in `try/catch`; handle `VALIDATION_BLOCKED` gracefully | Validation runs with a write-blocking token — uncaught throws fail it |
| No `localStorage`/`IndexedDB` as primary storage; no `tokenrip.connectors.*` | Cleared between sessions / namespace doesn't exist in v1 |

**Use the sync helpers, not hand-rolled plumbing.** The SDK ships `tokenrip.useTable(key, opts)` / `tokenrip.useArtifact(key, opts)` / `tokenrip.useStore(store)` (React) and headless `tokenrip.store.table/artifact` (vanilla) that own load, poll, optimistic patch + rollback, debounced writes, draft/dirty tracking, `validationBlocked`, and `staleVersion`. Build data-backed surfaces on these; drop to raw `tokenrip.tables`/`artifacts` only for cases the store doesn't model. The `/for-ai/surfaces.md` "State & sync helpers" section is the spec.

Copy the matching skeleton from `/for-ai/surfaces.md`: §6A row editor (`useTable`), §6B artifact document editor (`useArtifact`), §6C control-row workflow trigger.

### 3. Publish

```bash
rip surface publish <file.html> --title "..." --bindings <bindings.json> [--mount <mountId>]
```

Response includes `publicId`, `currentRevisionId`, `draftUrl`, and a `validation` report. If `validation.ok === false` or `errorCount > 0` → fix; else → present.

### 4. Fix validation

The `validation` object carries the diagnostic arrays directly: `errors`, `warnings`, `accessibility`, `overflow`, `blockedNetworkAttempts` (each finding has `kind` + `message`; console errors include `metadata.location`). Read `validation.errors` — no separate fetch — and map each `kind`:

| Symptom (`error.kind` / finding) | Fix |
|---|---|
| `console_error` / `page_error` (uncaught error, unhandled rejection) | Find the JS bug; add `try/catch` around the SDK call |
| `blocked_egress` in `blockedNetworkAttempts` | Non-allowlisted CDN — switch to an allowed CDN or drop the dependency |
| `api_error` / `BINDINGS_REQUIRED` / `BINDING_RESOURCE_NOT_FOUND` / `BINDING_DENIED` | Re-`inspect`; copy `recommendedBinding` verbatim |
| `timeout` | Remove animations, polling, long-running mount effects |
| accessibility / overflow findings | Add `aria-label`s / `<label htmlFor>`; make the layout responsive (`max-w-*`, `flex-wrap`) |
| `validation_blocked` (a blocked **write**, not in `errors`) | **Expected** — the validator exercises write paths without committing. Don't "fix" it. |

```bash
rip surface update <publicId> <file.html>   # new revision + auto-validate (file path is positional)
```

Repeat until clean (hard cap ~5 iterations; if stuck, show the operator the error and ask).

### 5. Present, then 6. Promote (only on confirmation)

```bash
rip surface promote <publicId>   # flip draft → published; unlocks the operator-shareable URL
```

Never promote without explicit operator confirmation ("looks good" / "ship it"). Always show the full `publicId` and URL — don't truncate.

**Shipping a surface with an imprint.** If you built the surface on a mount of an imprint you own and want every future mounter to inherit it, after it validates `ok` run `rip surface promote-to-imprint <publicId> [--alias <a>] [--default]`. This derives alias bindings (every bound table/artifact must be declared in the manifest), snapshots the HTML into a starter artifact, and writes a `manifest.surfaces[]` entry — a draft edit, so `rip agent publish` afterward to ship it. To repoint which surface a mount features by default, `rip surface set-default <publicId>`.

## CLI ↔ MCP quick reference

| MCP tool | CLI | Purpose |
|---|---|---|
| `inspect_mount` / `inspect_artifact` | `rip mount inspect` / `rip artifact inspect` | Discover tables + recommended bindings |
| `publish_surface` | `rip surface publish` | Create + auto-validate |
| `update_surface` | `rip surface update` | New revision + auto-validate |
| `validate_surface` | `rip surface validate` | Re-run validation |
| `promote_surface` | `rip surface promote` | Flip draft → published |
| `set_default_surface` | `rip surface set-default` | Make a mount surface the mount default |
| `promote_surface_to_imprint` | `rip surface promote-to-imprint` | Ship a mount surface as an imprint template |
| `list_surfaces` / `get_surface` | `rip surface list` / `rip surface get` | List / detail |
| `restore_surface_revision` | `rip surface restore <id> <revId>` | Roll back |
| `delete_surface` | `rip surface delete` | Permanent delete (confirm first) |

## Anti-patterns

- Raw `fetch('/v0/...')` from generated code — use the SDK.
- Hand-writing binding maps — use `recommendedBinding` from `inspect_*`.
- Promoting without operator confirmation.
- CDNs outside the allowlist; `tokenrip.connectors.*`; modern JS sugar in `<script>` blocks.
- "Fixing" `validation_blocked` operations — they're a feature, not a bug.

## See also

- `https://tokenrip.com/for-ai/surfaces.md` — full SDK contract + worked examples.
- `rip surface --help` — every flag.
