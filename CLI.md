# Tokenrip CLI Reference

Every command in `@tokenrip/cli` 2.2, grouped by area. `rip --help` and `rip <command> --help` print the same flags with examples and are always current.

## Contents

- [Global options](#global-options)
- [Workspace commands](#workspace-commands)
- [Artifact commands](#artifact-commands)
- [Table commands](#table-commands)
- [Folder commands](#folder-commands)
- [Task commands](#task-commands)
- [Activity](#activity)
- [Search](#search)
- [Connection commands](#connection-commands)
- [Skill commands](#skill-commands)
- [Bundle commands](#bundle-commands)
- [Team commands](#team-commands)
- [Auth commands](#auth-commands)
- [Account commands](#account-commands)
- [Operator commands](#operator-commands)
- [Config commands](#config-commands)
- [Updates](#updates)
- [Provenance tracking](#provenance-tracking)
- [CLI + MCP interop](#cli--mcp-interop)
- [Library usage](#library-usage)
- [Configuration](#configuration)
- [Output format](#output-format)
- [Error codes](#error-codes)

## Global options

| Option | Meaning |
|---|---|
| `--json` | JSON output instead of human-readable. Works before or after the command. |
| `--agent <name>` | Use a specific local identity (alias or `rip1…` ID) for this command |
| `-V, --version` | Print the CLI version |
| `-h, --help` | Help for any command |

## Workspace commands

`rip workspace` (alias **`rip ws`**) manages **workspaces**: the authoritative home for a project's artifacts, tables, flat folders, and tasks, with an `internal` / `shared` audience per item and explicit external members. Workspaces are addressed by **UUID** (slugs are not resolved). Workflow guide: [`references/workspaces.md`](./references/workspaces.md).

### `rip workspace create <slug>`

Create a workspace. The slug is unique within your account or team.

```bash
rip workspace create research --name "Research"
rip workspace create roadmap --name "Roadmap" --team-id 550e8400-e29b-41d4-a716-446655440000
```

Options: `--name <name>` (defaults to the slug), `--description <text>`, `--team-id <uuid>` (make it team-owned; team owners and admins only; `rip team list` prints the team's UUID).

### `rip workspace list`

List the workspaces you can access, with your `role`, `membership`, `audiences`, and `capabilities` for each.

### `rip workspace show <workspace>`

Show one workspace.

### `rip workspace update <workspace>`

Options: `--name <name>`, `--description <text>`.

### `rip workspace archive <workspace>` / `rip workspace restore <workspace>`

Archiving makes the workspace read-only, ends its sessions, and releases its task claims. `restore` reverses it.

### `rip workspace delete <workspace>`

Delete a workspace that is archived **and** holds no artifacts (`WORKSPACE_NOT_ARCHIVED` / `WORKSPACE_NOT_EMPTY` otherwise). Admins only.

### `rip workspace member …`

External members only; internal access is derived live from the owner or owning team and is never listed.

```bash
rip workspace member list <workspace>
rip workspace member add <workspace> <account> [--role viewer|editor]      # account id or alias; default editor
rip workspace member set-role <workspace> <account-id> --role viewer|editor
rip workspace member remove <workspace> <account>
```

Adding an account that already has internal access is refused (`WORKSPACE_MEMBER_INTERNAL`).

### `rip workspace adopt <workspace> <item>`

Move standalone content you own into the workspace: atomic, no copy, identity and history kept, old team shares removed. Sharing an adopted artifact exposes its full version history.

```bash
rip workspace adopt <workspace> <artifact-id> --audience internal|shared [--destination-folder-id <uuid>]
rip workspace adopt <workspace> <folder-id> --kind folder --audience internal|shared
```

Options: `--audience <internal|shared>`, `--kind <artifact|folder>` (default `artifact`), `--destination-folder-id <uuid>`, `--workspace-session-id <uuid>`.

### `rip workspace pin add|remove <workspace> <artifact-id>`

Ordered markdown documents returned by every `load` (internal editors; markdown only; max 20). Accepts a public id or alias.

```bash
rip workspace pin add <workspace> <artifact-id> [--position <n>]
rip workspace pin remove <workspace> <artifact-id>
```

### `rip workspace load <workspace>`

Deliberately start keyed participation with `--operation-id`, or resume exactly your credential's chosen live session with `--session-id`, and load bounded context: the workspace, pins, artifacts (50), tasks (20), activity (50), handoffs, `session { id, operationId, status, lastActivityAt }`, and a `browserLink`. Replaying the same `--operation-id` preserves its live session; a fresh identity starts independent participation. Both selectors refuse terminal sessions without replacement. Archived load returns read-only context and `session: null`, validates supplied session ownership, and never creates or touches participation. Human output prints all of it: the session id, `Can:` (capabilities), each pin and the latest handoff (inline bodies are printed), open tasks, recent changes, the artifact index, and one `rip workspace load … --session-id <returned id> --<continuation>` line per list that continues. A large pin or handoff arrives as a reference; the human output prints the exact command to read it, `rip artifact cat <publicId> --version-id <versionId>` (in `--json`, a pin or handoff has `content.content` when inline, otherwise `content.versionId`).

```bash
rip workspace load <workspace> --operation-id <stable-id>
rip workspace load <workspace> --session-id <returned-session-id> --task-cursor <cursor>
```

Required: exactly one of `--operation-id <id>` or `--session-id <uuid>`. Refresh and paging preserve browser link and pairing. If local identity is lost, `rip workspace show <workspace> [--session-cursor <cursor>]` exposes up to 20 active unexpired candidates owned by this account and credential, with `id`, `operationId`, `createdAt`, `lastActivityAt`, and `idleExpiresAt`; the complete reply budget may return fewer. Choose deliberately; discovery never extends idle time. Cursors are bound to workspace/account/credential. Names can repeat: use full UUID, slug, home, and capabilities to select, and clarify ambiguity. Continuation: `--artifact-offset <n>`, `--task-cursor <cursor>`, `--activity-cursor <cursor>`, `--handoff-offset <n>`.

### `rip workspace session end <workspace> <session-id>`

End your session, optionally leaving a markdown handoff. Idempotent for the same input; different input is `SESSION_END_CONFLICT`.

```bash
rip workspace session end <workspace> <session-id> --summary "<changes, decisions, remaining work>"
rip workspace session end <workspace> <session-id> --handoff-artifact-id <id>
```

Options: `--summary <text>` or `--handoff-artifact-id <id>` — one or neither; both is `INVALID_HANDOFF`.

### `rip workspace view context|open`

Read the operator's paired browser tab, or ask it to navigate.

```bash
rip workspace view context <workspace> <session-id>
rip workspace view open <workspace> <session-id> <artifact-id> --operation-id <id> --expected-context-generation <n>
```

`context` returns `paired | disconnected` and the tab's saved artifact, version, revision, `dirty`, `following`, and `contextGeneration`. `open` returns a receipt: `queued`, `deferred`, `applied`, or `disconnected`. Both `--operation-id` and `--expected-context-generation` are required for `open`.

### `rip workspace changes <workspace>` / `rip workspace ack <workspace>`

Ordered changes since your credential's acknowledged position. Reading never acknowledges.

```bash
rip workspace changes <workspace> [--limit <n>] [--delivery-token <token>]
rip workspace ack <workspace> --delivery-token <token>
```

`changes` returns up to 100 events (default 50) with a `deliveryToken`, `hasMore`, `historyGap`, and `refresh`. Pass the outstanding token to `changes` to replay a page; `ack` advances your position through it. Task history lives here.

### Workspace flags on other commands

Workspace content is written with the ordinary commands. Existing-item writes need the applicable precondition the read reported (`PRECONDITION_REQUIRED` when missing, `CONFLICT` with the current value when stale):

```bash
rip artifact publish|upload … --workspace-id <ws> [--audience internal|shared]
rip artifact update <id> <file> --expected-version-id <version-id> [--audience …] [--expected-workspace-revision <n>]
rip artifact patch|move|archive|unarchive|delete|delete-version … --expected-workspace-revision <n>
rip artifact bulk … --expected-workspace-revisions '{"<id>": <n>}'
rip artifact move <id> --folder-id <workspace-folder-uuid> --expected-workspace-revision <n>
rip folder create <slug> --workspace <ws> [--audience …]   ·   rip folder list --workspace <ws>
rip folder update <folder-id> --workspace <ws> --audience internal|shared --expected-workspace-revision <n>
rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>
rip table append <table-id> --data … [--expected-workspace-revision <n>]
rip table update <table-id> <row-id> --data … --expected-revision <row-rev>
rip table delete <table-id> --rows <id,id> --expected-revisions '{"<row-id>": <rev>}'
rip task add "<title>" --workspace-id <ws> [--audience …]   ·   rip task list --workspace-id <ws>
rip task update <task-id> --expected-revision <n> [--title --body --assignee --audience]
```

New artifact, folder, and task creation needs no revision. Insert-only rows need none unless expanding schema; matched upserts retain their row guards. History sequence numbers never guard content. Workspace creation uses audience; omit standalone visibility/team-sharing fields (`WORKSPACE_AUTHORITY`). Audience and session attribution require explicit workspace identity (`INVALID_SCOPE`). Any write also accepts `--workspace-session-id <session-id>` to attribute it to your live credential-owned session. A correction retains content and attribution; acknowledgment consumes history and cannot repair a write conflict.

## Artifact commands

The `artifact` command group also has a short alias: `rip art ...`. Identifiers accept a UUID, an alias (bare, `~owner/alias`, or `_team/alias`), or a full `https://tokenrip.com/s/…` URL unless noted.

### `rip artifact publish [file] --type <type>`

Publish structured content for rich rendering. The `file` argument is optional — pass `--content <string>` instead to publish inline.

Types: `markdown`, `html`, `chart`, `code`, `text`, `json`, `csv`, `table`

```bash
rip artifact publish notes.md --type markdown --title "Notes"
rip artifact publish --type markdown --title "Quick Note" --content "# Hello"
rip artifact publish data.csv --type csv --title "Q1 leads"
rip artifact publish leads.csv --type table --from-csv --headers --title "Leads"
rip artifact publish --type table --title "Research" --strict \
  --schema '[{"name":"company","type":"text"},{"name":"signal","type":"text"}]'
rip artifact publish report.md --type markdown --title "Report" --workspace-id <ws> --audience shared
```

Required: `--type`. Options: `--title`, `--content`, `--alias` (per-owner unique), `--parent`, `--context`, `--refs`, `--schema <json>`, `--headers`, `--from-csv`, `--team <slugs>`, `--folder <slug>`, `--metadata <json>`, `--public-asset`, `--visibility <private|link|public>` (default `link`), `--strict`, `--workspace-id <id>`, `--audience <internal|shared>`, `--workspace-session-id <id>`, `--dry-run`.

- **CSV vs table.** A `csv` artifact is a versioned file rendered as a table — for exports and snapshots. A `table` is a living table with a row-level API — for incremental data. `--from-csv` imports a CSV straight into a table; pass `--headers` (first row as column names) or `--schema` (explicit names and types), not both.
- **Strict tables.** `--strict` makes row writes reject unknown columns and values that don't match their declared type. Without it an unknown key is silently *added* to the schema as a `text` column and no value is type checked.
- **Visibility.** `link` is readable by anyone holding the URL; pass `--visibility private` for anything that shouldn't be, such as a content table backing a website. Workspace content uses `--audience` instead.
- **Public assets.** `--public-asset` stores the bytes in a public-read bucket and prints a direct CDN `publicUrl`. Not valid with private visibility or on tables; immutable once set.

### `rip artifact upload <file>`

Upload a binary file (PDF, image, etc.). MIME type is auto-detected.

```bash
rip artifact upload slides.pdf --title "Team Slides"
rip artifact upload hero.png --public-asset          # → data.publicUrl (direct CDN)
```

Options: `--title`, `--parent`, `--context`, `--refs`, `--team <slugs>`, `--folder <slug>`, `--public-asset`, `--visibility <link|public|private>` (defaults to `public` with `--public-asset`), `--workspace-id`, `--audience`, `--workspace-session-id`, `--dry-run`.

### `rip artifact list`

List your artifacts.

```bash
rip artifact list --type markdown --limit 5
rip artifact list --team acme --folder reports
```

Options: `--since <iso>`, `--limit <n>` (default 20), `--type <type>`, `--archived`, `--include-archived`, `--folder <slug>`, `--unfiled`, `--team <slug>`.

### `rip artifact get <identifier>`

Metadata and permissions for an artifact: visibility, folder, teams, workspace and audience, and who can modify it.

```bash
rip artifact get 550e8400-...
rip artifact get '~alice/dashboard'
```

### `rip artifact cat <identifier>`

Print an artifact's content to stdout — for piping or loading into context.

```bash
rip artifact cat my-post
rip artifact cat my-post --version-id abc123 | head -20
```

Options: `--version-id <versionId>`.

### `rip artifact download <identifier>`

Download content to a file (default `<uuid>.<ext>` in the current directory).

```bash
rip artifact download 550e8400-... --output ./report.pdf
rip artifact download <table-id> --format json
```

Options: `--output <path>`, `--version-id <versionId>`, `--format <csv|json>` (tables; default `csv`).

### `rip artifact update <uuid> <file>`

Publish a new version of an existing artifact. The URL stays the same. `--title` / `--alias` also patch the artifact, so you can republish and retitle in one command.

```bash
rip artifact update 550e8400-... report-v2.md --type markdown --description "copy edits"
rip artifact update my-doc report-v2.md --type markdown --title "Report (v2)"
rip artifact update <id> report-v2.md --type markdown --expected-version-id <version-id>   # workspace content
```

Options: `--type` (omit for a binary upload), `--description`, `--context`, `--title`, `--alias`, `--expected-version-id <id>`, `--audience <internal|shared>`, `--expected-workspace-revision <n>`, `--workspace-session-id <id>`, `--dry-run`.

### `rip artifact patch <identifier>`

Change metadata without creating a new version.

```bash
rip artifact patch 550e8400-... --title "Better Title"
rip artifact patch my-post --description ""           # clear the description
rip artifact patch my-post --alias new-slug           # per-owner unique
rip artifact patch my-post --metadata '{"featured":true}'
rip artifact patch my-post --visibility private       # private | link | public
rip artifact patch <id> --audience shared --expected-workspace-revision <n>
```

Options: `--title`, `--description`, `--alias`, `--metadata <json>` (replaces existing metadata), `--visibility`, `--audience`, `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip artifact versions <uuid>`

List versions, or fetch metadata for one with `--version-id <versionId>`.

### `rip artifact diff <identifier>`

What changed in a version compared to the one before it. Word-level for text types (markdown, html, code, text, json), row-level for CSV. Defaults to the current version; the earliest version and non-diffable types (chart, file, table) report no diff.

```bash
rip artifact diff my-alias --version-id abc123
```

Options: `--version-id <versionId>`.

### `rip artifact delete-version <uuid> <versionId>`

Delete one version. The last remaining version cannot be deleted — delete the artifact instead. Options: `--dry-run`, `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip artifact archive <identifier>` / `rip artifact unarchive <identifier>`

Hide an artifact from listings and search (still reachable by ID), or restore it. Options: `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip artifact delete <identifier>`

Permanently delete an artifact and its URL. Cannot be undone. Options: `--dry-run`, `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip artifact fork <identifier>`

Create your own copy of an artifact. Content is not duplicated — the fork's first version reuses the same storage.

```bash
rip artifact fork my-skill --title "My Custom Skill"
rip artifact fork 550e8400 --version-id abc123 --folder tools
```

Options: `--version-id <versionId>`, `--title`, `--folder <slug>`, `--workspace-session-id <id>`.

### `rip artifact move <uuid>`

Move an artifact into a folder, or unfile it.

```bash
rip artifact move 550e8400-... --folder research-notes
rip artifact move 550e8400-... --folder shared-reports --team research-team
rip artifact move 550e8400-... --unfiled
rip artifact move <id> --folder-id <workspace-folder-uuid> --expected-workspace-revision <n>
```

Options: `--folder <slug>`, `--folder-id <uuid>` (workspace folders), `--team <slug>`, `--unfiled`, `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip artifact bulk <action>`

Move, archive, or delete up to 200 artifacts in one call. `<action>` is `move`, `archive`, or `delete`. Output reports the `succeeded` ids and any `failed` entries (`{ publicId, error }`).

```bash
rip artifact bulk move --ids "id1,id2,id3" --folder reports
rip artifact bulk move --ids "id1,id2" --folder research --team research-team
rip artifact bulk move --ids "id1,id2" --unfiled
rip artifact bulk archive --ids "id1,id2,id3"
rip artifact bulk delete --ids "id1,id2"
```

Required: `--ids <csv>`. Options: `--folder <slug>`, `--team <slug>`, `--unfiled`, `--folder-id <uuid>`, `--expected-workspace-revisions <json>`, `--workspace-session-id <id>`. `delete` permanently destroys every listed artifact.

### `rip artifact team add <identifier> <teams...>` / `rip artifact team remove <identifier> <team>`

Share or un-share an already-published standalone artifact with teams (accepts UUID or alias; resolves local team aliases). Together with `publish --team`, this is how an artifact's team sharing changes.

```bash
rip artifact team add my-report acme-team beta-squad
rip artifact team remove my-report acme-team
```

### `rip artifact stats`

Storage usage: artifact count and bytes by type.

## Table commands

Create a table with `rip artifact publish --type table` (with `--schema` or `--from-csv`), then manage rows here.

### `rip table append <uuid>`

Append rows (max 1000 per call).

```bash
rip table append 550e8400-... --data '{"company":"Acme","signal":"API launch"}'
rip table append 550e8400-... --file rows.json
rip table append 550e8400-... --data '{"slug":"post","title":"v2"}' --upsert-on slug
```

Options: `--data <json>` (object or array), `--file <path>`, `--upsert-on <column>` (update the row matching that `unique: true` column instead of inserting), `--expected-workspace-revision <n>`, `--workspace-session-id <id>`. Without `--upsert-on`, a duplicate value in a unique column is rejected (`409`).

### `rip table rows <uuid>`

List rows with pagination, sorting, filtering, and projection.

```bash
rip table rows 550e8400-... --filter ignored=false --sort-by discovered_at --sort-order desc
rip table rows 550e8400-... --filter 'revenue[gte]=75' --filter 'tier[in]=gold,silver'
rip table rows 550e8400-... --fields slug,title,excerpt --include-total
```

Options: `--limit <n>` (default 100, max 500), `--after <rowId>`, `--before <rowId>`, `--sort-by <column>` (or `createdAt` / `updatedAt` / `id`), `--sort-order <asc|desc>`, `--filter <key=value>` (repeatable; operators `eq lt lte gt gte ne in contains starts`), `--fields <columns>`, `--include-total`. A filter or sort naming a column the table doesn't have is an error.

### `rip table update <uuid> <rowId>`

Update one row (partial merge).

```bash
rip table update 550e8400-... 660f9500-... --data '{"relevance":"low"}'
```

Required: `--data <json>`. Options: `--expected-revision <n>` (workspace rows), `--expected-workspace-revision <n>`, `--workspace-session-id <id>`.

### `rip table delete <uuid>`

Delete rows.

```bash
rip table delete 550e8400-... --rows 660f9500-...,770a0600-...
```

Required: `--rows <ids>`. Options: `--expected-revisions <json>` (workspace rows), `--workspace-session-id <id>`.

## Folder commands

Folders organize artifacts. A standalone folder is personal or team-scoped (`--team`); a workspace folder is flat, has an audience, and is addressed by UUID for updates.

### `rip folder create <slug>`

```bash
rip folder create research-notes
rip folder create shared-reports --team research-team
rip folder create drafts --workspace <ws> --audience internal
```

Options: `--team <slug>`, `--workspace <workspace-id>`, `--audience <internal|shared>`, `--workspace-session-id <id>`.

### `rip folder list`

Options: `--team <slug>`, `--workspace <workspace-id>` (folders visible to you in that workspace).

### `rip folder show <slug>`

Folder details. Options: `--team <slug>`.

### `rip folder rename <old-slug> <new-slug>`

Options: `--team <slug>`.

### `rip folder delete <slug>`

Delete a folder. By default its artifacts are archived and remain accessible by ID. With `--delete-contents`, every artifact in it is permanently destroyed first.

```bash
rip folder delete drafts
rip folder delete research --team research-team
rip folder delete drafts --delete-contents
```

Options: `--team <slug>`, `--delete-contents`.

### `rip folder update <folder-id>`

Change a workspace folder's own audience (its children keep theirs).

```bash
rip folder update <folder-id> --workspace <ws> --audience shared --expected-workspace-revision <n>
```

Required: `--workspace <workspace-id>`, `--audience <internal|shared>`, `--expected-workspace-revision <n>`. Option: `--workspace-session-id <id>`.

### `rip folder share-contents <folder-id>`

Atomically share a workspace folder and all its current child artifacts. Later children do not inherit it.

```bash
rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>
```

Required: `--workspace <workspace-id>`, `--expected-workspace-revision <n>`. Option: `--workspace-session-id <id>`.

### Folder flags on other commands

```bash
rip artifact publish report.md --type markdown --folder research-notes   # file at publish time
rip artifact list --folder research-notes
rip artifact list --unfiled
```

## Task commands

A **task** is a claimable unit of work in a workspace — every task lives in exactly one, with an `internal` or `shared` audience. Claiming holds a lease so two agents never work the same thing in parallel; completing attaches what the work produced. Task ids are UUIDs; a non-UUID is a `400`. Guide: [`references/tasks.md`](./references/tasks.md).

### `rip task list`

List one workspace's tasks, filtered to the audiences you may see.

```bash
rip task list --workspace-id 7a1c2d1e-…
rip task list --workspace-id 7a1c2d1e-… --status all --limit 20
rip task list --workspace-id 7a1c2d1e-… --kind process-call --mine --since 7
```

Required: `--workspace-id <id>`; the CLI rejects omission before sending a request. Options: `--status <list>` (comma list of `open,claimed,done,dismissed` or `all`; default `open,claimed`), `--kind <kind>`, `--mine` (suggested to or claimed by you), `--since <iso>` (ISO timestamp or a positive number of days), `--limit <n>` (max 200), `--cursor <cursor>`.

### `rip task show <id>`

One task with its body, payload, and results.

### `rip task add <title>`

File a task in a workspace.

```bash
rip task add "Review pricing page copy" --workspace-id 7a1c2d1e-… --assignee alek
rip task add "Renew domain" --workspace-id 7a1c2d1e-… --due 2026-10-01
```

Required: `<title>` and `--workspace-id <id>`. Options: `--audience <internal|shared>` (default `internal` for internal members, `shared` for external editors), `--workspace-session-id <id>`, `--assignee <who>` (a suggestion, not a lock; must be a workspace editor who can see the audience), `--kind <kind>` (lowercase slug), `--body <markdown>`, `--due <iso>` (informational), `--payload <json>`.

### `rip task update <id>`

Update title, body, suggested assignee, or audience.

```bash
rip task update 4f2c1b90-… --expected-revision 3 --title "Review pricing copy (v2)"
```

Required: `--expected-revision <n>`. Options: `--title`, `--body`, `--assignee`, `--audience`, `--workspace-session-id <uuid>`.

### `rip task claim <id>`

Claim a task. Holds a lease; re-claiming your own extends it. Every task must be claimed before it completes.

Options: `--lease-hours <n>` (0.25–72, default 2), `--workspace-session-id <id>`. `TASK_ALREADY_CLAIMED` names the claimant and the lease expiry.

### `rip task touch <id>`

Extend the lease on a task you hold. Forward-only. Options: `--lease-hours <n>`, `--workspace-session-id <id>`.

### `rip task release <id>`

Give up your claim. A workspace admin may release anyone's. Option: `--workspace-session-id <id>`.

### `rip task done <id>`

Complete a task you hold, recording what it produced.

```bash
rip task done 4f2c1b90-… --result artifact:a1b2c3d4-…@2 --result url:https://example.com/report
```

Options: `--result <type:id>` (repeatable; `artifact:<publicId>[@version]` or `url:<https://…>`, at most 50), `--workspace-session-id <id>`. If your lease lapsed but nobody took over, results are kept (flagged `orphaned`) and you get `CLAIM_LOST`; if you never held the claim, nothing is written and you get `NOT_CLAIMANT`.

### `rip task dismiss <id>` / `rip task reopen <id>`

Dismiss a task (reopenable), or reopen a done or dismissed one. `dismiss` takes `--reason <text>`; both take `--workspace-session-id <id>`.

A task's history is workspace activity: read it with `rip workspace changes <workspace>`.

## Activity

### `rip activity`

The account or team feed: team shares, connection changes, and member removals. Read-only — poll it freely. Each row's sentence is rendered server-side, so `--json` and human output tell the same story. Task events are not here; they belong to their workspace (`rip workspace changes`).

```bash
rip activity --team quintel
rip activity --team quintel --type connection.created --since 7
rip activity --subject connection:4f2c1b90-…
```

Options: `--team <slug>` (default: your own scope), `--type <list>` (e.g. `connection.created,team.member_removed`), `--actor <who>` (account id or alias, or `system`), `--subject <type>:<id>`, `--since <iso-or-days>`, `--limit <n>` (max 200), `--cursor <cursor>`.

Claims, sessions, and activity rows record the harness you ran from: `claude-code` under Claude Code, else `cli`. Set `TOKENRIP_SURFACE=<harness>` to override; the CLI sends it as the `X-Tokenrip-Surface` header on every request.

## Search

### `rip search <query>`

Search across artifact content — hybrid keyword + semantic when enabled. Results are ranked by relevance with highlighted snippets. Supports `"exact phrase"`, `term1 OR term2`, and `-excluded`.

```bash
rip search "quarterly report"
rip search "deploy" --artifact-type code --since 7
rip search "how do we handle auth failures" --mode semantic
rip search "termination clause" --artifact contract-2026
```

Options: `--since <iso-or-days>`, `--limit <n>` (default 50, max 200), `--offset <n>`, `--artifact-type <type>`, `--archived`, `--include-archived`, `--mode <hybrid|keyword|semantic>`, `--artifact <id>`.

- `--mode hybrid` (default) fuses keyword and semantic similarity and falls back to keyword when semantic search isn't enabled for the account; `keyword` is exact/stemmed only; `semantic` is meaning-based only and errors if not enabled.
- `--artifact` scopes the search to one artifact and returns its most relevant chunks (hybrid or semantic mode).

## Connection commands

A **connection** is an encrypted, server-side credential that turns Tokenrip into a general API/inference router: store an upstream API key once, and call the provider through it while the platform injects the auth server-side — the caller never sees the secret. A connection is owned by a personal account **or** a team (`--team <slug>`): any current member may read, invoke, and create; the creator or the team owner may rotate, disable, or delete (`403 CONNECTION_FORBIDDEN` otherwise). Guide: [`references/connections.md`](./references/connections.md).

The secret is set (and rotated) via `--secret <value>` / `--secret-env <VAR>` / `--secret-stdin` — prefer the last two so the key stays out of shell history — and is **never returned** by any read command.

### `rip connection create`

```bash
export MINIMAX_KEY=sk-...
rip connection create --team quintel --name minimax \
  --base-url https://api.minimax.io/anthropic --auth-type header \
  --auth-header-name x-api-key --secret-env MINIMAX_KEY \
  --allowed-paths '/v1/*' --header anthropic-version=2023-06-01
```

Required: `--name <name>` (unique per owner), `--base-url <url>` (SSRF-checked), `--auth-type <bearer|header|basic|query>`. Secret: one of `--secret`, `--secret-env <VAR>`, `--secret-stdin`. Optional: `--auth-header-name <name>` (for `header`), `--allowed-paths <csv>` (path globs, e.g. `'/v1/*'`), `--header k=v` (repeatable static default header), `--query k=v` (repeatable static default query param), `--rate-limit-per-min <n>` (default 60), `--daily-quota <n>` (default 1000), `--team <slug>`.

### `rip connection list`

```bash
rip connection list
rip connection list --team quintel --include-disabled
```

Options: `--team <slug>`, `--include-disabled`.

### `rip connection get <id>`

One connection's config (no secret). Option: `--team <slug>`.

### `rip connection rotate-secret <id>`

Replace the encrypted secret. Options: `--secret`, `--secret-env <VAR>`, `--secret-stdin`, `--team <slug>`.

### `rip connection disable <id>` / `rip connection rm <id>`

`disable` soft-disables the connection and frees its name; `rm` hard-deletes it. Option: `--team <slug>`.

There is no CLI update for non-secret fields — disable and recreate, or use `PATCH /v0/connections/:id`.

### `rip connection call`

Invoke an upstream API through one of your own connections, or a team connection of a team you currently belong to. Auth and the connection's default headers and query are injected server-side. Posts to `POST /v0/connections/call`.

```bash
rip connection call --team quintel --connection minimax \
  --method POST --path /v1/messages \
  --body '{"model":"MiniMax-M2.5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
rip connection call --connection my-posthog --method GET --path /api/projects
```

Required: `--connection <name>`, `--method <GET|POST|PUT|PATCH|DELETE>`, `--path <path>` (must pass `--allowed-paths`). Optional: `--team <slug>` (a non-member gets `CONNECTION_FORBIDDEN`), `--body <json>`, `--query <json>` (merged with defaults; caller wins), `--header k=v` (repeatable; only `Content-Type` / `Accept` / `Accept-Language` / `User-Agent` are forwarded).

In human mode the command prints the bare upstream `{ status, headers, body, bodyIsJson, latencyMs }` as JSON on stdout; `--json` wraps it in the standard `{ ok, data }` envelope. Non-streaming only; 30 s timeout and 5 MB response cap.

## Skill commands

A **skill** is a versioned folder of agent instructions for a recurring job: `SKILL.md` (frontmatter `name` and `description`) plus supporting files. It is owned by your operator (personal) or a team (`--team <slug>`). Any agent linked to the operator reads, publishes, shares and deletes a personal skill; any current team member reads and publishes a team skill, and the team owner or an admin shares and deletes it. A name without `--team` means a personal skill. Guide: [`references/skills.md`](./references/skills.md). REST: `/v0/skills` (`docs/api/endpoints.md` § Skills).

### `rip skill list`

Every skill in reach, personal first, then by team slug, then by name: name, owner, version, sharing, id, description and (when shared) link. Option: `--team <slug>` keeps one team's skills.

### `rip skill get <skill>`

```bash
rip skill get blog-post                               # SKILL.md, then the file list
rip skill get blog-post --team quintel --file references/style.md   # raw bytes on stdout
rip skill get blog-post --dir ./blog-post             # every file into a new or empty folder
rip skill get https://tokenrip.com/skills/<id>        # link-shared: no identity needed
```

`<skill>` is a name, a skill id, or a link (`…/skills/<id>`). A name resolves through your catalog: `SKILL_NOT_FOUND` names the identity the CLI used, and two personal skills with one name (an agent linked to two operators) are `OPERATOR_AMBIGUOUS` (the message lists the ids). An id or link is read with any identity that exists, or none. `--dir` refuses an existing non-empty folder and any manifest path that would land outside it or names a `.git`, `.svn`, `.hg` or `node_modules` entry, checks each file against the manifest digest, and writes all or nothing (a temporary sibling folder renamed into place). It records the folder as a checkout of that version, so a later `rip skill publish <folder>` is checked against it. A team id given to `--team` must be in the local team cache (`rip team list`); otherwise pass the slug. Options: `--team <slug>`, `--file <path>`, `--dir <folder>`.

### `rip skill publish <folder>`

```bash
rip skill publish ./blog-post
rip skill publish ./blog-post --team quintel
```

Publishes the folder as the next version of the skill named by `SKILL.md`'s frontmatter `name` (the first publish creates it, private). Only new or changed files are sent (UTF-8 as text, others as base64), and an unchanged folder publishes nothing. `.git`, `node_modules` and OS junk are skipped; a symbolic link or any other hidden file (such as `.env`) is refused with `INVALID_ARGS`. The 512-file and 16 MiB limits are checked locally first. The folder is compared with its **base version**, which is sent as `expectedVersion`: `--expected-version <n>` if given; else the version the folder was fetched at with `rip skill get --dir` or last published as (recorded per folder in the config folder's `skill-checkouts.json`, keyed by the folder's real path and API URL); else the current version (0 for a new skill). Files that differ from the base are sent and files of the base missing from the folder are removed. If anyone published after the base, nothing is published: `CONFLICT` with `currentRevision`, and the message says to fetch into a new folder with `--dir` and merge. The output's `basedOn` is `checkout`, `current` or `explicit`, with `baseVersion`. Refusals: `INVALID_SKILL` with a `reason`, `NO_OPERATOR`, `OPERATOR_AMBIGUOUS`, `SKILL_FORBIDDEN`, `CONFLICT`. Options: `--team <slug>`, `--expected-version <n>`.

### `rip skill share <skill>`

Exactly one of `--link` (anyone with the printed link reads every file and version) or `--private` (stop sharing). Option: `--team <slug>`.

### `rip skill delete <skill>`

Deletes the skill and every version. Option: `--team <slug>`.

### `rip skill install`

```bash
rip skill install                    # ~/.claude/skills inside Claude Code (CLAUDECODE set), else ~/.agents/skills
rip skill install --target agents    # ~/.agents/skills
```

Writes a stub folder for every skill in reach into the host's user-level skills folder, so filesystem hosts trigger skills natively. A stub's `SKILL.md` frontmatter is the skill's `name` and `description` (the folder is named after the skill); its body says to run `rip skill get <skill-id>` (with `--agent <accountId>` when a local identity installed it; none under `TOKENRIP_API_KEY`), follow what it prints, read files with `--file`, and write copies for scripts with `--dir` into a temp folder outside any skills folder. Each stub carries a `.tokenrip-skill.json` marker (`{ skillId, name, team, accountId, apiUrl }`). Re-running writes new stubs, refreshes changed ones and removes marked folders whose skill is no longer in reach, deleting only the files the CLI wrote (a folder holding other files is `kept`); files are written atomically. A folder without the marker, or a symbolic link, is never touched (`unmanaged`); a stub recorded for another account is never refreshed or removed (`other_agent`), while one with no recorded account is adopted. Personal skills claim a name before team skills, so a team skill named like a personal one (or a second operator's personal skill of that name) is skipped `name_taken`. Output: `target`, `dir`, `accountId`, `written`, `refreshed`, `unchanged`, `removed`, `kept`, `skipped` (`{ name, team, reason }`), `failed` (`{ name, team, error }`; one stub's failure does not stop the others). Install into one target per host: Cursor and Copilot read both folders, so stubs in both may appear twice. Option: `--target claude|agents`.

## Bundle commands

Deploy a directory as a multi-file **static-site bundle** — a versioned file tree served live at `https://bundles.tokenrip.com/<id>/`, with relative links and client-side JS intact.

### `rip deploy <dir>` / `rip bundle deploy <dir>`

`rip deploy` is a top-level alias for `rip bundle deploy`. Zips the directory locally, uploads it, and prints the live URL plus the `/b/:id` page URL. `.git`, `node_modules`, and OS junk files are skipped.

```bash
rip deploy ./ef-course --title "Equipment Finance Course" --slug ef-course --visibility public
rip deploy ./dist --spa                 # serve the entrypoint for unknown paths
rip deploy ./site --bundle ef-course    # publish a new version of an existing bundle
rip deploy ./site --dry-run             # zip and inspect locally without uploading
```

Options: `--title` (default: directory name), `--slug` (alias `--alias`), `--description`, `--bundle <idOrSlug>`, `--visibility <private|link|public>` (default `link`), `--entrypoint <file>` (default `index.html`), `--spa`, `--dry-run`.

### `rip bundle list`

Options: `--archived`, `--include-archived`.

### `rip bundle get <idOrSlug>`

Metadata, the live URL, and the file manifest.

### `rip bundle versions <idOrSlug>`

Versions, newest first.

### `rip bundle rollback <idOrSlug> <version>`

Point the live site back at an earlier version (no new version is created).

### `rip bundle open <idOrSlug>`

Print the live URL. `--browser` also opens it in the OS default browser.

### `rip bundle delete <idOrSlug>`

Permanently delete a bundle and all its versions. Requires `--yes`.

## Team commands

Teams group agents. Artifacts shared to a team are visible to every member, and a team can own workspaces and connections.

### `rip team create <slug>`

```bash
rip team create research-team --name "Research Team" --description "Shared research"
```

Options: `--name`, `--description`.

### `rip team list`

Teams you belong to, with their UUIDs.

### `rip team show <slug-or-id>`

Team details (including its UUID and owner) and members.

### `rip team add <slug-or-id> <agent>`

Add an agent (ID or alias). An agent under your operator is added directly. For an agent under another operator nothing is sent: the command prints a one-time invite token (valid 7 days) for you to pass on, and the agent joins with `rip team accept-invite <token>`.

### `rip team invite <slug-or-id>`

Generate a one-time invite token (7-day expiry). The recipient joins with `accept-invite`.

### `rip team accept-invite <token>`

Join a team with an invite token.

### `rip team remove <slug-or-id> <agent>`

Remove a member. Owner only.

### `rip team leave <slug-or-id>`

Leave a team.

### `rip team delete <slug-or-id>`

Delete a team. Owner only. A team that still owns workspaces cannot be deleted (`TEAM_OWNS_WORKSPACES`).

### `rip team alias <slug> <alias>` / `rip team unalias <slug>`

Set or remove a local short alias; aliases work anywhere a team slug is accepted.

### `rip team sync`

Refresh the local team cache from the server — run it after another agent adds you to a team.

## Auth commands

### `rip auth login`

Sign in with the person's email. Without `--code`, Tokenrip emails a six-digit code (10 minutes, single use; a new one can be requested after a minute). With `--code` (emailed, or made by a connected agent or the dashboard), the CLI gets a key of its own on the person's account, saves it as a keypair-less identity in `identities.json`, and makes it the current account. No other agent's key is touched. Signing in again on an account this machine holds revokes the key it replaces (best-effort; `previous_key` in the output says `revoked`, `already_invalid`, or `not_revoked`, and a key that was found but not revoked is named in `previous_key_id` so you can run `rip auth keys revoke <id>`). If `TOKENRIP_API_KEY` is set, or `TOKENRIP_AGENT` names another identity, later commands keep using that instead of this sign-in: the output carries `overridden_by` (`TOKENRIP_API_KEY` or `TOKENRIP_AGENT`) and the human output warns; unset the variable to use the sign-in.

```bash
rip auth login --email ana@example.com                  # emails a code
rip auth login --email ana@example.com --code 123456    # signs in
```

Required: `--email`. Options: `--code`, `--name` (the key's name; default `Claude Code` under Claude Code, else `CLI`). Errors: `INVALID_CODE` (wrong, used, or expired), `CODE_RECENTLY_SENT`, `SIGN_IN_LOCKED` (five wrong codes; the message states the unlock time in UTC), `INVALID_EMAIL`, `INVALID_NAME`.

### `rip auth code`

Make a six-digit sign-in code for the person's next agent and print the line to paste into it (`Connect to my Tokenrip: …/setup — email …, code … (valid 10 minutes)`). Making a new code replaces the previous one this agent made. Refusals: `NO_OPERATOR` / `OPERATOR_AMBIGUOUS` (409) when the account has no single verified person, `RATE_LIMITED`.

### `rip auth keys`

```bash
rip auth keys                            # list (also: rip auth keys list)
rip auth keys create --name "Hermes"     # a key for a host that takes a pasted key; shown once
rip auth keys revoke <id>                # disconnect the agent using that key
```

Every key on the account: connected agents, keys made for hosts, connector grants (with the connector's name). `(this agent)` marks the key this CLI uses. Revoking that key yourself adds `own_key: true` to the output and a warning: this CLI's key no longer works, so sign in again (or, under `TOKENRIP_API_KEY`, replace or unset the variable). Paste a created key into the host's key vault or settings, never into a chat. `default`, `mcp-oauth`, and `mcp-oauth-grant` are reserved names.

### `rip auth rotate-key` (alias `create-key`)

Replace this agent's key and save the new one. Every other key on the account keeps working. Refused with `ENV_KEY_ROTATION` (no request made) while `TOKENRIP_API_KEY` is set: unset it to rotate a stored identity's key, or, for a key kept in a host's vault, make a new one with `rip auth keys create --name <name>` and revoke the old one.

### `rip auth whoami`

Your current identity and profile.

### `rip auth update`

```bash
rip auth update --alias "research-bot"
rip auth update --tag "Writer" --public true
rip auth update --description "Research agent" --website "https://example.com" --email "contact@example.com"
```

Options: `--alias`, `--metadata <json>`, `--tag`, `--description`, `--website`, `--email`, `--public <true|false>`. Pass an empty string to clear a field. A public profile is at `https://tokenrip.com/a/<alias>` and `GET /v0/accounts/<alias>`.

### Retired: `rip auth register`, `rip auth claim`, `rip auth link`

Each prints a pointer to `rip auth login` and the setup guide and exits 1 without contacting the server (`USE_LOGIN` for `register`, `RETIRED` for the others). `register` still accepts `--alias` and `--force`.

## Account commands

Manage multiple identities on this machine.

```bash
rip account create --alias my-agent      # keypair identity: a separate account (advanced)
rip account recover-key                  # keypair identity lost its key: get a new one
rip account list                         # * marks the current one
rip account use my-agent                 # switch (alias or rip1… ID)
rip account remove my-agent              # remove locally; the server record is kept
rip account export my-agent --to rip1x9a2k7m3...   # encrypted for the recipient (Ed25519→X25519 + AES-256-GCM)
rip account import blob.txt              # or - for stdin
```

Override the active identity for one command with `rip --agent <name> …` or `TOKENRIP_AGENT=<name>`.

`account create` makes a keypair identity: its own account, not the person's. Most agents sign in with `rip auth login` instead. `recover-key` signs a recovery request with the local keypair and replaces only the identity's `default` key. `recover-key`, `export`, `import`, and `rip operator-link` sign with the local keypair, so an identity that signed in by email refuses them with `NO_LOCAL_KEYPAIR`.

## Operator commands

### `rip operator-link`

Generate a signed agent-binding link and a 6-digit code. The link is Ed25519-signed locally; the code can be entered at `tokenrip.com/operator/agents` ("Link a CLI identity created without email"). The operator first signs in and verifies email, then confirms **Link agent**. Neither proof logs a browser in or approves MCP OAuth.

```bash
rip operator-link --expires 1h
```

Option: `--expires <duration>` (default `5m`; e.g. `5m`, `1h`, `1d`).

## Config commands

```bash
rip config set-key tr_abc123...                  # save a key to config.json; used only for public reads
rip config set-url https://api.tokenrip.com      # API server URL
rip config set-output json                       # default output format: json | human
rip config show                                  # API URL, key status, config paths
```

`set-key` does not sign in: authenticated commands use the current identity's key (or `TOKENRIP_API_KEY`), never the one saved here. To use a key from elsewhere, set `TOKENRIP_API_KEY`; to get a key of your own, sign in with `rip auth login`.

## Updates

### `rip update` (alias of `rip self-update`)

Check for a newer CLI and install it via npm, then print how to refresh the skill file.

## Provenance tracking

`artifact publish` and `artifact upload` accept lineage metadata (`--context` also works on `artifact update`):

- `--parent <uuid>` — parent artifact ID
- `--context <text>` — creator context (agent name, task)
- `--refs <urls>` — comma-separated input reference URLs

## Several agents, one account

Every agent the person connects (this CLI, chat apps through an MCP connector, hosted agents) joins their one account with its own key, so all see the same workspaces; connecting one never disconnects another. Hand off with `rip auth code`; list and remove agents with `rip auth keys` or the dashboard's Agents page. The setup guide for every kind of assistant is at `https://tokenrip.com/setup`. MCP tool names mirror the CLI groups (`workspace_load`, `artifact_publish`, `task_claim`, `connection_call`, `key_list`, `sign_in_code_create`, …).

## Library usage

`@tokenrip/cli` also works as a Node.js/Bun library.

```typescript
import { loadConfig, getApiUrl, getApiKey, createHttpClient } from '@tokenrip/cli';

const config = loadConfig();
const client = createHttpClient({
  baseUrl: getApiUrl(config),
  apiKey: getApiKey(config),
});

const { data } = await client.post('/v0/artifacts', {
  type: 'markdown',
  content: '# Hello\n\nGenerated by my agent.',
  title: 'Agent Output',
});

console.log(data.data.id); // artifact UUID
```

### Exports

| Export | Description |
|--------|-------------|
| `loadConfig()` / `saveConfig(config)` | Read or write `~/.config/tokenrip/config.json` |
| `getApiUrl(config)` / `getApiKey(config)` | Resolve the API URL / key (env → config → default) |
| `CONFIG_DIR` | The config directory (`TOKENRIP_CONFIG_DIR` or `~/.config/tokenrip`) |
| `createHttpClient(opts)` | Axios instance with auth and error handling |
| `requireAuthClient()` | Load config + create an authenticated client (throws if no key) |
| `CliError` / `toCliError(err)` | Typed error class with error codes; normalize any error |
| `outputSuccess(data, formatter?)` / `outputError(err)` / `wrapCommand(fn)` | Output helpers used by every command |
| `generateKeypair()` | Generate an Ed25519 keypair (hex-encoded) |
| `publicKeyToAccountId(hex)` / `accountIdToPublicKey(id)` | Convert between a public key and a `rip1…` account ID (`agentIdToPublicKey` is a deprecated alias) |
| `sign(data, secretKeyHex)` / `signPayload(payload, secretKeyHex)` | Ed25519 signature; sign a JSON payload → `base64url.signature` |
| `loadIdentity()` / `saveIdentity(identity)` | Legacy single-identity file (v2 migration only) |
| `loadIdentities()` / `saveIdentities(store)` | The identity store (`identities.json`) |
| `addIdentity(identity)` / `removeIdentity(target)` | Add or remove a stored identity |
| `resolveCurrentIdentity()` | Active identity (override → env → config → implicit) |
| `resolveAccountId(store, target)` / `resolveAgentId(store, target)` | Resolve an alias or ID to a stored account ID |
| `setAgentOverride(value)` | Per-process identity override |
| `search(query, options)` | The `rip search` command |
| `folderCreate`, `folderList`, `folderShow`, `folderDelete`, `folderRename`, `folderUpdate`, `folderShareContents`, `artifactMove` | The folder commands |
| `skillList`, `skillGet`, `skillPublish`, `skillShare`, `skillDelete`, `skillInstall`, `skillIdFromLink` | The skill commands; `skillIdFromLink` parses a skill id or link |
| `syncStubs(entries, dir)`, `renderStub(entry)`, `defaultSkillTarget(env)`, `skillTargetDir(target, homeDir)`, `SKILL_STUB_MARKER` | The stub writer behind `rip skill install` |
| `walkFiles(dir)` | The directory walk behind `rip deploy` and `rip skill publish` |
| `loadTeams`, `saveTeams`, `resolveTeam`, `resolveTeams`, `setAlias`, `removeAlias`, `syncTeamsFromResponse` | The local team cache and aliases |

Types: `TokenripConfig`, `ClientConfig`, `AuthContext`, `WorkspaceSummary`, `SkillCatalogEntry`, `SkillView`, `SkillOwner`, `SkillTarget`, `StubEntry`, `StubSyncResult`, `WalkedFile`, `Keypair`, `Identity`, `StoredIdentity`, `IdentityStore`, `LocalTeam`, `Teams`, `ServerTeamEntry`.

## Configuration

Config lives at `~/.config/tokenrip/config.json` (v3):

```json
{
  "configVersion": 3,
  "currentAccount": "rip1x9a2k7m3...",
  "apiUrl": "https://api.tokenrip.com",
  "preferences": {}
}
```

Identities are stored at `~/.config/tokenrip/identities.json` (mode 0600), keyed by account ID; each entry holds the keypair and API key.

Environment variables take precedence over the config file:

| Variable | Overrides |
|----------|-----------|
| `TOKENRIP_API_KEY` | API key (for every identity) |
| `TOKENRIP_API_URL` | `apiUrl` |
| `TOKENRIP_AGENT` | Active account (alias or account ID) |
| `TOKENRIP_OUTPUT` | Output format (`human` or `json`) |
| `TOKENRIP_CONFIG_DIR` | Config directory |
| `TOKENRIP_SURFACE` | Harness name recorded on claims and activity (default `claude-code` or `cli`) |

## Output format

Human-readable text by default. Use `--json` or `TOKENRIP_OUTPUT=json` for JSON. Success goes to stdout (exit 0), errors to stderr (exit 1).

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "NO_API_KEY", "message": "No API key configured." }
```

## Error codes

Client-side codes:

| Code | Meaning |
|------|---------|
| `NO_API_KEY` | No API key configured |
| `NO_IDENTITY` | No account found locally |
| `AMBIGUOUS_IDENTITY` | Multiple accounts, none selected |
| `IDENTITY_NOT_FOUND` | `--agent` name doesn't match any local account |
| `LAST_IDENTITY` | Cannot remove the only remaining account |
| `FILE_NOT_FOUND` | Input file does not exist |
| `INVALID_TYPE` | Publish type not one of: markdown, html, chart, code, text, json, csv, table |
| `UNAUTHORIZED` | API key not valid (revoked, or a bodiless 401). If `TOKENRIP_API_KEY` is set, that key is the one refused: replace or unset it. Otherwise sign in again: `rip auth login --email <email>` |
| `NO_LOCAL_KEYPAIR` | The command signs with a local keypair; this identity signed in by email |
| `USE_LOGIN` / `RETIRED` | A retired setup command (`auth register` / `auth claim`, `auth link`); use `rip auth login` |
| `TIMEOUT` | Request timed out |
| `NETWORK_ERROR` | Cannot reach the API server |
| `AUTH_FAILED` | Could not create API key |
| `INVALID_AGENT_ID` | Agent ID doesn't start with `rip1` |

Common server codes:

| Code | Meaning |
|------|---------|
| `PRECONDITION_REQUIRED` / `CONFLICT` | A workspace write lacks, or has a stale, version id or revision |
| `WORKSPACE_FORBIDDEN` / `WORKSPACE_ARCHIVED` | No access to that workspace, audience, or write; or the workspace is archived |
| `WORKSPACE_AUTHORITY` | Omit the named incompatible standalone fields and use audience; keep full content and session attribution |
| `WORKSPACE_REQUIRED` | A task create/list request lacks `workspaceId` |
| `INVALID_SCOPE` | Workspace-only creation fields require `workspaceId` |
| `ALREADY_IN_WORKSPACE` / `CROSS_WORKSPACE_MOVE` | Adoption or move refused |
| `TEAM_OWNS_WORKSPACES` | The team still owns workspaces |
| `TASK_ALREADY_CLAIMED` / `CLAIM_LOST` / `NOT_CLAIMANT` | Claim races and lapsed leases |
| `CONNECTION_FORBIDDEN` / `CONNECTION_NOT_FOUND` | Not allowed to use, or no such enabled, connection |
| `SKILL_NOT_FOUND` / `SKILL_FORBIDDEN` | Skill not in reach (or missing); in reach but you may not share or delete it |
| `INVALID_SKILL` | The folder breaks a skill rule; `reason` says which (`references/skills.md`) |
| `NO_OPERATOR` / `OPERATOR_AMBIGUOUS` | A personal skill needs exactly one operator linked to this agent |
