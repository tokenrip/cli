# @tokenrip/cli — Agent Guide

Tokenrip is a shared workspace for people and AI agents. A **workspace** keeps a project's artifacts, tables, folders, and tasks together so any agent can pick up where the work left off. The `rip` CLI lets an agent load a workspace, publish and version artifacts, manage tables and folders, propose actions for a person to approve before they go out, report finished work, decide reviews, start and complete tasks, call external APIs through stored connections, deploy static sites, search, and share with teams.

## Install

```bash
# Claude Code / Codex / Cursor - skill install
npx skills add tokenrip/cli

# OpenClaw
npx clawhub@latest install tokenrip-cli

# Direct - cli only
npm install -g @tokenrip/cli
```

## Setup

Sign in with the person's email. Tokenrip emails a six-digit code; ask the person for it (or read it from their inbox if you can):

```bash
rip auth login --email ana@example.com
rip auth login --email ana@example.com --code 123456
rip auth whoami
```

If another of the person's agents is already connected, it can make the code instead (`rip auth code`) and no email is sent. If you receive `NO_API_KEY`, `NO_IDENTITY`, or `UNAUTHORIZED`, sign in again; it never disconnects the person's other agents. The setup guide for every kind of assistant is at `https://tokenrip.com/setup`.

Environment variables take precedence over the config file:

```bash
export TOKENRIP_API_KEY=tr_...
export TOKENRIP_API_URL=https://api.tokenrip.com  # optional, this is the default
```

## Output Format

Output is human-readable by default. Pass `--json` (or set `TOKENRIP_OUTPUT=json`) for JSON on stdout:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "ERROR_CODE", "message": "description" }
```

Exit code 0 = success, 1 = error. Human errors go to stderr; JSON errors go to stdout. CLI failures preserve domain `error`, `message`, and safe details such as required fields and authorized current revisions. MCP failures additionally include `retry`, which describes safety of the identical request, not guaranteed success or an automatic retry loop.

## Start Here: Workspaces

```bash
rip workspace list                                            # names, ids, your membership/role
rip workspace load <workspace-id>                             # bounded context, recent sessions, your browser link
```

`load` prints what you can do, your browser link, then first your **instructions** (what your person wrote for you in this workspace, whole, with the kinds you may do on your own; follow them), **Waiting on you** (approved tasks to carry out, reviews addressed to you to decide, tasks for you, each with the next command), your proposals In review and the workspace's **Agents** with their `agent:<handle>`; then pinned read-on-load documents, the latest handoff note, recent sessions (who worked, `You` or `~alias`, from which tool, and steps: each goal with the changes made for it, including versions and diff commands), open tasks (one waiting on you is printed once), recent changes (who, the action, the item's title and id, and the why), and the artifact index. A large pin or handoff arrives as a reference; the human output prints the exact command to read it, `rip artifact cat <publicId> --version-id <versionId>` (in `--json`, a pin or handoff has `content.content` when inline, otherwise `content.versionId`). Loading again is safe; it takes no selector. A workspace in the trash answers `WORKSPACE_DELETED` (410). Duplicate names require full UUID, slug, home, and capabilities to disambiguate. Workspaces are addressed by UUID; `rip ws` is an alias for `rip workspace`.

**Every write to workspace content states why:** `--why "<one sentence>"` on what the person is trying to accomplish, in their terms, not a description of the edit ("Set launch prices the team can defend to finance", not "Update row 4"). Restate it on every write, or set `TOKENRIP_WHY` for a script with one purpose. Without it the server refuses `WHY_REQUIRED`. Sessions record themselves from these writes; there is nothing to start or end. Deep dive: `references/workspaces.md`.

```bash
# What changed since I last looked (reading never acknowledges)
rip workspace changes <workspace-id> [--limit <n>]
rip workspace ack <workspace-id> --delivery-token <token>

# Who worked here recently (newest first): each goal with the changes made for it
rip workspace sessions <workspace-id> [--cursor <nextCursor>]

# Leave a handoff note for the next agent (optional; the session is recorded anyway)
rip artifact publish notes.md --type markdown --title "Handoff: ..." --workspace-id <workspace-id> --handoff --why "<the goal>"

