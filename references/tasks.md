# Tasks & Activity

Return to [SKILL.md](../SKILL.md) for the command routing table.

A **task** is one unit of work in a workspace's shared to-do list, and the **activity** feed records what happened in a team or your own scope. After `rip workspace load`, run `rip task list --workspace-id <id>` to see what is waiting.

---

## Tasks

Every task lives in exactly one workspace, with an **audience** inside it (`internal` or `shared`). There are no personal or team tasks: `task list` and `task add` require `--workspace-id`, and the server answers a missing one with `WORKSPACE_REQUIRED`. A task carries a `title`, an optional markdown body, an optional `kind` (a slug naming the kind of work), and a producer-defined payload.

| Status | The dashboard says | Meaning |
|---|---|---|
| `todo` | To do | Nobody is on it |
| `doing` | Doing · *who* | One holder is working on it |
| `done` | Done | Finished, with optional results |
| `cancelled` | Cancelled | Will not be done; reopenable |

```bash
rip task list --workspace-id <ws>                        # To do and Doing tasks you can see
rip task list --workspace-id <ws> --status all --kind process-call
rip task list --workspace-id <ws> --status done,cancelled --order finished   # most recently finished first
rip task list --workspace-id <ws> --mine                 # suggested to me or held by me
rip task show <id>                                       # holder, body, payload, results
```

Filters: `--status` (comma list of `todo,doing,done,cancelled`, or `all`; default `todo,doing`), `--order` (`created`, the default, or `finished`, which needs `--status` of only `done` and/or `cancelled`), `--kind`, `--mine`, `--since`, `--limit` (max 200), `--cursor` (replay it with the same filters and order).

Each row says who holds a Doing task, in the words History uses: `You · laptop (Claude Code)` for one of your own agents, `You · in the browser` for the person, `~alek's agent · Codex` for someone else's agent, `~alek · in the browser` for that person. A To do task shows its suggestion as `? <account>`.

### The lifecycle

```
todo ──start──> doing ──done──> done
 │  <──stop / lease lapses──┘     │
 │                                │
 └──done (straight from To do) ───┘
todo / doing ──cancel──> cancelled      (done and cancelled both reopen to todo)
```

```bash
rip task add "Review pricing copy" --workspace-id <ws> --assignee alek --kind write-post
rip task add "Client-visible follow-up" --workspace-id <ws> --audience shared
rip task start <id> --lease-hours 4
rip task start <id>                              # again on long work: renews your lease
rip task stop <id>                               # back to To do
rip task done <id> --result artifact:q3-memo@2 --result url:https://…
rip task cancel <id> --reason "duplicate"
rip task reopen <id>
rip task update <id> --expected-revision <n> --title "…"   # title/body/assignee/audience
```

Every write states `--why "<the person's goal>"` (or `TOKENRIP_WHY`), like any workspace write; without it the server refuses `WHY_REQUIRED`. Task history, whys included, is in `rip workspace changes`.

**Old words.** `rip task claim`, `touch`, `release` and `dismiss` still run, hidden, until the old vocabulary is retired. Each prints `Deprecated: use rip task start` (or `stop`, `cancel`) on stderr and runs the new command, so `touch` now needs a why like `start`. Use the new commands.

### Who holds a task

- **One holder per task, per key.** When an agent starts a task, the hold belongs to that agent's key, not just the account. Two agents of the same person cannot both hold one task: the second gets `TASK_TAKEN`.
- **An agent's hold has a lease**: 0.25–72 hours, default 2. A sweep runs every minute and returns a lapsed hold to To do, so work is never parked by a harness that vanished. Starting your own task again renews the lease, never shorter; advertise the `holder.leaseExpiresAt` that comes back, not the value you asked for.
- **The person's hold has no lease.** When the person starts a task in the dashboard, it stays theirs until they move it. Leave it alone unless they ask.
- **Races resolve at the database.** Two agents starting at once: one wins, the other gets `TASK_TAKEN` with `holder` saying who. Never check-then-start — call `start` and branch on the error.
- A task whose agent lease has lapsed is **free**: anyone may start it (a takeover) or complete it.

### Who can do what

