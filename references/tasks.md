# Tasks & Activity

Return to [SKILL.md](../SKILL.md) for the command routing table.

A **task** is one claimable unit of work in a workspace, and the **activity** feed records what happened in a team or your own scope. After `rip workspace load`, run `rip task list --workspace-id <id>` to see what is waiting.

---

## Tasks

Every task lives in exactly one workspace, with an **audience** inside it (`internal` or `shared`). There are no personal or team tasks: `task list` and `task add` require `--workspace-id`, and the server answers a missing one with `WORKSPACE_REQUIRED`. A task carries a `title`, an optional markdown body, an optional `kind` (a slug naming the kind of work), and a producer-defined payload.

```bash
rip task list --workspace-id <ws>                        # open + claimed tasks you can see
rip task list --workspace-id <ws> --status all --kind process-call
rip task list --workspace-id <ws> --mine                 # suggested to or claimed by me
rip task show <id>                                       # body, payload, results
```

Filters: `--status` (comma list of `open,claimed,done,dismissed`, or `all`; default `open,claimed`), `--kind`, `--mine`, `--since`, `--limit` (max 200), `--cursor`.

### The lifecycle

```
open ──claim──> claimed ──done──> done
 │                 │
 │                 └── release / lease lapses ──> open
 └──dismiss──> dismissed          (both closed states reopen)
```

```bash
rip task add "Review pricing copy" --workspace-id <ws> --assignee alek --kind write-post
rip task add "Client-visible follow-up" --workspace-id <ws> --audience shared
rip task claim <id> --lease-hours 4
rip task touch <id>                              # extend the lease you hold
rip task release <id>
rip task done <id> --result artifact:q3-memo@2 --result url:https://…
rip task dismiss <id> --reason "duplicate"
rip task reopen <id>
rip task update <id> --expected-revision <n> --title "…"   # title/body/assignee/audience
```

Every write accepts `--workspace-session-id <id>` to attribute it to your live workspace session.

### Who can do what

- **Visibility** follows the workspace: internal members see both audiences, external members only `shared`. No access → `WORKSPACE_FORBIDDEN`.
- **Writing** (add, claim, done, dismiss, reopen, update) needs task-write access for the task's audience; an archived workspace answers `WORKSPACE_ARCHIVED`.
- `--assignee` is a **suggestion**, not a lock. It must be a current workspace editor who can see the task's audience; any such editor may still claim the task.
- A **workspace admin** may release anyone's claim; everyone else releases only their own.

### Claim and lease rules

- A claim holds a **lease**: 0.25–72 hours, default 2. A sweep runs every minute and returns a lapsed claim to `open`, so work is never parked forever by a harness that vanished.
- **Every task must be claimed before it completes.**
- **Races resolve at the database.** Two harnesses claiming at once: one wins, the other gets `TASK_ALREADY_CLAIMED` naming who holds it and until when. Never check-then-claim — just call `claim` and branch on the error.
- `touch` is **monotonic** — it can only move the expiry forward. Advertise the `leaseExpiresAt` that comes back, not the value you asked for.
- Re-claiming a task you already hold extends it. Claiming a task whose lease has lapsed is a **takeover**.
- Losing access (removed from the workspace or its owning team, downgraded, narrowed out of the audience) releases your claims and clears suggestions pointing at you.

### Completing, and what happens when you're late

- `--result artifact:<publicId>[@version]` or `--result url:<https://…>`, repeatable, up to 50. An artifact result must live in the task's workspace and be visible to its audience.
- Completing after **your own lease lapsed** → `CLAIM_LOST`, but **your results are kept** on the task as orphaned results. Re-claim and complete again; nothing is lost.
- Completing a task you **never held** → `NOT_CLAIMANT`, and **nothing is persisted**. Keep your results locally, claim, retry.
- Reopening keeps the results. Status is the truth, not the result set.

### A task's history

Task events are **workspace activity**: `task.created`, `task.claimed`, `task.completed`, `task.released`, `task.lease_expired`, and the rest arrive through `rip workspace changes <workspace>` (MCP `workspace_changes`) alongside the workspace's other changes. `rip workspace load` also returns the latest activity. The account/team feed below never carries task events.

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

Every claim, session and activity row records the **harness** it came from, not just the account. The CLI resolves it automatically: an explicit `TOKENRIP_SURFACE` wins, otherwise Claude Code names itself (`claude-code`), otherwise plain `cli`.

```bash
TOKENRIP_SURFACE=nightly-batch rip task claim <id>
```

That value lands on the task's `claimedVia` and every activity row — so a feed can tell a dashboard claim from a cron-shell claim. Attribution is metadata and can never fail a call.

---

## Error recovery

| Error | Fix |
|---|---|
| `WORKSPACE_REQUIRED` | `task list` / `task add` need `--workspace-id` — every task lives in a workspace |
| `WORKSPACE_FORBIDDEN` | You have no access to the workspace or the task's audience, or no task-write access |
| `WORKSPACE_ARCHIVED` | The workspace is archived; restore it first |
| `TASK_ALREADY_CLAIMED` | Someone else holds it. The error names `claimedBy` and `leaseExpiresAt` — pick another task or wait |
| `CLAIM_LOST` | Your lease lapsed. Results from a `done` are kept as orphaned refs — re-claim and complete again |
| `NOT_CLAIMANT` | You never held the claim; nothing was saved. Claim first, then retry |
| `TASK_NOT_CLAIMED` | The task is still `open` — claim it before `done` |
| `TASK_NOT_OPEN` / `TASK_ALREADY_DONE` / `TASK_NOT_CLOSED` | The task is not in a state that verb accepts. `rip task show <id>` |
| `INVALID_ASSIGNEE` | The `--assignee` is not a current workspace editor who can see the task's audience |
| `INVALID_CURSOR` | Cursors are opaque — re-run the query rather than editing the value |
| `INVALID_FIELD` on `--since` | `--since 0`, a negative, and a unix timestamp are all rejected. Use a positive number of days or an ISO-8601 timestamp |
