# Workspaces

A workspace is the authoritative home for a project's artifacts, tables, flat folders, and tasks, with an internal/shared audience per item and explicit external members. Commands: `rip workspace …` (alias `rip ws`). Identifier: the workspace **UUID** (these commands do not resolve slugs). API: `/v0/workspaces`; MCP: the `workspace_*` tools (`workspace_list`, `workspace_load`, `workspace_changes`, …). Return to [SKILL.md](../SKILL.md) for the top-level decision trees.

## Membership and audience

Membership is resolved live:

- The personal owner, or the owning team's owner and admins, are internal **admins**.
- Other members of the owning team are internal **editors**.
- An admin may add outside accounts as external **viewers** or **editors**.

Every item has an `audience`: `internal` (owner or team only) or `shared` (external members too). Internal members create `internal` items by default; external editors create `shared` ones. `rip workspace list` prints each workspace's name, full UUID, slug, personal/team home, `membership/role`, and permitted capabilities; `rip workspace show` (and `load`) add a `Can:` line — the operations your live capabilities allow — and `show` the `audiences`. With `--json` the full `capabilities` map is included. Trust the capabilities, not the role name.

## When to use

- "work on project X from this harness" → `rip workspace load <workspace-id>`, then state `--why` on every write
- "who worked on this, and toward what" → `rip workspace sessions <workspace-id>`
- "what changed since I last looked" → `rip workspace changes <workspace-id>`, then `rip workspace ack <workspace-id> --delivery-token <token>`
- "this document the operator is looking at" → `rip workspace view context <workspace-id>`, then write to the returned `savedArtifactId` with its `savedVersionId` / `savedRevision` as the precondition. Never guess from focus.
- "open that document in their browser" → `rip workspace view open …` and read the receipt (`queued` / `deferred` / `applied` / `disconnected`)
- "share this with the client" → `rip workspace adopt … --audience shared` for standalone content, `rip artifact patch <id> --audience shared --expected-workspace-revision <n>` for a workspace artifact, `rip folder share-contents` for a folder and everything in it
- "give the client access" → `rip workspace member add <workspace-id> <account> --role viewer|editor`
- "bring an existing artifact or folder into the workspace" → `rip workspace adopt`
- "hand off" → nothing to end: your session is recorded. For decisions and loose ends, `rip artifact publish <file> --type markdown --title "Handoff: ..." --workspace-id <ws> --handoff --why "<the goal>"`

## Lifecycle and members

```bash
rip workspace create <slug> --name "Roadmap" [--description <text>] [--team-id <team-uuid>] --why "<the goal>"
rip workspace list                                   # names, ids, membership/role
rip workspace show <workspace-id>                    # adds Can: (capabilities) and audiences
rip workspace update <workspace-id> [--name <name>] [--description <text>]
rip workspace delete <workspace-id>                  # admins; moves it and everything in it to the trash for 30 days
rip trash restore workspace <workspace-id>           # bring it back, as it was, until its purge date

rip workspace member list <workspace-id>             # external members only; internal access is derived, never listed
rip workspace member add <workspace-id> <account> [--role viewer|editor]   # account id or alias; default editor
rip workspace member set-role <workspace-id> <account-id> --role viewer|editor
rip workspace member remove <workspace-id> <account>
```

`--team-id` takes the team's UUID (`rip team list` prints it); only the team's owner and admins can create a team workspace. A team that still owns workspaces, including workspaces in the trash, cannot be deleted (`TEAM_OWNS_WORKSPACES`).

