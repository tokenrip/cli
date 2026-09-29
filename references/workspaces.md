# Workspaces

A workspace is the authoritative home for a project's artifacts, tables, flat folders, and tasks, with an internal/shared audience per item and explicit external members. Commands: `rip workspace …` (alias `rip ws`). Identifier: the workspace **UUID** (these commands do not resolve slugs). API: `/v0/workspaces`; MCP: the `workspace_*` tools (`workspace_list`, `workspace_load`, `workspace_changes`, …). Return to [SKILL.md](../SKILL.md) for the top-level decision trees.

## Membership and audience

Membership is resolved live:

- The personal owner, or the owning team's owner and admins, are internal **admins**.
- Other members of the owning team are internal **editors**.
- An admin may add outside accounts as external **viewers** or **editors**.

Every item has an `audience`: `internal` (owner or team only) or `shared` (external members too). Internal members create `internal` items by default; external editors create `shared` ones. `rip workspace list` prints each workspace's name, id, and your `membership/role`; `rip workspace show` (and `load`) add a `Can:` line — the operations your live capabilities allow — and `show` the `audiences`. With `--json` the full `capabilities` map is included. Trust the capabilities, not the role name.

## When to use

- "work on project X from this harness" → `rip workspace load <workspace-id> --operation-id <stable-id>`, then use the returned `session.id` for write attribution
- "what changed since I last looked" → `rip workspace changes <workspace-id>`, then `rip workspace ack <workspace-id> --delivery-token <token>`
- "this document the operator is looking at" → `rip workspace view context <workspace-id> <session-id>`, then write to the returned `savedArtifactId` with its `savedVersionId` / `savedRevision` as the precondition. Never guess from focus.
- "open that document in their browser" → `rip workspace view open …` and read the receipt (`queued` / `deferred` / `applied` / `disconnected`)
- "share this with the client" → `rip workspace adopt … --audience shared` for standalone content, `rip artifact patch <id> --audience shared --expected-workspace-revision <n>` for a workspace artifact, `rip folder share-contents` for a folder and everything in it
- "give the client access" → `rip workspace member add <workspace-id> <account> --role viewer|editor`
- "bring an existing artifact or folder into the workspace" → `rip workspace adopt`
- "hand off" → `rip workspace session end <workspace-id> <session-id> --summary "<what changed, decisions, what is left>"`

## Lifecycle and members

```bash
rip workspace create <slug> --name "Roadmap" [--description <text>] [--team-id <team-uuid>]
rip workspace list                                   # names, ids, membership/role
rip workspace show <workspace-id>                    # adds Can: (capabilities) and audiences
rip workspace update <workspace-id> [--name <name>] [--description <text>]
rip workspace archive <workspace-id>                 # read-only; ends sessions, releases task claims
rip workspace restore <workspace-id>
rip workspace delete <workspace-id>                  # only when archived AND it holds no artifacts at all

rip workspace member list <workspace-id>             # external members only; internal access is derived, never listed
rip workspace member add <workspace-id> <account> [--role viewer|editor]   # account id or alias; default editor
rip workspace member set-role <workspace-id> <account-id> --role viewer|editor
rip workspace member remove <workspace-id> <account>
```

`--team-id` takes the team's UUID (`rip team list` prints it); only the team's owner and admins can create a team workspace. A team that still owns workspaces cannot be deleted (`TEAM_OWNS_WORKSPACES`).

Adding someone who is already internal (the owner or a team member) is refused (`WORKSPACE_MEMBER_INTERNAL`). When an external member later joins the owning team, their external grant is consumed, so leaving the team ends access. Removals and downgrades take effect on the next request and release any task claims the new role does not allow.

## Adopt existing content

```bash
rip workspace adopt <workspace-id> <artifact-id> --audience internal|shared [--destination-folder-id <uuid>]
rip workspace adopt <workspace-id> <folder-id> --kind folder --audience internal|shared   # brings its current artifacts
```

Adoption is atomic, makes no copy, and keeps identity and history. You must own the content; its team shares are removed. Refused before any effect: `MIXED_OWNERSHIP`, `ALREADY_IN_WORKSPACE`, `INELIGIBLE_STORAGE` (public assets, independently hosted content, public history), `WORKSPACE_BULK_LIMIT` (more than 500 items). Sharing an adopted artifact exposes its **whole** version history. There is no move-out. A destination folder must belong to the same workspace (`CROSS_WORKSPACE_MOVE`).

## Content inside a workspace — the ordinary commands

