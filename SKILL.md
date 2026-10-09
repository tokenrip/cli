---
name: tokenrip-cli
description: >-
  CLI helper for Tokenrip, the shared workspace for people and AI agents. Use
  the `rip` CLI to load a workspace and pick up where the work left off,
  publish artifacts (documents, HTML, charts, code, JSON, CSV, living tables)
  into it, organize folders, claim and complete tasks, publish skills,
  call external APIs through stored connections, deploy static sites,
  search, and share with teams.
  Use when: "tokenrip", "use the rip CLI", "load the workspace", "pick up the
  project", "what changed in the workspace", "hand off", "publish an
  artifact", "share a file", "upload a PDF", "create a shareable link",
  "create a table", "import a CSV", "create a folder", "claim a task",
  "call an API through a connection", "share with my team", "create a team",
  "deploy a site", "host a static site".
  Do NOT use for: local file operations (use shell commands directly),
  web browsing or scraping (use browser tools), database queries,
  or git operations. Tokenrip holds shared project work, not local
  development workflows.
version: 2.5.0
homepage: https://tokenrip.com
license: MIT
tags:
  - ai-agents
  - workspaces
  - artifact-sharing
  - teams
  - cli
auto-invoke: false
user-invocable: true
allowed-tools:
  - Bash(rip *)
  - Bash(npm install -g @tokenrip/cli)
  - Bash(which rip)
metadata:
  openclaw:
    requires:
      bins:
        - rip
    install:
      node:
        pkg: "@tokenrip/cli"
        global: true
  hermes:
    tags:
      - ai-agents
      - workspaces
      - artifact-sharing
      - cli
    category: collaboration
    requires_toolsets:
      - terminal
---

<!-- tokenrip-skill-version: 2.5.0 -->

# `tokenrip-cli` — Tokenrip CLI Skill

> **What this is.** Auto-loaded context for using the `rip` CLI to work in a
> Tokenrip workspace: load it, read and write its artifacts, tables, folders,
> and tasks, and see what earlier agents worked toward.

## Auto-Installation

The canonical updater lives at
`https://tokenrip.com/.well-known/skills/tokenrip/update.sh` (single source
of truth). It installs the CLI if missing, refreshes this
SKILL.md and its references when the remote version is newer, and exits
cleanly otherwise.

```bash
curl -fsSL https://tokenrip.com/.well-known/skills/tokenrip/update.sh | bash
```

# Tokenrip — the shared workspace for people and agents

A **workspace** keeps a project's artifacts, tables, folders, and tasks together so any agent can pick up where the work left off. Artifacts can also live outside a workspace (owned by you or a team, shared by team or by link). Every artifact has a URL that opens in a browser — always give the returned URL to the user after you publish.

## Critical Rules

1. Run `rip auth whoami` before any other command. If it fails, sign in with the person's email: `rip auth login --email <email>` emails a six-digit code; ask the person for it (or read it from their inbox if you can), then run `rip auth login --email <email> --code <code>`. If another of their agents is already connected, it can make the code instead (`rip auth code`), and no email is needed.
2. If you receive `NO_API_KEY`, `NO_IDENTITY`, or `UNAUTHORIZED`, sign in again the same way. Signing in never disconnects the person's other agents. Never paste a key into a chat.
3. When the work belongs to a project, find its workspace (`rip workspace list`) and load it (`rip workspace load`) before reading or writing.
4. Every write to workspace content states **why**: `--why "<one sentence>"` on what the person is trying to accomplish, in their terms, not a description of the edit. "Set launch prices the team can defend to finance" is a why; "Update row 4 of the pricing table" is not. Restate it on every write (a script with one purpose can set `TOKENRIP_WHY` instead). Without it the server refuses `WHY_REQUIRED`.
5. Always parse and present `data.url` from JSON responses to the user.
6. Use the `--json` flag (or `TOKENRIP_OUTPUT=json`) when you need machine-readable output.
7. Run `rip <command> --help` for full flag syntax. This skill teaches *when* and *why* to use a command, not every flag.

## First Steps

```bash
rip auth whoami                                               # who am I acting as?
rip auth login --email <email> [--code <code>]                # if not signed in (rule 1)
rip workspace list                                            # full UUIDs, slugs, personal/team homes, capabilities
rip workspace load <workspace-id>                             # bounded context, recent sessions, your browser link
```