# Lifecycle and members
rip workspace create <slug> --name "Roadmap" [--description <text>] [--team-id <team-uuid>] --why "<the goal>"
rip workspace show <workspace-id>
rip workspace update <workspace-id> --name <name>
rip workspace delete <workspace-id>                    # to the trash with everything in it, for 30 days
rip trash restore workspace <workspace-id>
rip workspace member add <workspace-id> <email|alias|account-id> [--membership internal|external] [--role viewer|editor] [--note <text>]   # invite by email; internal editor by default
rip workspace member set-role <workspace-id> <member> --role viewer|editor [--membership internal|external]
rip workspace member list <workspace-id>  ·  rip workspace member remove <workspace-id> <member>   # <member>: row id, account id, or the invited email

# Bring standalone content in; pin read-on-load context
rip workspace adopt <workspace-id> <artifact-id> --audience internal|shared
rip workspace adopt <workspace-id> <folder-id> --kind folder --audience internal|shared
rip workspace pin add <workspace-id> <artifact-id> [--position <n>]
rip workspace pin remove <workspace-id> <artifact-id>

# The operator's paired browser tab
rip workspace view context <workspace-id>
rip workspace view open <workspace-id> <artifact-id> --operation-id <id> --expected-context-generation <n>
```

Every item in a workspace has an **audience**: `internal` (owner, owning team, and internal members) or `shared` (external members too). Workspace content is written with the ordinary artifact, table, folder, and task commands plus workspace flags, and existing-item changes carry the applicable precondition the read reported:

```bash
rip artifact publish report.md --type markdown --title "Report" --workspace-id <ws> [--audience internal|shared] [--folder <slug-or-id>] --why "<the goal>"
rip artifact update <id> report-v2.md --type markdown --expected-version-id <version-id>
rip artifact patch <id> --audience shared --expected-workspace-revision <n>
rip table update <table-id> <row-id> --data '{...}' --expected-revision <row-rev>
rip folder create <slug> --workspace <ws>
rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>
```

New artifact, folder, and task creation needs no revision. Insert-only rows need none unless expanding schema; matched upserts retain their guards. A missing required precondition is `PRECONDITION_REQUIRED`; a stale one is `CONFLICT` with the authorized current value. Reconcile before a corrected write. Use audience and omit standalone visibility/sharing fields on workspace creation; `WORKSPACE_AUTHORITY` names incompatible fields. `audience` and `--handoff` require explicit workspace identity. Keep the content and the why when correcting input. History acknowledgment consumes a delivered page and cannot repair a write conflict.

## Artifact Commands

The `artifact` group also has a short alias: `rip art ...`.

### `rip artifact publish [file] --type <type>`

Publish structured content. Types: `markdown`, `html`, `chart`, `code`, `text`, `json`, `csv`, `table`. The file argument is optional — pass `--content <string>` to publish inline content without writing a temp file.

```bash
rip artifact publish report.md --type markdown --title "Analysis"
rip artifact publish data.json --type json --context "My Agent"
rip artifact publish data.csv --type csv --title "Leads"           # versioned CSV file
rip artifact publish report.md --type markdown --dry-run           # validate only

# Inline content (no file)
rip artifact publish --type markdown --title "Quick Note" --content "# Hello"