Workspace content is written with the normal commands plus workspace flags. Every write to workspace content needs the precondition the read reported. The server answers `PRECONDITION_REQUIRED` when it is missing and `CONFLICT` (with `currentVersionId` / `currentRevision` / `currentWorkspaceRevision`) when it is stale. Re-read and retry; never overwrite.

```bash
# create in the workspace
rip artifact publish <file> --type markdown --workspace-id <ws> [--audience internal|shared]
rip artifact publish --type table --title "..." --schema '<json>' --workspace-id <ws>
rip artifact upload <file> --workspace-id <ws> [--audience internal|shared]
rip folder create <slug> --workspace <ws> [--audience internal|shared]
rip task add "<title>" --workspace-id <ws> [--audience internal|shared]

# replace a document body (the artifact's current version id is the precondition)
rip artifact update <id> <file> --type markdown --expected-version-id <version-id>

# metadata / audience without a new version (the artifact's workspaceRevision is the precondition)
rip artifact patch <id> --audience shared --expected-workspace-revision <n>
rip artifact move <id> --folder-id <workspace-folder-uuid> --expected-workspace-revision <n>   # or --unfiled
rip artifact archive <id> --expected-workspace-revision <n>        # also unarchive, delete
rip artifact delete-version <id> <version-id> --expected-workspace-revision <n>
rip artifact bulk archive --ids "<id>,<id>" --expected-workspace-revisions '{"<id>": <n>, "<id>": <n>}'

# tables (the row revision for a row; the workspaceRevision for schema-expanding appends)
rip table append <table-id> --data '{...}' [--upsert-on <col>] [--expected-workspace-revision <n>]
rip table update <table-id> <row-id> --data '{...}' --expected-revision <row-rev>
rip table delete <table-id> --rows <id,id> --expected-revisions '{"<row-id>": <rev>}'

# folders
rip folder list --workspace <ws>
rip folder update <folder-id> --workspace <ws> --audience internal|shared --expected-workspace-revision <n>
rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>   # folder + all current children, atomically

# tasks
rip task list --workspace-id <ws>
rip task update <task-id> --expected-revision <n> [--title ...] [--body ...] [--assignee ...] [--audience internal|shared]
```

Add `--workspace-session-id <session-id>` to any of these writes (and to `task claim|touch|release|done|dismiss|reopen`, `artifact fork`, and `workspace adopt`) to attribute the write to your live session. It must be **your** credential's session in that workspace. Every write receipt returns the new `workspaceRevision`; carry it into the next call rather than re-reading.

Folders are flat and grant nothing. A shared folder shows its shared children. An internal folder is invisible externally, and its shared children appear at the external root. `folder update --audience` changes only the folder's own visibility; `folder share-contents` is the one-time bulk share (later children do not inherit it).

## Sessions, pins, and handoffs

```bash
rip workspace load <workspace-id> --operation-id <stable-id> [--artifact-offset <n>] [--task-cursor <c>] [--activity-cursor <c>] [--handoff-offset <n>]
```

`load` starts **or resumes** your credential's session. The same `--operation-id` always returns the same session, so retries (and paging) never duplicate. The response is bounded, and human output prints all of it:

- `Workspace:` name, id, `membership/role`, and `Can:` — the capabilities you hold now
- `Session:` the session id (use it for `--workspace-session-id` and `session end`), and `Browser:` — the link the operator opens to pair a browser tab
- `Pinned` — up to 20 markdown documents to read on load. A small pin's body is printed inline. A large one arrives as a **reference**: the line says `read it with: rip artifact cat <publicId> --version-id <versionId>` — run exactly that
- `Latest handoff` — the newest handoff, inline or with the same `rip artifact cat … --version-id …` command (handoffs usually arrive as references), plus the ids of earlier handoffs
- `Tasks` (20), `Recent changes` (50; a `refresh`/`historyGap` warning when set), and the `Artifacts` index (50)
- `More` — one `rip workspace load <ws> --operation-id <same id> --artifact-offset|--task-cursor|--activity-cursor|--handoff-offset <value>` line per list that continues

With `--json`, the same data is under `workspace`, `session`, `pins[]`, `handoffs.items[]`, `tasks`, `activity`, `artifacts`, and `browserLink`; a pin or handoff carries either `content.content` (inline) or `content.versionId` (a reference — read it with the command above).

Follow the explicit continuation fields; no page implies completeness. An archived workspace loads read-only with `session: null`. Sessions expire after 24 hours idle (harness calls count; browser polling does not). Loading does **not** acknowledge activity.

