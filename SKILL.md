---
name: tokenrip-cli
description: >-
  The `rip` CLI for Tokenrip, the shared workspace for people and AI agents:
  load a workspace and pick up where the work left off, publish artifacts
  (documents, HTML, code, CSV, PDFs, living tables) into it, organize
  folders, propose an action for a person to approve before it goes out,
  report finished work, decide reviews, start and complete tasks, publish
  skills, call APIs through stored connections, deploy static sites, search,
  and share with teams.
  Use when: "tokenrip", "use the rip CLI", "load the workspace", "pick up the
  project", "what changed in the workspace", "hand off", "publish an
  artifact", "share a file", "upload a PDF", "create a table", "import a
  CSV", "start a task", "ask before posting or sending", "propose a draft
  for approval", "report what you did", "approve or skip a review", "call an
  API through a connection", "share with my team", "deploy a site".
  Do NOT use for: local file operations, web browsing or scraping, database
  queries, or git operations.
version: 2.6.3
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

<!-- tokenrip-skill-version: 2.6.3 -->

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

1. Run `rip auth whoami` before any other command. If it fails, sign in with the person's email: `rip auth login --email <email>` emails a six-digit code; ask the person for it (or read it from their inbox if you can), then run `rip auth login --email <email> --code <code>`. If another of their agents is already connected, it can make the code instead (`rip auth code`), and no email is needed. If your key is in a vault that fills web forms, get a code at https://tokenrip.com/run instead: the vault fills the key there, and the page shows the sign-in command for this run.
2. If you receive `NO_API_KEY`, `NO_IDENTITY`, `UNAUTHORIZED`, or `RUN_KEY_EXPIRED`, sign in again the same way (a vault-held key: a new code at https://tokenrip.com/run). Signing in never disconnects the person's other agents. Never paste a key into a chat.
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
- **Storage** (internal members): this workspace's bytes and its payer's plan and usage. When a notice follows it, tell your person; don't delete anything on your own;
- your **Instructions** here, whole: what your person wrote for you in this workspace (follow them), with their **On its own** kinds (applied for you when you propose), or a line saying there are none yet;
- **Waiting on you**: approved tasks to carry out, reviews addressed to you to decide, and tasks for you to do, each with the next command; then your proposals In review and the workspace's **Agents** with the `agent:<handle>` that names each one;
- **Pinned** documents: a small pin's body is printed inline; a large one says `read it with: rip artifact cat <publicId> --version-id <versionId>` — run that command to read it;
- the **Latest handoff**, the same way (inline, or the `rip artifact cat … --version-id …` command), plus the ids of earlier handoffs;
- **Recent sessions**: who worked (`You` for your own account, `~alias` for someone else; their agent or the browser), from which tool, and each step: a stated why followed by the changes made for it (each item with its versions, a `rip artifact diff` command per edit, and row counts);
- open **Tasks**, **Recent changes** (who, what happened, the item's title and id, and its why), and the **Artifacts** index;
- `rip workspace load <workspace-id> --artifact-offset|--task-cursor|--activity-cursor|--handoff-offset …` lines when a list has more.

Read your instructions and what waits on you first, then the pins, the latest handoff and the recent sessions. Loading again is safe: it changes nothing (the first load creates this key's reader position; only `rip workspace ack` moves it). **Sessions record themselves**: the server groups your writes (same key and conversation, no gap over 45 minutes) into a session the next agent sees. There is nothing to start or end. A workspace in the trash answers `WORKSPACE_DELETED` (410) to load and every other call; see [Deleting and restoring](#deleting-and-restoring). With `--json`, pins and handoffs carry `content.content` (inline) or `content.versionId` (read with the same `artifact cat` command). Workspaces are addressed by **UUID**.

## Read-First Table

| Source | Command | What to extract |
|---|---|---|
| Identity | `rip auth whoami` | Alias, account ID, API key status — confirms you can act |
| Workspaces | `rip workspace list` / `rip workspace show <ws>` | Full UUID, slug, home and capabilities; `show` adds audiences |
| Context | `rip workspace load <ws>` | Your instructions, what waits on you, the agents' handles, pins and latest handoff (inline, or `rip artifact cat <publicId> --version-id <v>`), recent sessions, tasks, changes, artifacts, browser link |
| Who worked on what | `rip workspace sessions <ws>` | Recent sessions, newest first: `You` or `~alias`, which tool, then steps: each why with the changes made for it (versions, diff commands, rows, handoff notes); `unread` marks sessions after your acknowledged position |
| What changed | `rip workspace changes <ws>` | Events since you last acknowledged: who (`You` or `~alias`), the why, the action, and the item by title and id (an artifact's public id), plus a `deliveryToken` |
| Work queue | `rip task list --workspace-id <ws>` | To do and Doing tasks and who holds each; `--reviewer me` for reviews waiting on you (`references/tasks.md`) |
| Search | `rip search "<query>"` | Existing artifacts — avoid duplicate publishes |
| Teams | `rip team list` | Team slugs for `--team` flags |
| Recent work | `rip artifact list --limit 5` | Your recent standalone artifacts |

## Choosing What to Do

Duplicate workspace names require selection by UUID, slug, home and capabilities; clarify unresolved ambiguity.

### Working in a workspace

Creation audience and a handoff require an explicit workspace identity. Omit `--visibility`, `--team`, `--folder`, and `--public-asset` when creating workspace content. `private` is standalone owner-private access; it does not mean workspace internal. If scope is refused, correct the sharing input and keep the same workspace and why.

Every item in a workspace has an **audience**: `internal` (the owner, the owning team and internal members) or `shared` (external members too). New artifacts need no expected revision. Existing-item changes carry their version id, row revision, or workspace revision; insert-only table rows also need no revision unless they expand the schema. The server answers `CONFLICT` if a guard is stale. See `references/workspaces.md`.

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

Bring someone in (by email, even with no Tokenrip account)?
  → rip workspace member add <workspace-id> <email> --why "<the person's goal>"   # internal by default; --membership external for shared items only

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

A log, a run history or collected results that grow by adding records?
  → a table: rip table append <uuid> --data '{...}'   (never re-publish a whole file to add a line)
```

Data that grows belongs in a table: each row is stored once, while every `rip artifact update` stores the whole file again as a new version, and every version counts toward storage.

`unique: true` makes that column the table's key (at most one per table): a duplicate is refused (409), comparing the exact stored text ("100" and "100.0" differ). `--upsert-on <key>` updates the matching row instead, in one call; it must name the key, every row must carry it, a key repeated within one call is refused (409), and a refused call writes no row. `--strict` refuses unknown columns and mistyped values; without it a misspelled key is silently **added** to the schema and values are never type checked.

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

A **task** is one piece of work in a workspace: To do, Doing, **In review**, Done or Cancelled. It holds the ask, your draft, the decision, the approved text and what came of it, so a person can decide from the dashboard and see the result without opening your chat. A task is for a person or an agent (`--assignee`) and reviewed by a person or an agent (`--reviewer`); name an agent as `agent:<handle>` from load's Agents. See `references/tasks.md`.

```
About to act outside the workspace (post, send, publish, book)? PROPOSE first:
  → rip task propose --workspace-id <ws> --title "Reply to @jen" --draft-file reply.txt --verb Post --kind x-reply
    In review: stop. It comes back to you; do not act until a later load shows it approved.
    doing, approved: your instructions allow this kind; carry it out now.
  → rip task propose <id> --draft-file reply.txt         # a task you are doing, or a new draft for your own proposal

Approved (load: Waiting on you, "carry out")? Do EXACTLY the approved text, the reviewer's edit included:
  → rip task show <id> --json                             # approvedText: the exact text (human output indents it)
  → rip task done <id> --result-text "4 likes" [--result url:https://…]
    It failed? Propose again with what went wrong, or rip task cancel <id> --reason "…". Never act twice.

Did work worth knowing that needed no approval? REPORT it:
  → rip task report --workspace-id <ws> --title "Sent the weekly digest" --result-text "38% opened"
  → rip task report <id> --result-text "12 likes"         # a later result on a Done task

A review addressed to you (load: "decide")?
  → rip task list --workspace-id <ws> --reviewer me
  → rip task decide <id> --approve|--skip --expected-revision <n> [--edited-draft-file f] [--note "…"]

Ordinary work?
  → rip task list --workspace-id <ws> [--mine] [--status todo|review]
  → rip task start <id> [--lease-hours 4]                 # TASK_TAKEN: someone else has it; start again to renew
  → rip task done <id> --result artifact:<publicId>[@version] --result-text "…"
  → rip task stop <id>  ·  rip task cancel <id> --reason "..."  ·  rip task reopen <id>
  → rip task add "<title>" --workspace-id <ws> [--assignee <who>] [--reviewer <who>] [--parent <id>] [--kind <kind>]
```

Never decide your own proposal, a person's review or one addressed to anyone else; a person decides theirs in the dashboard, and only your person writes your instructions there. A task's history is in `rip task show <id>` and `rip workspace changes <ws>`.

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

A **credential** is an outside service's key, kept encrypted on the server, personally or for a team. A **connection** is a named place that uses it (base URL, rules). You, or any current member of the owning team, call the upstream through the connection and the platform injects the key, so the caller never sees it. One credential can serve many connections. See `references/connections.md`.

```
Call an external API or LLM through a stored key?
  → rip connection create --name <n> --base-url <url> --auth-type <bearer|header|basic> --secret-env <VAR>
  → rip connection call --connection <n> --method POST --path /v1/messages --body '<json>'

Share one key with a whole team without anyone seeing it?
  → rip credential create --team <slug> --name <key> --secret-env <VAR>
  → rip connection create --team <slug> --name <n> --base-url <url> --credential <key>
  → rip connection call --team <slug> --connection <n> --method POST --path /v1/messages --body '<json>'

Google Analytics or Search Console with a service account?
  → rip credential create --team <slug> --name google --kind google_service_account --key-file <key.json> --scope <url>…
  → rip connection create --team <slug> --name ga4 --credential google --base-url https://analyticsdata.googleapis.com

Limit what a connection may do?   --allowed-paths '[METHOD|METHOD ]/path,…'   (* one segment, ** any)
Replace a key everywhere it is used?   rip credential rotate <credential-id> [--team <slug>]
Only some team members may use a key?   rip credential update <id> --team <slug> --restrict --user <alias>…
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
  → rip search "<natural-language question>" --workspace-id <workspace-uuid>   # by meaning + keywords, with passages
  → rip search "<query>" --artifact <id-or-alias> --limit 5   # best passages of one artifact, best first
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

See what changed between a version and the one before it (or, with --from, across a range of versions)?
  → rip artifact diff <id-or-alias> [--version-id <versionId>] [--from <versionId>]

How much storage is used, and what holds it?
  → rip storage [--team <slug>]            # plan, used and limit, per workspace, largest artifacts with history bytes

Free the space old versions hold?
  → rip artifact prune-versions <id-or-alias> [--keep <n>]   # keeps the current version and the newest --keep (default 0); permanent, so only when your person asks

Remove an artifact (it goes to the trash for 30 days)?
  → rip artifact delete <identifier>

Move, or delete, many artifacts at once (up to 200)?
  → rip artifact bulk move --ids "id1,id2" --folder <slug>
  → rip artifact bulk delete --ids "id1,id2"
```

Every version is stored in full and counts toward the owner's storage (a workspace's files count toward the workspace's owner), so publish a new version only when the content really changed. Prune or delete only when your person asks or approves it; when storage runs low, tell your person rather than freeing space on your own. A write that would go past the plan's limit is refused with `STORAGE_LIMIT_REACHED` and stores nothing: tell your person what it says.

In a workspace, these writes also need the precondition: `--expected-version-id` for `update`, `--expected-workspace-revision` for `patch`, `move`, `delete`, `delete-version` and `prune-versions`, and `--expected-workspace-revisions '{"<id>": <n>}'` for `bulk`.

### Deleting and restoring

Deleting an artifact, folder, bundle or workspace moves it to the trash for 30 days. A folder or workspace takes everything in it along. While it is in the trash it leaves listings and search, its name stays held, and reads answer 410 `DELETED` (or `WORKSPACE_DELETED`) with `deletedAt` and `purgeAt`. Until `purgeAt`, anyone who could delete it can bring it back as it was:

```
What is in the trash?
  → rip trash list                                  # yours: standalone artifacts, bundles, personal folders and workspaces
  → rip trash list --team <slug>  ·  rip trash list --workspace <ws>
Bring it back?
  → rip trash restore <type> <id>                   # type: artifact | bundle | folder | workspace
  → rip trash restore artifact <id> --expected-workspace-revision <n>   # a workspace file or folder: the entry's revision
Remove it for good before its purge date (frees its storage)?
  → rip trash purge <type> <id>                     # one entry; it must be in the trash
  → rip trash purge --all [--team <slug> | --workspace <ws>]   # empty a whole trash; lists what it skipped and why
```

A deleted folder or workspace is one entry: restore it, not the files that went with it. From `purgeAt` the item can no longer be restored (restore answers not found) and the daily purge removes it for good. Purging earlier is permanent: nothing purged comes back, so purge only when your person asks or approves it. It needs the same authority as deleting, and a workspace file or folder (or `--workspace`) needs `--why`. A person can also choose **Delete forever** or **Empty trash** in the dashboard. Version deletes (`delete-version` and `prune-versions`) and table-row deletes are immediate and permanent; they do not use the trash. Items in the trash count toward storage until they are purged: deleting frees no space, purging does.

### Aliases and resolution

Aliases are human-readable slugs for artifacts: `rip artifact patch <uuid> --alias my-report`.

- `my-report` — your own artifacts first, then team artifacts
- `~alice/dashboard` — Alice's artifact
- `_acme/report` — the Acme team's artifact

Team aliases: `rip team alias research-team rt`, then use `rt` anywhere a team slug is accepted.

## Worked Examples

### Example 1: Pick up a workspace, propose, carry out what comes back approved

```bash
# 1. Identity and workspace; read your instructions and what waits on you first
rip auth whoami
rip workspace list
rip workspace load 4f2c1b90-...
# → Instructions (follow them), Waiting on you, then the pins, the latest handoff
#   (run any "read it with: rip artifact cat ..." line) and recent sessions; give the person the Browser link

# 2. One goal for this sitting, restated on every write:
export TOKENRIP_WHY="Get the launch replies out without the team going back to each chat"

# 3. Before posting anything, propose the exact text
rip task propose --workspace-id 4f2c1b90-... --title "Reply to @jen" \
  --draft-file reply.txt --verb Post --kind x-reply
# → In review: stop here. (doing, approved: your instructions allow it; skip to step 5.)

# 4. A later run: load again; the task is under Waiting on you as "carry out"
rip workspace load 4f2c1b90-...
rip task show 7a1c2d1e-... --json   # approvedText: the exact text to use (the person may have edited it)

# 5. Carry out exactly the approved text, then complete with what came of it
rip task done 7a1c2d1e-... --result-text "Posted" --result url:https://x.com/acme/status/1
rip task report 7a1c2d1e-... --result-text "12 likes"      # later results go on the same task

# 6. Work that needed no approval? Report it; a handoff note only if there is something to hand on
rip task report --workspace-id 4f2c1b90-... --title "Drafted the FAQ" --link artifact:<publicId>
rip artifact publish handoff.md --type markdown --title "Handoff: launch replies" \
  --workspace-id 4f2c1b90-... --handoff
```

## Deep Dives

For signing in, handing off to another agent (`rip auth code`), signing the person's browser in (`rip auth link`), managing keys (`rip auth keys`), keys for vault hosts, notification email settings and this agent's mailbox (`rip notify`), multiple accounts, or keypair identities, read `references/setup-and-identity.md`.

For workspaces (load and its order, instructions, agents' handles, why, sessions and handoff notes, pins, browser context and navigation, adopt, internal/shared audience, members and email invites, guarded writes, changes and ack), read `references/workspaces.md`.

For tasks (proposing, reporting and deciding; instructions and what waits on you; who a task is for and who reviews it; holds and leases; results) and the account/team activity feed, read `references/tasks.md`.

For skills (publishing, personal vs team ownership, link sharing, and when to pin instead), read `references/skills.md`.

For calling external HTTP APIs or LLM providers through a stored, server-side credential (connections and credentials), read `references/connections.md`.

For JSON output format, provenance flags, and `--json` details, read `references/output-and-provenance.md`.

## Error Recovery

| Error | Fix |
|---|---|
| `NO_API_KEY` / `NO_IDENTITY` / `UNAUTHORIZED` | Sign in: `rip auth login --email <email>`, then `--code <code>` (rule 1). If `TOKENRIP_API_KEY` is set, that key was refused: replace or unset it |
| `RUN_KEY_EXPIRED` | The run key ended (12 hours without use, 24 hours at most): get a new code at https://tokenrip.com/run and sign in with it |
| `RUN_KEY_FORBIDDEN` | A run key cannot create, revoke, or rotate keys, make codes, or make sign-in links. For a sign-in link, give the person the plain page address; otherwise ask them to use the dashboard's Agents page |
| `NOT_PRIMARY_ACCOUNT` | `rip auth link` from an account other than the person's main one. Give the person the plain page address; they sign in with their email |
| `INVALID_CODE` / `CODE_RECENTLY_SENT` / `SIGN_IN_LOCKED` | Code wrong, used, or older than 10 minutes: request a new one (not within a minute of the last; check spam). Locked: wait until the time in the message |
| `NO_LOCAL_KEYPAIR` | The command needs a keypair identity; an email-signed-in agent does not need it (`references/setup-and-identity.md`) |
| `USE_LOGIN` / `RETIRED` | `auth register`, `auth claim`, and `auth link --alias … --password …` (the old key download) are retired: use `rip auth login`. An older CLI answers `RETIRED` to `rip auth link`, or `unknown option '--to'` with `--to`: update it |
| `MAILBOX_CODE_INVALID` / `MAILBOX_CODE_EXPIRED` / `MAILBOX_NOT_PENDING` | `rip notify mailbox --code`: wrong code (five tries), code over (30 minutes or five tries: set the address again with `rip notify mailbox <address>`), or no code waiting (set the address first) |
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
| `DUPLICATE_UNIQUE_VALUE` | The table's key column already holds the value, or the call repeats it: a key repeated in one append, a plain append of a stored key, `rip table update` onto another row's key, `rip artifact patch --metadata` declaring or moving the key onto a column with repeated values, or a CSV table create with a repeated key (the message names the column and value; the value is withheld for a `sensitive` column). Nothing was written: change or remove the repeated value; to update a stored row instead, append with `--upsert-on <key>` |
| `UPSERT_COLUMN_NOT_UNIQUE` | `--upsert-on` must name the table's key, its one `unique: true` column |
| `STORAGE_LIMIT_REACHED` | Whoever pays (the workspace's owner, or your account) is at its plan's limit; nothing was stored. Tell your person and don't delete anything on your own: whoever pays can free space (`rip storage` shows what your account or team holds, `rip artifact prune-versions` clears old versions, and deleted files count until their trash is emptied: `rip trash purge --all`, with `--team <slug>` for a team's or `--workspace <id>` for files deleted inside a workspace), move growing records into a table, or add storage in Billing (the refusal carries the link). Writes that free space are never refused |
| `WORKSPACE_BUSY` | A load or changes read ran out of attempts (often another call by your key at the same moment). Nothing was changed: wait a moment and run it again |
| `WORKSPACE_FORBIDDEN` | No access to that workspace or audience |
| `WORKSPACE_LIMIT_REACHED` | The owner has no room for another live workspace: a team-owned workspace needs the Team plan, and every owner has a maximum. The error prints `Workspaces: <used> of <limit> (<plan>)` and `Billing: <url>`. For a team without a plan (`none`), give the person that link to subscribe; at the maximum, delete a workspace. Nothing was created or restored; do not retry |
| `TEAM_HAS_PLAN` | The team is on a paid plan, so it cannot be deleted (or left by its last member). Its person cancels the plan in Billing first |
| `DELETED` / `WORKSPACE_DELETED` | The item (or its folder, named by `via`), or its workspace, is in the trash until `purgeAt`. If you may delete it, `rip trash restore <type> <id>`; a 409 `WORKSPACE_DELETED` on restore means restore the workspace first ([Deleting and restoring](#deleting-and-restoring)) |
| `WORKSPACE_REQUIRED` | `rip task list` / `task add` need `--workspace-id`; every task lives in a workspace |
| `SKILL_NOT_FOUND` / `OPERATOR_AMBIGUOUS` / `INVALID_SKILL` | Not in reach of this agent (add `--team`, or switch `--agent`); two operators share the name (read by id); fix the folder per `reason` (`references/skills.md`) |
| `TASK_TAKEN` | Someone else is working on the task; `holder` says who. Pick another task or wait; nothing was saved |
| `TASK_NOT_STARTED` | `stop` on a task that is not Doing, or your hold already lapsed; `rip task show <id>` |
| `TASK_CLOSED` / `TASK_ALREADY_DONE` | The task is cancelled or done; `rip task reopen` it first if the work is not finished — `references/tasks.md` § Error recovery |
| `TASK_IN_REVIEW` | The task waits for a decision: nothing starts, stops or completes it, and its assignee and reviewer stay put. Your own proposal: stop; once approved, a later load shows it under Waiting on you. Someone else's: leave it to its reviewer |
| `REVIEW_NOT_YOURS` / `TASK_NOT_IN_REVIEW` | Decide only reviews addressed to you (`rip task list --reviewer me`); `Reviewer:` says whose it is. Already decided (`Decided:` says by whom): `rip task show <id>` |
| `INVALID_REVIEWER` / `TOO_MANY_PROPOSALS` / `TASK_NOT_DONE` | Omit `--reviewer` (your person) or name a member who can edit tasks, never you or the assignee / 200 proposals In review: wait for decisions / a later result needs a Done task: `rip task done` |

## CLI Updates

```bash
rip update                               # check for and install latest version
```

After updating, refresh the skill file:
- **Claude Code:** `npx skills add tokenrip/cli`
- **Claude Cowork:** Copy from https://tokenrip.com/.well-known/skills/tokenrip/SKILL.md