# CSV → table in a single command
rip artifact publish leads.csv --type table --from-csv --headers --title "Leads"
```

**When to pick which tabular type:**
- `--type csv` — versioned file, renders as a table, no row-level API. Good for exports and snapshots.
- `--type table` (with `--schema` or `--from-csv`) — living table with a row-level API, no versioning. Good for data that grows over time. Pass `--strict` to reject unknown columns and type-mismatched values on row writes; without it an unknown key is silently *added* to the schema as a `text` column and values are never type checked.

**Visibility.** `--visibility <private|link|public>` sets who can read a standalone artifact. The default is `link` (anyone with the URL). Workspace content uses `--audience` instead.

**Public assets.** Pass `--public-asset` to store the bytes in a public-read bucket and serve them from a direct CDN URL — for public media (blog images, embeddable charts). The command prints `publicUrl`. The API rejects a public asset with private visibility (`400 INVALID_VISIBILITY`) and on tables (`400 PUBLIC_ASSET_UNSUPPORTED`); the flag is immutable once set.

Other options: `--alias`, `--team <slugs>`, `--folder <slug>`, `--metadata <json>`, `--parent`, `--context`, `--refs`, `--workspace-id`, `--audience`, `--handoff`, `--why`.

### `rip artifact upload <file>`

Upload a binary file (PDF, image, etc.).

```bash
rip artifact upload screenshot.png --title "Screenshot"
rip artifact upload document.pdf --dry-run  # validate only
rip artifact upload hero.png --public-asset # → data.publicUrl (direct CDN)
```

### Versions and metadata

```bash
rip artifact update <id> report-v2.md --type markdown --description "revised"   # new version, same URL
rip artifact update <id> report-v2.md --type markdown --title "Report (v2)"     # version + retitle
rip artifact patch <id> --title "Better Title"                                  # no new version
rip artifact patch <id> --alias my-report --description "One-line summary"
rip artifact patch <id> --visibility private
rip artifact versions <id>
rip artifact diff <id> [--version-id <versionId>] [--from <versionId>]          # vs. the previous version; --from for a range
rip artifact delete-version <id> <versionId>
```

### Fetch, download, and inspect

Accepts a UUID, alias (bare or scoped: `~agent/alias`, `_team/alias`), or full URL.

```bash
rip artifact get <id>                                 # metadata + permissions
rip artifact cat <id> [--version-id <versionId>]      # content to stdout
rip artifact download <id> --output ./report.pdf      # content to a file
rip artifact download <table-id> --format json        # tables export as csv (default) or json
rip artifact list [--since <iso>] [--type markdown] [--limit 5] [--folder <slug>] [--team <slug>]
rip artifact stats                                    # storage usage
```

### Delete, fork, bulk

```bash
rip artifact delete <id>           # to the trash for 30 days; rip trash restore artifact <id> brings it back
rip artifact fork <id-or-alias> [--title "My Version"] [--folder tools]

rip artifact bulk move --ids "id1,id2,id3" --folder reports
rip artifact bulk move --ids "id1,id2" --unfiled
rip artifact bulk delete --ids "id1,id2"          # to the trash; up to 200 ids per call
```

### Trash

Deleting an artifact, folder, bundle or workspace moves it to the trash for 30 days; a folder or workspace takes what is in it along. Reads answer 410 `DELETED` (or `WORKSPACE_DELETED`) with `deletedAt` and `purgeAt`, and the name stays held. Anyone who could delete it can restore it until `purgeAt`; then the daily purge removes it for good. Agents cannot purge; a person can choose Delete forever in the dashboard. Version and table-row deletes stay immediate and permanent.

```bash
rip trash list [--team <slug> | --workspace <ws>] [--limit <n>] [--offset <n>]
rip trash restore <artifact|bundle|folder|workspace> <id> [--expected-workspace-revision <n>] [--why <text>]
```

A workspace file or folder needs `--expected-workspace-revision` (the entry's `workspaceRevision`). A file whose folder is still in the trash comes back unfiled; one whose workspace is in the trash is refused with 409 `WORKSPACE_DELETED`.

### Team sharing

```bash
rip artifact publish report.md --type markdown --team research-team,simon-agents   # at publish
rip artifact team add <id-or-alias> <team> [<team>...]                             # after publish
rip artifact team remove <id-or-alias> <team>
```

## Table Commands

Create a table with `artifact publish --type table`, then manage rows with the `table` subcommands.

```bash
rip artifact publish --type table --title "Research" --strict \
  --schema '[{"name":"slug","type":"text","unique":true},{"name":"company","type":"text"}]'

rip table append <uuid> --data '{"slug":"acme","company":"Acme"}'      # max 1000 rows per call
rip table append <uuid> --file rows.json
rip table append <uuid> --data '{"slug":"acme","company":"Acme Inc"}' --upsert-on slug

rip table rows <uuid> --limit 50 --after <rowId>
rip table rows <uuid> --sort-by discovered_at --sort-order desc
rip table rows <uuid> --filter 'revenue[gte]=75' --filter 'tier[in]=gold,silver'
rip table rows <uuid> --fields slug,title --include-total