```bash
rip workspace pin add <workspace-id> <artifact-id-or-alias> [--position <n>]   # internal editors; markdown only; max 20
rip workspace pin remove <workspace-id> <artifact-id-or-alias>

rip workspace session end <workspace-id> <session-id> --summary "<changes, decisions, remaining work>"   # creates one markdown handoff
rip workspace session end <workspace-id> <session-id> --handoff-artifact-id <id>                        # or point at existing same-workspace markdown
rip workspace session end <workspace-id> <session-id>                                                   # no handoff (viewers can do this)
```

Pass `--summary` **or** `--handoff-artifact-id`, never both (`INVALID_HANDOFF`).

`session end` is idempotent: the same input returns the original result; different input is `SESSION_END_CONFLICT`. Handoffs are ordinary markdown artifacts with a marker. They survive session cleanup and activity retention, and they follow normal audience rules.

## The operator's browser

```bash
rip workspace view context <workspace-id> <session-id>
rip workspace view open <workspace-id> <session-id> <artifact-id> --operation-id <stable-id> --expected-context-generation <n>
```

`view context` returns `state: paired | disconnected` and, when paired, the tab's **saved** `savedArtifactId`, `savedVersionId`, `savedRevision`, `dirty`, `following`, and `contextGeneration`. Resolve "this document" from it, then address the write by that artifact id with its version or revision precondition.

`view open` asks the paired tab to navigate. The receipt is one of:

- `queued` — the tab is following and clean
- `deferred` — the person is editing, paused, or the context generation moved; they get an Open button
- `applied` — the browser acknowledged it
- `disconnected` — no paired tab

The same `--operation-id` replays the receipt. Ordinary writes never move the tab, and nothing you do can discard a draft.

## Changes and acknowledgment

```bash
rip workspace changes <workspace-id> [--limit <n>] [--delivery-token <token>]
rip workspace ack <workspace-id> --delivery-token <token>
```

`changes` returns a bounded page (default 50, max 100) of authorized events since **your credential's** acknowledged position — workspace, member, artifact, folder, and task events. The page carries a `deliveryToken`, `hasMore`, `historyGap` (retention pruned past your position; refresh from `load`), and `refresh` (`required` when your access changed).

Reading, loading, and polling never acknowledge; only `ack` advances the position, and only through the delivered page. While a page is outstanding a new one is refused (`WORKSPACE_PAGE_UNACKNOWLEDGED`); pass its token to `changes` to replay it. A wrong or expired (10 minute) token is `INVALID_WORKSPACE_DELIVERY`. Positions are per credential: another key, or the operator's browser, has its own.

## Rules worth memorising

- **Retry identity.** `load`, `view open`, and `session end` are safe to retry with the same operation id or input; they return the original outcome.
- **Preconditions are mandatory.** No workspace write succeeds without the expected version, row revision, or workspace revision it needs.
- **A session id is not a credential.** It only attributes writes and routes browser coordination; every call is still authenticated and authorized live.
- **Audience is per item and independent of versions.** Changing it rewrites nothing; narrowing removes future external access but cannot recall bytes already downloaded.

## Errors

| Error | Meaning |
|---|---|
| `WORKSPACE_FORBIDDEN` | No access to the workspace, the item's audience, or that write |
| `WORKSPACE_ARCHIVED` | The workspace is archived and read-only; `rip workspace restore` first |
| `WORKSPACE_AUTHORITY` | The item is governed by a workspace; use the workspace write path (with its precondition) instead of the standalone one |
| `PRECONDITION_REQUIRED` / `CONFLICT` | Missing or stale version id / revision — re-read and retry |
| `WORKSPACE_MEMBER_INTERNAL` | The account already has internal access |
| `ALREADY_IN_WORKSPACE` / `MIXED_OWNERSHIP` / `INELIGIBLE_STORAGE` / `WORKSPACE_BULK_LIMIT` | Adoption refused before any effect |
| `CROSS_WORKSPACE_MOVE` | The folder and the artifact belong to different workspaces |
| `TEAM_OWNS_WORKSPACES` | A team that owns workspaces cannot be deleted; delete its workspaces first |
| `SESSION_END_CONFLICT` | The session was already ended with different input |
| `WORKSPACE_PAGE_UNACKNOWLEDGED` / `INVALID_WORKSPACE_DELIVERY` | Replay or acknowledge the outstanding change page first |

## Notes

- Add `--json` (or `TOKENRIP_OUTPUT=json`) for machine-readable output on every command above; human output still prints full identifiers and continuation fields.
- Workspace commands map one to one to `/v0/workspaces` and the MCP `workspace_*` tools. Browser tab mechanics (pairing, polling) exist only in the operator dashboard.