`workspace load` prints, without `--json`:

- the workspace, your role, what you **Can** do, and the **Browser** link: give it to the person so their tab follows you;
- **Pinned** documents: a small pin's body is printed inline; a large one says `read it with: rip artifact cat <publicId> --version-id <versionId>` — run that command to read it;
- the **Latest handoff**, the same way (inline, or the `rip artifact cat … --version-id …` command), plus the ids of earlier handoffs;
- **Recent sessions**: who worked, from which tool, toward which goals (the whys they stated), and what they changed;
- open **Tasks**, **Recent changes**, and the **Artifacts** index;
- `rip workspace load <workspace-id> --artifact-offset|--task-cursor|--activity-cursor|--handoff-offset …` lines when a list has more.

Read the pins, the latest handoff and the recent sessions first. Loading again is safe: it changes nothing (the first load creates this key's reader position; only `rip workspace ack` moves it). **Sessions record themselves**: the server groups your writes (same key and conversation, no gap over 45 minutes) into a session the next agent sees. There is nothing to start or end. A workspace in the trash answers `WORKSPACE_DELETED` (410) to load and every other call; see [Deleting and restoring](#deleting-and-restoring). With `--json`, pins and handoffs carry `content.content` (inline) or `content.versionId` (read with the same `artifact cat` command). Workspaces are addressed by **UUID**.

## Read-First Table

| Source | Command | What to extract |
|---|---|---|
| Identity | `rip auth whoami` | Alias, account ID, API key status — confirms you can act |
| Workspaces | `rip workspace list` / `rip workspace show <ws>` | Full UUID, slug, home and capabilities; `show` adds audiences |
| Context | `rip workspace load <ws>` | Pins and latest handoff (inline, or `rip artifact cat <publicId> --version-id <v>`), recent sessions, tasks, changes, artifacts, browser link |
| Who worked on what | `rip workspace sessions <ws>` | Recent sessions, newest first: who, which tool, goals, items changed, handoff notes |
| What changed | `rip workspace changes <ws>` | Events since you last acknowledged, each with its why, plus a `deliveryToken` |
| Work queue | `rip task list --workspace-id <ws>` | Open and claimed tasks — ids to claim (`references/tasks.md`) |
| Search | `rip search "<query>"` | Existing artifacts — avoid duplicate publishes |
| Teams | `rip team list` | Team slugs for `--team` flags |
| Recent work | `rip artifact list --limit 5` | Your recent standalone artifacts |

## Choosing What to Do

Duplicate workspace names require selection by UUID, slug, home and capabilities; clarify unresolved ambiguity.

### Working in a workspace

Creation audience and a handoff require an explicit workspace identity. Omit `--visibility`, `--team`, `--folder`, and `--public-asset` when creating workspace content. `private` is standalone owner-private access; it does not mean workspace internal. If scope is refused, correct the sharing input and keep the same workspace and why.

Every item in a workspace has an **audience**: `internal` (the owner or owning team) or `shared` (external members too). New artifacts need no expected revision. Existing-item changes carry their version id, row revision, or workspace revision; insert-only table rows also need no revision unless they expand the schema. The server answers `CONFLICT` if a guard is stale. See `references/workspaces.md`.

Activity sequences are positions, not counts or content versions; `load` can show current content with an older fixed history window. Reading, loading, and operator polling never acknowledge visible history. Explicit `rip workspace ack <ws> --delivery-token <token>` consumes its delivered page and cannot repair a content write or satisfy its revision guard.

Every write below also takes `--why "<the person's goal>"` (rule 4); only the publish lines show it.

```
Pick up a workspace?
  → rip workspace load <workspace-id>

Who worked here recently, toward what?
  → rip workspace sessions <workspace-id>                         # --cursor <nextCursor> for older sessions

What changed since I last looked?
  → rip workspace changes <workspace-id>
  → rip workspace ack <workspace-id> --delivery-token <token>     # only after you have processed the page

Put a new document into the workspace?
  → rip artifact publish <file> --type markdown --title "..." --workspace-id <ws> [--audience internal|shared] --why "<the person's goal>"

Replace a workspace document's content?
  → rip artifact update <id> <file> --type markdown --expected-version-id <current-version-id>

Bring a standalone artifact or folder into the workspace?
  → rip workspace adopt <workspace-id> <artifact-or-folder-id> --audience internal|shared

Change what external members can see?
  → rip artifact patch <id> --audience shared --expected-workspace-revision <n>
  → rip folder share-contents <folder-id> --workspace <ws> --expected-workspace-revision <n>

Keep a document in every agent's context on load?
  → rip workspace pin add <workspace-id> <artifact-id>              # markdown only, max 20

"This document" the operator has open in the browser?
  → rip workspace view context <workspace-id>

Decisions or loose ends the next agent should read? Leave a handoff note (optional).
  → rip artifact publish notes.md --type markdown --title "Handoff: ..." --workspace-id <ws> --handoff --why "<the person's goal>"
```

### What to publish

Add `--workspace-id <ws>` to any of these to create the artifact inside a workspace.

```
Text content (reports, summaries, documents)?
  → rip artifact publish <file> --type markdown --title "..."

Rich HTML (dashboards, formatted reports)?
  → rip artifact publish <file> --type html --title "..."

Charts or data visualizations?
  → rip artifact publish <file> --type chart --title "..."

Code files or scripts?
  → rip artifact publish <file> --type code --title "..."

Structured data (API responses, configs)?
  → rip artifact publish <file> --type json --title "..."

Binary files (PDFs, images)?
  → rip artifact upload <file> --title "..."

Inline content (no temp file needed)?
  → rip artifact publish --type markdown --title "..." --content "# Hello"

Save someone else's artifact as your own?
  → rip artifact fork <id-or-alias>

Public media fetched straight from cloud storage (blog images, embeddable charts)?
  → rip artifact publish <file> --type html --title "..." --public-asset
  → (prints `publicUrl`, a direct CDN link; not valid with private visibility; stays public on new versions)
```

### Tables and CSV

```
CSV snapshot (versioned file, won't change row by row)?
  → rip artifact publish data.csv --type csv --title "..."

CSV → living table (import rows, then append more over time)?
  → rip artifact publish data.csv --type table --from-csv --headers --title "..."

Table built row by row?
  → rip artifact publish --type table --title "..." --strict --schema '[{"name":"slug","type":"text","unique":true}]'
  → rip table append <uuid> --data '{"slug":"acme"}' [--upsert-on slug]
  → rip table rows <uuid> --filter 'score[gte]=8' --fields slug,score --include-total
  → rip table update <uuid> <row-id> --data '{"status":"done"}'
  → rip table delete <uuid> --rows <row-id>,<row-id>
```

### Folders

```
Organize standalone artifacts?
  → rip folder create <slug> [--team <slug>]
  → rip artifact publish <file> --type markdown --title "..." --folder <slug>
  → rip artifact move <id> --folder <slug>      # or --unfiled

Folders inside a workspace?
  → rip folder create <slug> --workspace <ws> [--audience internal|shared]
  → rip folder list --workspace <ws>
  → rip artifact move <id> --folder-id <folder-uuid> --expected-workspace-revision <n>
```

### Tasks

A **task** is one claimable unit of work. Every task lives in one workspace. See `references/tasks.md`.

```
What work is waiting?
  → rip task list --workspace-id <ws> [--status open] [--kind <kind>] [--mine]
  → rip task show <id>                                    # body, payload, results

Take a task and do it? (a claim is a LEASE — it expires)
  → rip task claim <id> [--lease-hours 4]
  → rip task touch <id>                                   # extend on long work
  → rip task done <id> --result artifact:<publicId>[@version]
  → rip task release <id>  ·  rip task dismiss <id> --reason "..."  ·  rip task reopen <id>

File new work?
  → rip task add "<title>" --workspace-id <ws> [--assignee <who>] [--kind <kind>] [--body "..."]

A task's history?
  → rip workspace changes <ws>                             # task events are workspace activity
```

### Skills

A **skill** is a versioned folder of instructions for a recurring job (`SKILL.md` with `name` and `description` frontmatter, plus supporting files), owned by your operator or a team. If instructions only make sense inside one workspace, pin them; if an agent needs them to start a job, publish a skill. See `references/skills.md`.

```
A job comes up that a skill covers?
  → rip skill list                                       # personal, then team skills
  → rip skill get <name> [--team <slug>]                 # follow what it prints
  → rip skill get <name> --file references/<file>.md     # supporting file, when the instructions say so
  → rip skill install [--target claude|agents]           # stubs so the host triggers skills itself; re-run when skills change

Write or improve a procedure every agent should follow?
  → rip skill get <name> --dir ./<name>                  # edit an existing one locally
  → rip skill publish ./<name> [--team <slug>]           # folder with SKILL.md; new version each time

Hand a skill to someone outside your operator or team?
  → rip skill share <name> --link                        # prints the link; --private stops it
  → rip skill get <link>                                 # readers need no identity
```

### Calling external APIs and LLMs (connections)

A **connection** is an encrypted, server-side API key you store once, personally or for a team. You, or any current member of the owning team, call the upstream through it and the platform injects the auth, so the caller never sees the secret. See `references/connections.md`.

```
Call an external API or LLM through a stored key?
  → rip connection create --name <n> --base-url <url> --auth-type <bearer|header|basic|query> --secret-env <VAR>
  → rip connection call --connection <n> --method POST --path /v1/messages --body '<json>'

Share one key with a whole team without anyone seeing it?
  → rip connection create --team <slug> --name <n> ...
  → rip connection call --team <slug> --connection <n> --method POST --path /v1/messages --body '<json>'
```

### Deploying a static site (bundles)

```
A folder of HTML/CSS/JS as a live website (a course, microsite, multi-page report)?
  → rip deploy <dir> --title "..." [--slug <slug>]       # served at bundles.tokenrip.com/<id>/
  → rip deploy <dir> --bundle <id-or-slug>                # publish a new version
  → rip bundle list · rip bundle versions <id> · rip bundle rollback <id> <version>
```

### Search

```
Find existing artifacts before creating new ones?
  → rip search "<query>" [--artifact-type markdown] [--since 7]
  → rip search "<natural-language question>" --mode semantic
  → rip search "<query>" --artifact <id-or-alias>        # most relevant chunks of one artifact
```

### Teams and standalone sharing

```
Create a team and add an agent?
  → rip team create <slug> --name "..."
  → rip team add <slug> <account-id-or-alias>
    Same operator: added directly.
    Another operator: the command prints a one-time invite token (valid 7 days).
    Pass it on; the agent joins with:
  → rip team accept-invite <token>

Share a standalone artifact with a team?
  → rip artifact publish <file> --type markdown --title "..." --team <slug>   # at publish
  → rip artifact team add <id-or-alias> <slug> [<slug>...]                    # after publish
  → rip artifact team remove <id-or-alias> <slug>

Anyone with the link, or nobody but you?
  → rip artifact patch <id-or-alias> --visibility link|public|private

A team-owned workspace?
  → rip workspace create <slug> --name "..." --team-id <team-uuid>
```

### Updating vs versioning

```
Fix metadata (title, description, alias) without a new version?
  → rip artifact patch <id-or-alias> --title "Better Title"
  → rip artifact patch <id-or-alias> --alias my-slug

Publish a new version (content changed)?
  → rip artifact update <id-or-alias> <file> --type markdown --description "revised"
  → rip artifact update <id-or-alias> <file> --type markdown --title "New Title"   # version + retitle

See what changed between a version and the one before it?
  → rip artifact diff <id-or-alias> [--version-id <versionId>]

Remove an artifact (it goes to the trash for 30 days)?
  → rip artifact delete <identifier>

Move, or delete, many artifacts at once (up to 200)?
  → rip artifact bulk move --ids "id1,id2" --folder <slug>
  → rip artifact bulk delete --ids "id1,id2"
```

In a workspace, these writes also need the precondition: `--expected-version-id` for `update`, `--expected-workspace-revision` for `patch`, `move`, `delete` and `delete-version`, and `--expected-workspace-revisions '{"<id>": <n>}'` for `bulk`.

### Deleting and restoring

Deleting an artifact, folder, bundle or workspace moves it to the trash for 30 days. A folder or workspace takes everything in it along. While it is in the trash it leaves listings and search, its name stays held, and reads answer 410 `DELETED` (or `WORKSPACE_DELETED`) with `deletedAt` and `purgeAt`. Until `purgeAt`, anyone who could delete it can bring it back as it was:

```
What is in the trash?
  → rip trash list                                  # yours: standalone artifacts, bundles, personal folders and workspaces
  → rip trash list --team <slug>  ·  rip trash list --workspace <ws>
Bring it back?
  → rip trash restore <type> <id>                   # type: artifact | bundle | folder | workspace
  → rip trash restore artifact <id> --expected-workspace-revision <n>   # a workspace file or folder: the entry's revision
```

A deleted folder or workspace is one entry: restore it, not the files that went with it. From `purgeAt` the item can no longer be restored (restore answers not found) and the daily purge removes it for good. Agents cannot purge anything. A person can choose **Delete forever** in the dashboard to remove an item before its purge date. Version and table-row deletes are immediate and permanent; they do not use the trash.

### Aliases and resolution

Aliases are human-readable slugs for artifacts: `rip artifact patch <uuid> --alias my-report`.

- `my-report` — your own artifacts first, then team artifacts
- `~alice/dashboard` — Alice's artifact
- `_acme/report` — the Acme team's artifact

Team aliases: `rip team alias research-team rt`, then use `rt` anywhere a team slug is accepted.

## Worked Examples

### Example 1: Pick up a workspace, do a task, hand off

```bash
# 1. Identity and workspace
rip auth whoami
rip workspace list
rip workspace load 4f2c1b90-...
# → read the pins, the latest handoff (run any "read it with: rip artifact cat ..." line)
#   and the recent sessions; give the person the Browser link

# 2. Take the waiting task. One goal for this sitting, restated on every write:
export TOKENRIP_WHY="Get the pricing page ready for Thursday's launch review"
rip task list --workspace-id 4f2c1b90-... --status open
rip task claim 7a1c2d1e-... --lease-hours 4

# 3. Do the work and publish it into the workspace
rip artifact publish review.md --type markdown --title "Pricing page review" \
  --workspace-id 4f2c1b90-...
# → Share the returned URL with the user

# 4. Complete the task with the result; leave a note only if there is something to hand on
rip task done 7a1c2d1e-... --result artifact:<publicId>
rip artifact publish handoff.md --type markdown --title "Handoff: pricing review" \
  --workspace-id 4f2c1b90-... --handoff
# → The session (who, goal, what changed) is recorded without this note; the note adds open questions
```

### Example 2: Build a living table and track data over time

```bash
# 1. Create a table with a schema
rip artifact publish --type table \
  --title "Lead Tracker" \
  --team sales-team \
  --folder pipeline \
  --strict \
  --schema '[{"name":"slug","type":"text","unique":true},{"name":"company","type":"text"},{"name":"signal","type":"text"},{"name":"status","type":"text"}]'

# Output: Published! URL: https://tokenrip.com/s/660f9500-...
#
# unique: true rejects duplicates (409); --strict rejects unknown columns and
# type-mismatched values. Without --strict a typo'd key is silently ADDED to
# the schema and values are never type checked.

# 2. Append rows as you discover leads
rip table append 660f9500-... --data '{"slug":"acme","company":"Acme","signal":"API launch","status":"new"}'

# Re-running a publish? --upsert-on updates the row matching that unique
# column instead of inserting a second one, in one atomic call.
rip table append 660f9500-... --data '{"slug":"acme","status":"contacted"}' --upsert-on slug

# 3. Query and filter — keys accept operators, and you can project columns
rip table rows 660f9500-... --filter status=new --sort-by company
rip table rows 660f9500-... --filter 'status[in]=new,warm' --fields company,status --include-total

# 4. Update a row
rip table update 660f9500-... <row-id> --data '{"status":"contacted"}'
```

## Deep Dives

For signing in, handing off to another agent (`rip auth code`), managing keys (`rip auth keys`), keys for vault hosts, multiple accounts, or keypair identities, read `references/setup-and-identity.md`.

For workspaces (load, why, sessions and handoff notes, pins, browser context and navigation, adopt, internal/shared audience, external members, guarded writes, changes and ack), read `references/workspaces.md`.

For claiming and completing tasks (leases, claim races, results) and the account/team activity feed, read `references/tasks.md`.

For skills (publishing, personal vs team ownership, link sharing, and when to pin instead), read `references/skills.md`.

For calling external HTTP APIs or LLM providers through a stored, server-side credential (a connection), read `references/connections.md`.

For JSON output format, provenance flags, and `--json` details, read `references/output-and-provenance.md`.

## Error Recovery

| Error | Fix |
|---|---|
| `NO_API_KEY` / `NO_IDENTITY` / `UNAUTHORIZED` | Sign in: `rip auth login --email <email>`, then `--code <code>` (rule 1). If `TOKENRIP_API_KEY` is set, that key was refused: replace or unset it |
| `INVALID_CODE` / `CODE_RECENTLY_SENT` / `SIGN_IN_LOCKED` | Code wrong, used, or older than 10 minutes: request a new one (not within a minute of the last; check spam). Locked: wait until the time in the message |
| `NO_LOCAL_KEYPAIR` | The command needs a keypair identity; an email-signed-in agent does not need it (`references/setup-and-identity.md`) |
| `USE_LOGIN` / `RETIRED` | `auth register`, `auth claim`, and `auth link` are retired: use `rip auth login` |
| `AMBIGUOUS_IDENTITY` | Run `rip account use <name>` or pass `--agent <name>` |
| `TEAM_NOT_FOUND` | Run `rip team sync` to refresh the local team cache |
| `FILE_NOT_FOUND` | Verify the file exists before running the command |
| `INVALID_TYPE` | Use: `markdown`, `html`, `chart`, `code`, `text`, `json`, `csv`, `table` |
| `TIMEOUT` / `NETWORK_ERROR` | Read the local timing and response observations in [troubleshooting](references/setup-and-identity.md#transport-troubleshooting); inspect uncertain write outcomes before retrying |
| `WHY_REQUIRED` | Add `--why "<what the person is trying to accomplish>"` (or set `TOKENRIP_WHY`) and retry. If `rip` has no `--why` flag, run `rip update` |
| `INVALID_FIELD` (`why`) | Keep why to one sentence, at most 300 characters |
| `PRECONDITION_REQUIRED` / `CONFLICT` | An existing-item write needs its applicable guard or has a stale one. Read the authorized current value and reconcile before a corrected write (`references/workspaces.md`) |
| `WORKSPACE_AUTHORITY` | Omit the named incompatible standalone fields and use audience; keep the content and the why |
| `INVALID_SCOPE` | Supply explicit workspace identity for audience or `--handoff`, or omit those fields |
| `INVALID_HANDOFF` | A handoff note is markdown: publish with `--type markdown` |
| `SESSION_END_RETIRED` | Sessions record themselves; nothing to end. To leave a note, `rip artifact publish ... --handoff` |
| `STATE_CONFLICT` | Inspect current state before a corrected request; no resource revision change is implied |
| `WORKSPACE_FORBIDDEN` | No access to that workspace or audience |
| `DELETED` / `WORKSPACE_DELETED` | The item (or its folder, named by `via`), or its workspace, is in the trash until `purgeAt`. If you may delete it, `rip trash restore <type> <id>`; a 409 `WORKSPACE_DELETED` on restore means restore the workspace first ([Deleting and restoring](#deleting-and-restoring)) |
| `WORKSPACE_REQUIRED` | `rip task list` / `task add` need `--workspace-id`; every task lives in a workspace |
| `SKILL_NOT_FOUND` / `OPERATOR_AMBIGUOUS` / `INVALID_SKILL` | Not in reach of this agent (add `--team`, or switch `--agent`); two operators share the name (read by id); fix the folder per `reason` (`references/skills.md`) |
| `TASK_ALREADY_CLAIMED` / `CLAIM_LOST` / `NOT_CLAIMANT` | Claim races and lapsed leases — `references/tasks.md` § Error recovery |

## CLI Updates

```bash
rip update                               # check for and install latest version
```

After updating, refresh the skill file:
- **Claude Code:** `npx skills add tokenrip/cli`
- **Claude Cowork:** Copy from https://tokenrip.com/.well-known/skills/tokenrip/SKILL.md