rip table update <uuid> <rowId> --data '{"relevance":"low"}'
rip table delete <uuid> --rows <rowId>,<rowId>
```

- A table has at most one key, the column declared `unique: true`; storage rejects a duplicate with `409 DUPLICATE_UNIQUE_VALUE` (also a key repeated within one call; nothing is written). The key compares exact stored text: `"100"` and `"100.0"` differ, the number `1` and the string `"1"` are one key. `--upsert-on <key>` updates the matching row instead, in one atomic call; it must name the key, and every row must carry it. A key value that is an object or array, or over 1024 bytes, is `400 INVALID_COLUMN_VALUE`.
- Filter operators (key suffix): `eq` (default), `lt`, `lte`, `gt`, `gte`, `ne`, `in` (comma-separated), `contains`, `starts`. Filters are ANDed and compare by the column's declared type.
- A sort, filter, or field naming a column the table doesn't have is a `400`, not a silently ignored parameter.
- Ordering is total (`created_at, id` tie-break), so cursors stay stable. `--sort-by` also accepts `createdAt` / `updatedAt` / `id`.

## Folder Commands

```bash
rip folder create <slug> [--team <slug>]
rip folder list [--team <slug>]
rip folder show <slug> [--team <slug>]
rip folder rename <old-slug> <new-slug> [--team <slug>]
rip folder delete <slug> [--team <slug>]                       # folder and its artifacts to the trash
rip artifact move <id> --folder <slug> [--team <slug>]         # or --unfiled

# In a workspace
rip folder create <slug> --workspace <ws> [--audience internal|shared]
rip folder list --workspace <ws>
rip folder update <folder-id> --workspace <ws> --audience internal|shared --expected-workspace-revision <n>
rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>
rip artifact move <id> --folder-id <folder-uuid> --expected-workspace-revision <n>
```

## Task Commands

A **task** is one piece of work in a workspace (`todo`, `doing`, `review` — In review, `done`, `cancelled`); every task lives in one. **Before acting outside the workspace** (post, send, publish, book), propose it and carry out only what comes back approved; report work that needed no approval; decide reviews addressed to you. A task is for a person or an agent (`--assignee`) and reviewed by one (`--reviewer`): a person by account id or alias, an agent as `agent:<handle>` from load's Agents. Deep dive: `references/tasks.md`.

```bash
rip task propose --workspace-id <ws> --title "Reply to @jen" --draft-file reply.txt --verb Post --kind x-reply
rip task propose <id> --draft "…"                    # a task you are doing, or a new draft for your own proposal
rip task show <id>                                   # who, draft, Approved text (carry out exactly this), decision, result, children, history
rip task done <id> --result-text "4 likes" --result url:https://…
rip task report --workspace-id <ws> --title "Sent the weekly digest" --result-text "38% opened"
rip task report <id> --result-text "12 likes"        # a later result on a Done task
rip task list --workspace-id <ws> --reviewer me      # reviews addressed to you
rip task decide <id> --approve|--skip --expected-revision <n> [--edited-draft-file f] [--note "…"]

rip task list --workspace-id <ws>                    # To do + Doing tasks you can see, with who holds each
rip task list --workspace-id <ws> --status todo --kind process-call --mine
rip task list --workspace-id <ws> --status done,cancelled --order finished
rip task add "<title>" --workspace-id <ws> --assignee <who> --reviewer <who> --parent <id> --kind <kind>
rip task update <id> --expected-revision <n> --title "…" --reviewer <who>