- **Visibility** follows the workspace: internal members see both audiences, external members only `shared`. No access → `WORKSPACE_FORBIDDEN`.
- **Writing** (add, start, stop, done, cancel, reopen, update) needs task-write access for the task's audience. A workspace in the trash answers 410 `WORKSPACE_DELETED` to every task call until an admin restores it.
- `--assignee` is a **suggestion**, not a lock. It must be a current workspace editor who can see the task's audience; any such editor may still start the task.
- **Stop** is for the holder. The person may stop any of their own agents' holds, and a workspace admin may stop anyone's; everyone else gets `TASK_TAKEN`.
- Losing access (removed from the workspace or its owning team, downgraded, narrowed out of the audience) stops your holds and clears suggestions pointing at you.

### Completing

- `rip task done` completes a task that is **free** (To do, or a lapsed agent hold) or **yours**; you do not need to start it first. Someone else's live hold → `TASK_TAKEN`, and **nothing is saved**: keep your results locally and pick another task, or wait.
- `--result artifact:<publicId>[@version]` or `--result url:<https://…>`, repeatable, up to 50. An artifact result must live in the task's workspace and be visible to its audience.
- An artifact result that is in the trash is refused (410 `DELETED`), and `rip task show` leaves out results that are in the trash.
- Reopening keeps the results. Status is the truth, not the result set.

### A task's history

Task events are **workspace activity**: `task.created`, `task.started`, `task.stopped`, `task.lease_expired`, `task.completed`, `task.cancelled` and `task.reopened` arrive through `rip workspace changes <workspace>` (MCP `workspace_changes`) alongside the workspace's other changes; older rows may still say `task.claimed`, `task.released` or `task.dismissed`. `rip workspace load` also returns the latest activity. The account/team feed below never carries task events.

---

## Activity

An append-only feed of what happened in a team or your own scope: team shares, connection changes, and member removals. Non-consuming — poll it freely.

```bash
rip activity --team quintel
rip activity --team quintel --type connection.created,team.member_removed --since 7
rip activity --actor alek
rip activity --subject connection:<uuid>
```

Every row carries a sentence rendered server-side, so `--json` and human output tell the same story:

```
alek created connection minimax 12m ago (claude-code)
sam removed alek from the team 2h ago
```

Verbs: `artifact.shared_to_team`, `connection.created`, `connection.rotated`, `connection.disabled`, `team.member_removed`. `--subject <type>:<id>` narrows the feed to one subject (for example `connection:<uuid>`). Task history is not here; read it with `rip workspace changes <workspace>`.

---

## Attribution — which harness you are

Every task hold and activity row records the **harness** it came from, not just the account, and the agent key that acted. The CLI resolves the harness automatically: an explicit `TOKENRIP_SURFACE` wins, otherwise Claude Code names itself (`claude-code`), then Codex (`codex`), otherwise plain `cli`. It also sends the harness conversation id (`TOKENRIP_CONVERSATION`, else `CLAUDE_CODE_SESSION_ID`, else `CODEX_THREAD_ID`; stored only as a hash), so two conversations on one key form two sessions.

```bash
TOKENRIP_SURFACE=nightly-batch rip task start <id>
```

That value lands on the task's `holder.surface` and every activity row — so a feed can tell a task started in the dashboard from one started by a cron shell. Attribution is metadata and can never fail a call; only a missing `--why` on a write refuses.

---

## Error recovery

| Error | Fix |
|---|---|
| `WORKSPACE_REQUIRED` | `task list` / `task add` need `--workspace-id` — every task lives in a workspace |
| `WORKSPACE_FORBIDDEN` | You have no access to the workspace or the task's audience, or no task-write access |
| `WORKSPACE_DELETED` | The workspace is in the trash; a workspace admin can `rip trash restore workspace <id>` |
| `TASK_TAKEN` | Someone else is working on it. `holder` (printed as `Held by: …`) says who and until when — pick another task or wait. Nothing was saved |
| `TASK_NOT_STARTED` | `stop` on a task that is not Doing (or your lease already lapsed). `rip task show <id>` |
| `TASK_CLOSED` | The task is cancelled (or, for `start`, done). Reopen it first if the work is still wanted |
| `TASK_ALREADY_DONE` / `TASK_NOT_CLOSED` | Already done (reopen first) / only done or cancelled tasks reopen. `rip task show <id>` |
| `INVALID_ASSIGNEE` | The `--assignee` is not a current workspace editor who can see the task's audience |
| `INVALID_CURSOR` | Cursors are opaque — re-run the query rather than editing the value |
| `INVALID_FIELD` on `--since` | `--since 0`, a negative, and a unix timestamp are all rejected. Use a positive number of days or an ISO-8601 timestamp |