Every write here (create, update, delete, member add/set-role/remove, adopt) takes `--why`, like any workspace write ([Why](#why-every-write-says-what-it-is-for)).

Deleting a workspace needs `deleteWorkspace` (internal admins) and nothing else: it need not be empty. The workspace goes to the trash with everything in it (files, folders, tasks, pins), and restoring it brings all of it back. While it is in the trash, every call on it answers 410 `WORKSPACE_DELETED` with `deletedAt` and `purgeAt`; admins also get `restorable` and `deletedBy`. It leaves `rip workspace list`, and its slug stays held until it is purged. `rip trash restore workspace <id>` brings it back until `purgeAt`; after that the daily purge removes it for good. Agents cannot purge early; a person can choose Delete forever in the dashboard.

Adding someone who is already internal (the owner or a team member) is refused (`WORKSPACE_MEMBER_INTERNAL`). When an external member later joins the owning team, their external grant is consumed, so leaving the team ends access. Removals and downgrades take effect on the next request and release any task claims the new role does not allow.

## Adopt existing content

```bash
rip workspace adopt <workspace-id> <artifact-id> --audience internal|shared [--destination-folder-id <uuid>]
rip workspace adopt <workspace-id> <folder-id> --kind folder --audience internal|shared   # brings its current artifacts
```

Adoption is atomic, makes no copy, and keeps identity and history. You must own the content; its team shares are removed. Refused before any effect: `MIXED_OWNERSHIP`, `ALREADY_IN_WORKSPACE`, `INELIGIBLE_STORAGE` (public assets, independently hosted content, public history), `WORKSPACE_BULK_LIMIT` (more than 500 items). Sharing an adopted artifact exposes its **whole** version history. There is no move-out. A destination folder must belong to the same workspace (`CROSS_WORKSPACE_MOVE`).

## Content inside a workspace — the ordinary commands

Workspace content is written with the normal commands plus workspace flags. New artifacts and folders need no expected revision. Existing content uses the applicable precondition the read reported; insert-only table rows need none unless they expand the schema. The server answers `PRECONDITION_REQUIRED` when it is missing and `CONFLICT` (with `currentVersionId` / `currentRevision` / `currentWorkspaceRevision`) when it is stale. Re-read on stale guards and correct the request; never overwrite. Creation audience and `--handoff` require explicit workspace identity. Omit standalone visibility, team grants and legacy folder slugs, including private visibility; workspace access is governed by membership and audience.

```bash
# create in the workspace
rip artifact publish <file> --type markdown --workspace-id <ws> [--audience internal|shared] --why "<the goal>"
rip artifact publish --type table --title "..." --schema '<json>' --workspace-id <ws>
rip artifact upload <file> --workspace-id <ws> [--audience internal|shared]
rip folder create <slug> --workspace <ws> [--audience internal|shared]
rip task add "<title>" --workspace-id <ws> [--audience internal|shared]

# replace a document body (the artifact's current version id is the precondition)
rip artifact update <id> <file> --type markdown --expected-version-id <version-id>

# metadata / audience without a new version (the artifact's workspaceRevision is the precondition)
rip artifact patch <id> --audience shared --expected-workspace-revision <n>
rip artifact move <id> --folder-id <workspace-folder-uuid> --expected-workspace-revision <n>   # or --unfiled
rip artifact delete <id> --expected-workspace-revision <n>         # to the trash for 30 days (needs deleteContent)
rip artifact delete-version <id> <version-id> --expected-workspace-revision <n>   # permanent; no trash
rip artifact bulk delete --ids "<id>,<id>" --expected-workspace-revisions '{"<id>": <n>, "<id>": <n>}'

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

Every one of these writes also takes `--why` (and so do `task claim|release|done|dismiss|reopen`, `artifact fork`, `workspace adopt` and `trash restore`); `task touch` and pins take none. Create receipts retain the authoritative `workspaceId`, `audience`, and initial `workspaceRevision: 1`. Guarded write receipts return the next applicable version/revision; carry it into the next guarded call.

### Deleted files and folders

A deleted workspace file answers 410 `DELETED` to members who could read it. A file in a deleted folder answers the same with `via: { type: "folder", id }`. Deleting a workspace folder (from the dashboard) takes its files to the trash with it. To bring something back:

```bash
rip trash list --workspace <ws>                       # files and folders deleted in this workspace, by audience
rip trash restore artifact <id> --expected-workspace-revision <n>   # the entry's workspaceRevision
rip trash restore folder <folder-id> --expected-workspace-revision <n>
```

Restoring needs `deleteContent`, like deleting. The entry and, for a restorer, the 410 both carry `workspaceId` and `workspaceRevision`. A file whose folder is still in the trash comes back unfiled; restore the folder instead to bring back everything that went with it. While the workspace itself is in the trash, restoring one of its files or folders answers 409 `WORKSPACE_DELETED`: restore the workspace first.

Folders are flat and grant nothing. A shared folder shows its shared children. An internal folder is invisible externally, and its shared children appear at the external root. `folder update --audience` changes only the folder's own visibility; `folder share-contents` is the one-time bulk share (later children do not inherit it).

## Why: every write says what it is for

Every write to workspace content states `why`: one sentence on what the person is trying to accomplish, in their terms, not a description of the edit.

- Goal: `--why "Set launch prices the team can defend to finance"`
- Not a goal: `--why "Update row 4 of the pricing table"`

Pass `--why` on each writing command, or set `TOKENRIP_WHY` once for a script with one purpose (the flag wins). Whitespace collapses to one line; blank is missing. Missing is `WHY_REQUIRED` (400) before anything changes; over 300 characters is `INVALID_FIELD` (`field: "why"`). Standalone items (no workspace) accept `--why` and do not need it. The why lands on every activity event the write records, with your agent key and your conversation (the CLI sends `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, or `TOKENRIP_CONVERSATION`), so the change feed and sessions explain themselves.

## Load, sessions, pins, and handoff notes

```bash
rip workspace load <workspace-id>     # bounded context; also --artifact-offset, --task-cursor, --activity-cursor, --handoff-offset
rip workspace sessions <workspace-id> [--cursor <nextCursor>]
```

`load` takes no selector and is safe to repeat: it changes nothing (the first load creates this key's reader position; only `rip workspace ack` moves it). The response is bounded, and human output prints all of it:

- `Workspace:` name, id, `membership/role`, and `Can:` — the capabilities you hold now; `Browser:` — the link the person opens to pair a browser tab to your agent key
- `Pinned` — up to 20 markdown documents to read on load. A small pin's body is printed inline. A large one arrives as a **reference**: the line says `read it with: rip artifact cat <publicId> --version-id <versionId>` — run exactly that
- `Latest handoff` — the newest handoff note, inline or with the same `rip artifact cat … --version-id …` command (handoffs usually arrive as references), plus the ids of earlier notes
- `Recent sessions` — the latest few sessions (see below), with a `rip workspace sessions … --cursor …` line when there are more
- `Tasks` (20), `Recent changes` (50; a `refresh`/`historyGap` warning when set), and the `Artifacts` index (50)
- `More` — one `rip workspace load <ws> --artifact-offset|--task-cursor|--activity-cursor|--handoff-offset <value>` line per list that continues

With `--json`, the same data is under `workspace`, `pins[]`, `handoffs.items[]`, `sessions` (`items`, `hasMore`, `nextCursor`), `tasks`, `activity`, `artifacts`, and `browserLink`; a pin or handoff carries either `content.content` (inline) or `content.versionId` (a reference — read it with the command above). Follow the explicit continuation fields; no page implies completeness. A workspace in the trash answers `WORKSPACE_DELETED` (410) to `load` and `show`. Loading does **not** acknowledge activity.

**Sessions record themselves.** A session is a run of writes in one workspace by one account, agent key and conversation, each within 45 minutes of the previous one. Nothing is started, ended or expired; the server groups activity when you read it. Each session shows who worked (the agent's key name only for your own account), from which tool (`claude-code`, `codex`, `cli`, `dashboard`, …), when, the goals in order (the whys, repeats collapsed; "no stated goal" for older writes; "in the browser" for a person's edits), the items it changed with change counts and the version it left, and any handoff note it published. You see only sessions built from events you may read: an external member sees shared work only. `sessions` is newest first, 20 per page; `--cursor` continues (`INVALID_CURSOR` for a malformed one). A read scans the workspace's latest 1,000 events, so a very long session can appear split, marked "earlier activity of this session not shown".

**Handoff notes** are optional. The session is recorded anyway; a note is where you put decisions and loose ends when you have some. Publish markdown with `--handoff`:

```bash
rip artifact publish handoff.md --type markdown --title "Handoff: pricing review" --workspace-id <ws> --handoff --why "<the goal>"
```

It needs `--workspace-id` (`INVALID_SCOPE`), markdown (`INVALID_HANDOFF`), and the right to write handoffs. Handoff notes are ordinary markdown artifacts with a marker; they survive activity retention and follow normal audience rules. Load lists the latest ones.

**Pins or skills?** If instructions only make sense inside one workspace, pin them; if an agent needs them to start a job, publish a skill (`references/skills.md`). An agent sees a pin only after someone tells it which workspace to load; a skill reaches every agent of its operator or team.

```bash
rip workspace pin add <workspace-id> <artifact-id-or-alias> [--position <n>]   # internal editors; markdown only; max 20
rip workspace pin remove <workspace-id> <artifact-id-or-alias>
```

## The operator's browser

```bash
rip workspace view context <workspace-id>
rip workspace view open <workspace-id> <artifact-id> --operation-id <stable-id> --expected-context-generation <n>
```

The person opens your load's `Browser:` link; that tab pairs to **your agent key** in this workspace (one tab per key per workspace, same account only). Revoking the key, losing access, or another of the person's agents taking the tab over disconnects it.

`view context` returns `state: paired | disconnected` and, when paired, the tab's **saved** `savedArtifactId`, `savedVersionId`, `savedRevision`, `dirty`, `following`, and `contextGeneration`. Resolve "this document" from it, then address the write by that artifact id with its version or revision precondition.

`view open` asks the paired tab to navigate. The receipt is one of:

- `queued` — the tab is following and clean
- `deferred` — the person is editing, paused, or the context generation moved; they get an Open button
- `applied` — the browser acknowledged it
- `disconnected` — no tab follows your key

The same `--operation-id` replays the receipt. Ordinary writes never move the tab, and nothing you do can discard a draft.

## Changes and acknowledgment

```bash
rip workspace changes <workspace-id> [--limit <n>] [--delivery-token <token>]
rip workspace ack <workspace-id> --delivery-token <token>
```

`changes` returns a bounded page (default 50, max 100) of authorized events since **your credential's** acknowledged position — workspace, member, artifact, folder, and task events. Each item carries its `why` (null for browser edits, system jobs and older events) and, on your own account's events, the `agent` key name. Recent activity, load previews, changes, and the operator's peek/polling share the same event-time audience and current access policy. The page carries a `deliveryToken`, `hasMore`, `historyGap` (retention pruned past your position; refresh from `load`), and `refresh` (`required` when your access changed).

Activity sequences are positions in commit order, not visible-event counts or content versions. A retained activity window can be older than the current content returned by `load`. `ack` consumes the delivered history page; it does not repair a refused write or satisfy a content revision guard. Already consumed history is not rewound automatically.

Reading, loading, and polling never acknowledge visible history; `ack` consumes its delivered page. Invisible-only ranges can be traversed automatically. While a page is outstanding a new one is refused (`WORKSPACE_PAGE_UNACKNOWLEDGED`); pass its token to `changes` to replay it. A wrong or expired (10 minute) token is `INVALID_WORKSPACE_DELIVERY`. Positions are per credential: another key, or the operator's browser, has its own.

## Rules worth memorising

- **Why on every write.** One sentence on the person's goal, restated each time; never a description of the edit.
- **Retry identity.** `view open` replays its original receipt with the same operation id. Loading again is always safe.
- **Preconditions are mandatory.** No workspace write succeeds without the expected version, row revision, or workspace revision it needs.
- **The browser link is not a credential.** It names your key only so the person's tab can pair; pairing needs their own sign-in to the same account.
- **Audience is per item and independent of versions.** Changing it rewrites nothing; narrowing removes future external access but cannot recall bytes already downloaded.

## Errors

| Error | Meaning |
|---|---|
| `WORKSPACE_FORBIDDEN` | No access to the workspace, the item's audience, or that write |
| `WORKSPACE_DELETED` | 410: the workspace is in the trash until `purgeAt`; an admin can `rip trash restore workspace <id>`. 409 on a restore: the item's workspace is in the trash, so restore the workspace first |
| `DELETED` | 410: the file or folder (or, with `via`, its folder) is in the trash; `rip trash restore <type> <id> --expected-workspace-revision <n>` |
| `WORKSPACE_AUTHORITY` | The item is governed by a workspace; use the workspace write path (with its precondition) instead of the standalone one |
| `PRECONDITION_REQUIRED` / `CONFLICT` | Missing or stale version id / revision — re-read and retry |
| `WORKSPACE_MEMBER_INTERNAL` | The account already has internal access |
| `ALREADY_IN_WORKSPACE` / `MIXED_OWNERSHIP` / `INELIGIBLE_STORAGE` / `WORKSPACE_BULK_LIMIT` | Adoption refused before any effect |
| `CROSS_WORKSPACE_MOVE` | The folder and the artifact belong to different workspaces |
| `TEAM_OWNS_WORKSPACES` | A team that owns workspaces, including workspaces in the trash, cannot be deleted; a workspace in the trash is removed with Delete forever in the dashboard |
| `WHY_REQUIRED` / `INVALID_FIELD` (`why`) | State `--why` (or `TOKENRIP_WHY`); at most 300 characters. No `--why` flag: `rip update` |
| `INVALID_SCOPE` / `INVALID_HANDOFF` | `--handoff` needs `--workspace-id` and markdown |
| `INVALID_CURSOR` | Start `rip workspace sessions` again without `--cursor` |
| `SESSION_END_RETIRED` | `rip workspace session end` is gone: sessions record themselves. Leave a note with `rip artifact publish … --handoff` |
| `WORKSPACE_PAGE_UNACKNOWLEDGED` / `INVALID_WORKSPACE_DELIVERY` | Replay or acknowledge the outstanding change page first |

## Notes

- Add `--json` (or `TOKENRIP_OUTPUT=json`) for machine-readable output on every command above; human output still prints full identifiers and continuation fields.
- Workspace commands map one to one to `/v0/workspaces` and the MCP `workspace_*` tools. Browser tab mechanics (pairing, polling) exist only in the operator dashboard.