rip task start <id> --lease-hours 4                  # your key's hold under a LEASE
rip task start <id>                                  # again on a long run: renews (never shorter)
rip task stop <id>                                   # back to To do
rip task cancel <id> --reason "duplicate"            # also withdraws your own proposal
rip task reopen <id>
rip workspace changes <ws>                           # task history is workspace activity
```

A proposal comes back **In review** (stop; once approved, a later `rip workspace load` lists it under Waiting on you; a skip cancels it) or **doing and approved** when it goes to your own person and its kind is on your instructions' on-its-own list (carry it out now). Carry out exactly its approved text, the reviewer's edit included, then complete it with the result; never act twice. You decide only reviews whose reviewer is exactly your key (`REVIEW_NOT_YOURS` otherwise); a person decides theirs in the dashboard, where only your person writes your instructions.

An agent's hold belongs to its key, so two agents of one person never share a task. It has a lease (0.25–72h, default 2) that a minute-by-minute sweep returns to To do when it lapses; the person's hold in the dashboard has none. Two agents starting at once resolve at the database — one wins, the other gets `TASK_TAKEN` with `holder` saying who. Never check-then-start. The old `claim`, `touch`, `release` and `dismiss` commands run hidden with a deprecation note.

`task done` completes a task that is free or yours, from To do as well as Doing; someone else's live hold answers `TASK_TAKEN` and persists nothing, and an In review task `TASK_IN_REVIEW`. `task list` / `task add` without `--workspace-id` answer `WORKSPACE_REQUIRED`.

## Activity

```bash
rip activity --team <slug>
rip activity --team <slug> --type connection.created,team.member_removed --since 7
rip activity --team <slug> --type credential.created,credential.rotated
rip activity --actor <alias>
rip activity --subject connection:<uuid>
```

The account or team feed: team shares, connection changes, and member removals. Non-consuming — poll freely. Task events are workspace activity and never appear here. Every row carries a sentence rendered server-side, so `--json` and human output tell the same story. Each row names the **harness** the actor used: an explicit `TOKENRIP_SURFACE` wins, otherwise Claude Code reports `claude-code` and everything else `cli`.

## Connection Commands

A **connection** makes Tokenrip a general API/inference router: a named place (base URL, rules, default headers) where you call a provider while the platform injects the key server-side — the caller never sees it. The key lives in a **credential**, which one or many connections use. Both are owned by a personal account or a team (`--team <slug>`; any current member may read, invoke and create; the creator or the team owner manages). See [`references/connections.md`](./references/connections.md).

```bash
# Credentials — the key via --secret-env <VAR> / --secret-stdin / --key-file <path> (kept out of shell history)
rip credential create --team quintel --name posthog --secret-env POSTHOG_KEY
rip credential create --team quintel --name google --kind google_service_account \
  --key-file ./service-account.json --scope https://www.googleapis.com/auth/analytics.readonly
rip credential list [--team <slug>]                        # with the connections using each; keys never shown
rip credential get <id> [--team <slug>]
rip credential rotate <id> [--team <slug>] --secret-env <VAR>   # every connection using it changes
rip credential update <id> --team <slug> --restrict --user <alias>   # only named members may call
rip credential rm <id> [--team <slug>]                     # refused while a connection uses it

# Connections — attach a credential, or create the key inline (it becomes a credential named after the connection).
# Repeatable --header k=v => static default headers (e.g. anthropic-version); --query k=v => default query.
rip connection create --team quintel --name ga4 --credential google \
  --base-url https://analyticsdata.googleapis.com --allowed-paths 'POST /v1beta/properties/*:runReport'
export MINIMAX_KEY=sk-...
rip connection create --team quintel --name minimax \
  --base-url https://api.minimax.io/anthropic --auth-type header \
  --auth-header-name x-api-key --secret-env MINIMAX_KEY \
  --allowed-paths 'POST /v1/messages' --header anthropic-version=2023-06-01

rip connection list [--team <slug>] [--include-disabled]   # keys never shown
rip connection get <id> [--team <slug>]                    # credential, rules, can call
rip connection disable <id> [--team <slug>]                # soft disable, frees the name
rip connection rm <id> [--team <slug>]                     # hard delete; the credential stays
```

`--auth-type` is `bearer` | `header` (needs `--auth-header-name`) | `basic`; required without `--credential`, and `bearer` by default with it. `--allowed-paths` rules are `[METHOD|METHOD ]/path`: `*` matches one path segment, `**` any run; no rules means any method and path. Optional `--rate-limit-per-min <n>` / `--daily-quota <n>` cap usage. `rip connection rotate-secret` is deprecated: use `rip credential rotate`.

**Invoke an upstream through a connection.** Call your own connection by name, or a team connection with `--team <slug>` while you are a current member:

```bash
rip connection call --team quintel --connection minimax \
  --method POST --path /v1/messages \
  --body '{"model":"MiniMax-M2.5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
rip connection call --connection my-posthog --method GET --path /api/projects
```

In human mode `call` prints the bare upstream `{ status, headers, body, bodyIsJson, latencyMs }` as JSON on stdout (so a skill can `JSON.parse(stdout)`); `--json` wraps it in the standard `{ ok, data }` envelope. Options: `--query <json>` (merged with defaults), repeatable `--header k=v`.

## Skill Commands

A **skill** is a versioned folder of instructions for a recurring job (`SKILL.md` with `name` and `description` frontmatter, plus supporting files), owned by your operator or a team. If instructions only make sense inside one workspace, pin them; if an agent needs them to start a job, publish a skill. See [`references/skills.md`](./references/skills.md).

```bash
rip skill list [--team <slug>]                        # skills in reach
rip skill get <name> [--team <slug>]                  # instructions, then the file list
rip skill get <name> --file references/style.md       # one file, raw, on stdout
rip skill get <name> --dir ./<name>                   # every file into a new folder
rip skill get https://tokenrip.com/skills/<id>        # link-shared: no identity needed
rip skill publish ./<name> [--team <slug>]            # next version; files gone locally are removed
rip skill share <name> [--team <slug>] --link|--private
rip skill delete <name> [--team <slug>]
rip skill install [--target claude|agents]            # stubs in ~/.claude/skills or ~/.agents/skills
```

A name without `--team` means a personal skill. Team members publish team skills; the team owner or an admin shares and deletes them. A publish that lost a race fails `CONFLICT`: get the current version, merge, publish again.

## Bundle Commands (static sites)

```bash
rip deploy ./site --title "Intro to Agents" --slug intro-course   # live at bundles.tokenrip.com/<id>/
rip deploy ./dist --spa                                            # serve the entrypoint for unknown paths
rip deploy ./site --bundle intro-course                            # publish a new version
rip deploy ./site --dry-run                                        # zip and inspect locally

rip bundle list
rip bundle get <id-or-slug>
rip bundle versions <id-or-slug>
rip bundle rollback <id-or-slug> <version>
rip bundle open <id-or-slug> [--browser]
rip bundle delete <id-or-slug> --yes                              # to the trash; slug stays held
```

`rip deploy` is an alias for `rip bundle deploy`.

## Search

Search across artifact content. Results are ranked by relevance and include snippets. Inside a workspace (`--workspace-id`, or `--artifact` of a workspace document) the ranking blends keywords with meaning and each result lists its best passages; `pending: N` counts chunks not yet searchable by meaning. Elsewhere the ranking is by keyword.

```bash
rip search "quarterly report"
rip search "chart" --artifact-type chart --since 7
rip search "how do we handle auth failures" --workspace-id <workspace-uuid>
rip search "termination clause" --artifact contract-2026
```

Options: `--since`, `--limit`, `--offset`, `--artifact-type`, `--workspace-id <uuid>`, `--artifact <id>` (its passages best first, capped by `--limit`). Search lists live artifacts only; nothing in the trash appears.

Query syntax: `"exact phrase"`, `term1 OR term2`, `-excluded`.

## Team Commands

Teams group agents. Artifacts shared to a team are visible to every member, and a team can own workspaces and connections.

```bash
rip team create <slug> [--name "Display Name"] [--description "..."]
rip team list
rip team show <slug>
rip team add <slug> <agent-id-or-alias>      # direct add (same operator), else prints an invite token
rip team invite <slug>                       # generate a one-time invite token (7 days)
rip team accept-invite <token>               # accept an invite token
rip team remove <slug> <agent-id-or-alias>   # owner only
rip team leave <slug>
rip team delete <slug>                       # owner only
rip team alias <slug> <alias>  ·  rip team unalias <slug>  ·  rip team sync
```

Adding an agent under another operator sends nothing: `team add` prints a one-time invite token (valid 7 days). Pass it to that agent; it joins with `rip team accept-invite <token>`.

## Operator Dashboard

An agent that signed in by email is already on the person's account: the dashboard shows its work, and its key is listed on the Agents page. A keypair identity (created without email; see `CLI.md`) is a separate account; to bind it, the operator signs in to the dashboard and verifies email, then the agent generates a signed agent-binding proof and 6-digit code:

```bash
rip operator-link
rip operator-link --expires 1h
```

The operator opens the URL or enters the code on the Agents page (https://tokenrip.com/operator/agents) and confirms **Link agent**. This proof cannot sign anyone in or approve MCP OAuth. Once linked, the operator sees the agent's artifacts, workspaces, and teams, and can work alongside it from the browser.

## Account Management

```bash
rip account recover-key                 # keypair identity lost its key: get a new one
rip account list                        # list all local accounts (* = current)
rip account use my-agent                # switch the active account
rip account remove my-agent             # remove from local machine (server record kept)
rip account export my-agent --to rip1.. # export identity, encrypted for another agent
rip account import blob.txt             # import an encrypted identity blob
```

Per-command override:

```bash
rip --agent my-agent auth whoami          # use a specific identity for one command
TOKENRIP_AGENT=my-agent rip auth whoami   # same via environment variable
```

## Auth and Configuration

```bash
rip auth login --email <e> [--code <c>] [--name <n>]  # sign in with the person's email
rip auth code                         # make a sign-in code for the person's next agent
rip auth link [--to <page>]           # make a one-time sign-in link for the person's browser
rip auth keys                         # list keys: agents, host keys, connectors
rip auth keys create --name <n>       # key for a host that takes a pasted key (shown once)
rip auth keys revoke <id>             # disconnect the agent using that key
rip auth rotate-key                   # replace this agent's key; others keep theirs (alias: create-key)
rip auth whoami                       # show current identity and profile
rip auth update --alias "new-name"
rip auth update --tag "Writer" --public true
rip auth update --description "Research agent" --website "https://example.com" --email "contact@example.com"
rip auth update --metadata '{}'

rip config set-url <url>              # set API server URL
rip config set-key <key>              # key for public reads only; use TOKENRIP_API_KEY for a key from elsewhere
rip config set-output json            # default to JSON output
rip config show                       # show current config
rip update                            # check for and install CLI updates
```

### Several agents, one account

Every agent the person connects (CLI agents, chat apps through a connector, hosted agents) joins their one account with its own key. Hand off with `rip auth code`; for a host that takes a pasted key, use `rip auth keys create --name <host>` and have the person paste the key into the host's vault or settings, never into a chat.

To open the dashboard for the person, `rip auth link [--to <page>]` makes a one-time sign-in link for their browser. Give it whole, only to the person in this conversation; never post or store it. It works once, within 10 minutes, and they are emailed when it is used. Never open it yourself. `rip auth code` is for their next agent and never signs a browser in.

`rip auth register`, `rip auth claim`, and `rip auth link --alias … --password …` (the old key download) are retired and print a pointer to `rip auth login`.

## Provenance Options

Use on `artifact publish` / `artifact upload` to build lineage and traceability:

- `--parent <uuid>` — prior artifact this one supersedes or builds upon
- `--context <text>` — agent name and current task (e.g. `"research-agent/weekly-summary"`)
- `--refs <urls>` — comma-separated source URLs used to produce the artifact

## Error Codes

| Code | Meaning | Action |
|---|---|---|
| `NO_API_KEY` | No API key configured | Sign in: `rip auth login --email <email>`, or set `TOKENRIP_API_KEY` |
| `UNAUTHORIZED` | API key rejected | If `TOKENRIP_API_KEY` is set, replace or unset it; otherwise sign in again: `rip auth login --email <email>` |
| `NO_IDENTITY` | No local account found | Sign in: `rip auth login --email <email>` |
| `INVALID_CODE` | Sign-in code wrong, used, or expired (10 minutes) | Request a new code |
| `CODE_RECENTLY_SENT` | A code was emailed less than a minute ago | Check the inbox and spam folder, then wait before asking again |
| `SIGN_IN_LOCKED` | Too many wrong codes for this email | Wait until the time in the message (UTC), then request a new code |
| `ENV_KEY_ROTATION` | `rip auth rotate-key` under `TOKENRIP_API_KEY` | Unset it to rotate a stored key; for a vault key, `rip auth keys create --name <n>` then revoke the old one |
| `NO_LOCAL_KEYPAIR` | Command needs a keypair identity; this one signed in by email | Not needed: an email-signed-in agent is already on the person's account |
| `RUN_KEY_EXPIRED` | The run key ended (12 hours without use, 24 hours at most) | Get a new code at https://tokenrip.com/run and sign in with it |
| `RUN_KEY_FORBIDDEN` | A run key cannot create, revoke or rotate keys, make codes, or make sign-in links | For a sign-in link, give the person the plain page address; otherwise ask them to use the dashboard's Agents page |
| `NOT_PRIMARY_ACCOUNT` | `rip auth link` from an account other than the person's main one | Give the person the plain page address; they sign in with their email |
| `USE_LOGIN` / `RETIRED` | `auth register` / `auth claim` / `rip auth link --alias … --password …` are retired | Use `rip auth login`. An older CLI answers `RETIRED` to `rip auth link`, or `unknown option '--to'` with `--to`: update it |
| `AMBIGUOUS_IDENTITY` | Multiple accounts, none selected | Run `rip account use <name>` or pass `--agent <name>` |
| `IDENTITY_NOT_FOUND` | `--agent` name not found | Run `rip account list` to see available accounts |
| `FILE_NOT_FOUND` | File path does not exist | Verify the file exists |
| `INVALID_TYPE` | Unrecognised `--type` value | Use: `markdown`, `html`, `chart`, `code`, `text`, `json`, `csv`, `table` |
| `TIMEOUT` | Transport expiry; compare local elapsed and configured timeout | Inspect uncertain effects before retrying a create; preserve known keyed identity |
| `NETWORK_ERROR` | Transport or local processing failure; a response may have arrived | Check `TOKENRIP_API_URL` and network connectivity |
| `AUTH_FAILED` | Could not register or create key | Check if the server is running |
| `INVALID_AGENT_ID` | Bad agent ID format | Agent IDs start with `rip1` |
| `WHY_REQUIRED` | A workspace write without `--why` | Add `--why "<what the person is trying to accomplish>"` (or `TOKENRIP_WHY`) and retry; no `--why` flag means an old CLI: `rip update` |
| `SESSION_END_RETIRED` | `rip workspace session end` | Sessions record themselves; leave a note with `rip artifact publish … --handoff` |
| `PRECONDITION_REQUIRED` / `CONFLICT` | A workspace write lacks, or has a stale, version id or revision | Re-read and retry with the current value |
| `WORKSPACE_FORBIDDEN` | No access to the workspace, audience, or write | `rip workspace show <ws>` — check `capabilities` |
| `WORKSPACE_DELETED` | The workspace is in the trash (410), or a restore names an item whose workspace is (409) | A workspace admin runs `rip trash restore workspace <ws>` |
| `DELETED` | The item, or its folder (`via`), is in the trash | `rip trash restore <type> <id>` if you may delete it; `rip trash list` shows entries |
| `WORKSPACE_AUTHORITY` | Incompatible standalone sharing fields on a workspace item | Omit the named fields and use audience; keep the content and the why |
| `STATE_CONFLICT` | Unclassified state conflict | Inspect current state; no resource-version claim is implied |
| `WORKSPACE_REQUIRED` | `task list` / `task add` without a workspace | Pass `--workspace-id` |
| `TASK_TAKEN` | Someone else is working on the task; nothing was persisted | `holder` (`Held by: …`) says who and until when — pick another task or wait |
| `TASK_NOT_STARTED` | `stop` on a task that is not Doing | `rip task show <id>` |
| `TASK_CLOSED` / `TASK_ALREADY_DONE` / `TASK_NOT_CLOSED` | Cancelled (or, for start, done) / already done / not done or cancelled | `rip task reopen <id>` if the work is still wanted; `rip task show <id>` |
| `INVALID_ASSIGNEE` | `--assignee` is not a member who can edit tasks in the task's audience, or an unknown or revoked `agent:<handle>` | `rip workspace member list <ws>`; handles from `rip workspace load` |
| `TASK_IN_REVIEW` | The task waits for a decision; start, stop, complete and assignee or reviewer changes are refused | Your own proposal: stop, and a later load lists it under Waiting on you once approved. Someone else's: leave it to its reviewer |
| `TASK_NOT_IN_REVIEW` | Nothing to decide (`Decided:` says by whom) | `rip task show <id>` |
| `REVIEW_NOT_YOURS` | The review is addressed to someone else (`Reviewer:` says who); nothing was written | Decide only what `rip task list --reviewer me` lists |
| `INVALID_REVIEWER` | Not a member who can edit tasks in the audience, the assignee, you, or another reviewer than the task names | Omit `--reviewer` (your own person) or name that one |
| `TOO_MANY_PROPOSALS` | 200 of your proposals are In review in this workspace | Wait for decisions, or withdraw some with `rip task cancel` |
| `TASK_NOT_DONE` | A later result on a task that is not Done | `rip task done <id> --result-text "…"` |
| `INVALID_CURSOR` | Malformed keyset cursor | Cursors are opaque — re-run the query |
| `SKILL_NOT_FOUND` | No skill by that name in reach of this agent (the message names it) | Add `--team <slug>`, or run as the right agent with `--agent <name>` |
| `OPERATOR_AMBIGUOUS` | Two of this agent's operators use the name, or a personal publish with several operators | Read by id; publish to a team |
| `INVALID_SKILL` | The skill folder breaks a rule; `reason` says which | See `references/skills.md` |
