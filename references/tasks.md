# Tasks & Activity

Return to [SKILL.md](../SKILL.md) for the command routing table.

A **task** is one piece of work in a workspace. It keeps the ask, the draft, the person's edit, the decision, the action and what came of it together, so a person can decide from the dashboard and see what came back without opening any agent's chat. The **activity** feed records what happened in a team or your own scope. After `rip workspace load`, read your instructions and what waits on you first.

---

## Tasks

### The protocol

1. **Load the workspace first; your instructions come first.** `rip workspace load` opens with what your person wrote for you here. Follow the text; its on-its-own list is applied for you when you propose.
2. **Before acting outside the workspace** (post, send, publish, book), **propose** it: a title, the exact draft, the approve verb, a kind, and a reviewer if it is not your own person and the task names none.
3. The reply is **In review** (stop; it comes back to you) or **doing and approved** (your instructions allow it; carry it out now).
4. **Carry out exactly the approved text**, the reviewer's edit included, then complete with the result. If it fails, propose again with what went wrong, or cancel with the reason. Check that you have not already done it before acting.
5. **Report** work worth knowing that needed no approval; later results go on the same task.
6. Every run, **what's waiting on you comes first**: approved tasks to carry out, reviews addressed to you, tasks for you.

Every task lives in exactly one workspace, with an **audience** inside it (`internal` or `shared`). There are no personal or team tasks: `task list`, `task add` and a new `task propose` or `task report` need `--workspace-id`, and the server answers a missing one with `WORKSPACE_REQUIRED`. A task carries a `title`, an optional markdown body, an optional `kind` (a slug naming the kind of work, at most 64 characters), a producer-defined payload, and optionally a **parent** in the same workspace (set when the task is created, never changed).

| Status | The dashboard says | Meaning |
|---|---|---|
| `todo` | To do | Nobody is on it (an approved proposal waits here to be carried out) |
| `doing` | Doing · *who* | One holder is working on it |
| `review` | In review | A proposal waits for its reviewer's decision; nobody works on it |
| `done` | Done | Finished, with what came of it |
| `cancelled` | Cancelled | Will not be done (a skipped proposal lands here); reopenable |

```bash
rip task list --workspace-id <ws>                        # To do and Doing tasks you can see
rip task list --workspace-id <ws> --reviewer me          # reviews In review addressed to you
rip task list --workspace-id <ws> --mine                 # for you (your person, or you as an agent) or held by you
rip task list --workspace-id <ws> --status review        # every proposal In review you can see
rip task list --parent-id <id>                           # a task's children, in its workspace
rip task list --workspace-id <ws> --status done,cancelled --order finished   # most recently finished first
rip task show <id>                                       # everything: who, draft, approved text, decision, result, children, history
```

Filters: `--status` (comma list of `todo,doing,review,done,cancelled`, or `all`; default `todo,doing`, or `review` with `--reviewer me` alone), `--order` (`created`, the default, or `finished`, which needs `--status` of only `done` and/or `cancelled`), `--kind`, `--mine`, `--reviewer me`, `--since`, `--limit` (max 200), `--cursor` (replay it with the same filters and order).

### Who a task names

Every task names people and agents in four roles, as **principals**: `assignee` (who it is for; empty: anyone), `reviewer` (who decides its proposal; empty: any person who can edit tasks), `createdBy` and `completedBy`. A principal is a person (`{ account, agent: null }`) or one agent (`agent: { id, name, harness }`), with `mine` (on your account) and `isCaller` (exactly you). Human output uses History's words:

| Principal | Printed as |
|---|---|
| Your person | `You` |
| One of your person's agents | `You · Grok (Claude Code)` (its key name and harness) |
| You, the calling agent | `You · Grok (Claude Code) · this agent` |
| Another person | `~alek` (their account id when they have no alias) |
| Another person's agent | `~alek's agent · Codex` (their key names are never shown) |

To name a principal in `--assignee` or `--reviewer`, give a person's account id or alias (`alek`, `@alek`), or an agent as **`agent:<handle>`**. The handle is `agent.id`, which `rip workspace load` prints beside each agent under Agents and `rip task show` prints beside each agent principal. A bare uuid is never read as a handle. Key ids never appear.

- **Assignee.** A person: the task is for them, and any of their agents may pick it up. An agent: the task is that agent's. It is advisory, not a lock: anyone who can edit tasks may still start it. `--mine` (`assignee=me`) lists tasks for your account with no agent named, tasks assigned to you exactly, and tasks you hold; not a sibling agent's.
- **Reviewer.** A person, an agent, or empty. It must be a current member who can edit tasks in the task's audience, and never the assignee (`INVALID_REVIEWER`). Neither changes while the task is In review (`TASK_IN_REVIEW`).

```bash
rip task add "Draft the launch post" --workspace-id <ws> --assignee agent:<handle> --reviewer alek --kind write-post
rip task add "Reply to each launch mention" --parent-id <id>     # under a task: its workspace is the parent's
rip task update <id> --expected-revision <n> --reviewer agent:<handle>     # title/body/assignee/reviewer/audience
```

### Propose: ask before it goes out

```bash
rip task propose --workspace-id <ws> --title "Reply to @jen" --draft-file reply.txt --verb Post --kind x-reply
rip task propose --workspace-id <ws> --title "Email the investors" --draft-file email.md --verb Send --reviewer alek --link artifact:<publicId>
rip task propose <id> --draft "Thanks Jen, we ship Thursday!"     # on a task that is free or yours, or a new draft for your own proposal
```

- **The draft is the exact text the action uses** (the post, the email body), up to 64,000 characters: `--draft` inline, or `--draft-file`, read verbatim. `--verb` is the approve button's word (at most 24 characters; "Approve" without it). `--link artifact:<publicId>[@version]` or `url:<https://…>` attaches what the reviewer should see (repeatable, up to 50). A new proposal also takes `--body` (context for the reviewer) and `--audience`; under a task, name it with `--parent-id` instead of `--workspace-id` (never both).
- **On an existing task** it works from To do or Doing when the task is free or held by you, and on your own proposal In review, whose draft and verb it replaces. The hold is cleared and you become the assignee. It sets `--kind` only on a task with none (another kind is `INVALID_FIELD`); the title, parent and audience never change. Another agent's proposal is `TASK_IN_REVIEW`.
- **Who reviews it.** The task's reviewer when one is set (naming a different one is `INVALID_REVIEWER`), else your `--reviewer`, else your own person. Never you.
- **The reply.** Usually `status: review` (In review): stop. Do not act, and do not ask in the chat; the person decides in the dashboard. An approved proposal comes back under Waiting on you on a later load; a skipped one is Cancelled, with the reviewer's reason (`rip task show <id>`). A re-proposal bumps the revision, so a decision made on the old draft is refused `CONFLICT`.
- **On its own.** When the proposal goes to your own person and its kind is on your instructions' on-its-own list, it comes back `status: doing`, approved (`decision.byInstructions` names the instructions version) and held by you under a lease: carry it out now. That holds only when your own account gave the task its kind: your own new proposals, tasks your person (or another of their agents) wrote with that kind, and kinds you set on a task that had none. A kind someone else gave a task never approves it on its own.
- **Limits.** At most 200 of your proposals In review per workspace (`TOO_MANY_PROPOSALS`); a task holds at most 100 children.
- **Withdraw** your own proposal with `rip task cancel <id> --reason "…"`. Its proposer, the proposer's person or whoever decides it may; anyone else gets `REVIEW_NOT_YOURS`.

### Carry out what was approved

An approved task is To do (or Doing, when your instructions approved it), with `decision: { outcome: "approved", by, byInstructions, edited }` and `approvedText`: the reviewer's edit when there is one, else the draft. `rip task show <id>` prints it under **Approved text (carry out exactly this)**, with the original draft beside it when the decider edited it (on a Done task the label reads "carried out"; on a Cancelled one, just "Approved text").

```bash
rip task show <id> --json        # data.approvedText: the exact characters to use
rip task done <id> --result-text "4 likes" --link url:https://x.com/acme/status/1
```

- Carry out exactly `approvedText`: not your draft, not a rewording. Take it from `--json`: the human output indents each line and does not show trailing whitespace. Before acting, check you have not already done it (a retry after a timeout must not post twice).
- If it fails, propose again on the same task with what went wrong (`rip task propose <id> --draft …`), or cancel it with the reason.
- An approval is spent once used: reopening a Done task clears the decision.

### Report: work that needed no approval

```bash
rip task report --workspace-id <ws> --title "Sent the weekly digest" --result-text "38% opened" --link url:https://…
rip task report <id> --result-text "12 likes" --link url:https://…      # a later result on a Done task
```

A new report is a task born Done, created and completed by you, with no decision. `--result-text` is what came of it (at most 280 characters); it also takes `--link`, `--kind`, `--body` and `--audience`, and `--parent-id` in place of `--workspace-id` for a report under a task. A later result goes only on a Done task (`TASK_NOT_DONE` otherwise), by any agent that can edit tasks there: `--result-text` replaces the text and `--link` adds links.

### Decide: reviews addressed to you

```bash
rip task list --workspace-id <ws> --reviewer me
rip task show <id>                                                   # the draft, the verb, the revision
rip task decide <id> --approve --expected-revision <n>
rip task decide <id> --approve --expected-revision <n> --edited-draft-file edited.txt
rip task decide <id> --skip --expected-revision <n> --reason "Not this week"
```

- An agent decides only a review whose reviewer is exactly its key. A person's review, an unaddressed one (any person decides those), another agent's, and your own proposal are `REVIEW_NOT_YOURS`, with `Reviewer:` saying whose it is; nothing is written. A person decides theirs in the dashboard, from their own sign-in.
- `--approve` makes it To do, approved; `--edited-draft` (or `--edited-draft-file`) is the text then carried out, stored only when it differs. `--skip` makes it Cancelled, skipped; `--reason` is why.
- `--expected-revision` is the revision you read. A draft replaced since is `CONFLICT` with `currentRevision`: read it again. A task already decided is `TASK_NOT_IN_REVIEW`, with `Decided:` saying by whom.
- Deciding a whole batch at once is dashboard-only; decide each child.

### Instructions and what waits on you

Your person writes **instructions** for you in each workspace, in the dashboard (Members & settings). No agent writes instructions, its own or another's, and there is no CLI command for them. `rip workspace load` prints them first, whole, as `Instructions (v<n>):` with their **On its own** kinds, or "No instructions here yet: your person writes them in the dashboard, Members & settings". A change reaches you on your next load.

Then `Waiting on you (<n>):` lists, in this order, up to 20 tasks for exactly this agent, each with its reason:

| Reason | Means | Next |
|---|---|---|
| `carry out` | approved, for you | `rip task show <id>`, carry out exactly its approved text, `rip task done <id> --result-text "…"` |
| `decide` | a review addressed to you | `rip task decide <id> --approve\|--skip --expected-revision <n>` |
| `do` | To do, for you, nothing decided | start it, or propose it if it acts outside the workspace |

With `--json` they are under `instructions` (`{ version, text, onItsOwn, savedAt }` or null), `waiting.items[]` (each with `waiting: carry_out | decide | do`; the `carry_out` and `do` items, To do or Doing, also appear in `tasks`), `proposals.inReview` (your proposals In review) and `agents.items[]` (principals, each `agent.id` a handle). `task list --mine` and `--reviewer me` read the rest.

### The lifecycle

```
              propose (new)
                  │
todo ──propose──> review ──decide approve──> todo (approved) ──start──> doing ──done──> done
 │ <──stop / lease lapses── doing             │                                          │
 │                                            └─ decide skip ──> cancelled (skipped)     │
 └──done (straight from To do) ───────────────────────────────────────────────────────────┘
report (new) ──> done          todo / doing / review ──cancel──> cancelled
reopen: done and cancelled go back to todo; a skipped proposal still for its agent goes back to review
```

```bash
rip task start <id> --lease-hours 4
rip task start <id>                              # again on long work: renews your lease
rip task stop <id>                               # back to To do
rip task done <id> --result-text "…" --link artifact:q3-memo@2 --link url:https://…
rip task cancel <id> --reason "duplicate"
rip task reopen <id>
```

Every write states `--why "<the person's goal>"` (or `TOKENRIP_WHY`), like any workspace write; without it the server refuses `WHY_REQUIRED`. An In review task refuses start, stop and complete with `TASK_IN_REVIEW`. Reopening always clears the decision; the result text and links stay.

**Old words are gone.** `rip task claim`, `touch`, `release` and `dismiss` are unknown commands, and the old status words (`open`, `claimed`, `dismissed`) are refused: use `start` (it also renews your own hold), `stop` and `cancel`, and `todo`, `doing` and `cancelled`.

### Who holds a task

- **One holder per task, per key.** When an agent starts a task, the hold belongs to that agent's key, not just the account. Two agents of the same person cannot both hold one task: the second gets `TASK_TAKEN`.
- **An agent's hold has a lease**: 0.25–72 hours, default 2. A sweep runs every minute and returns a lapsed hold to To do, so work is never parked by a harness that vanished. Starting your own task again renews the lease, never shorter; advertise the `holder.leaseExpiresAt` that comes back, not the value you asked for.
- **The person's hold has no lease.** When the person starts a task in the dashboard, it stays theirs until they move it. Leave it alone unless they ask.
- **Races resolve at the database.** Two agents starting at once: one wins, the other gets `TASK_TAKEN` with `holder` saying who. Never check-then-start — call `start` and branch on the error.
- A task whose agent lease has lapsed is **free**: anyone may start it (a takeover) or complete it.

### Who can do what

- **Visibility** follows the workspace: internal members see both audiences, external members only `shared`. No access → `WORKSPACE_FORBIDDEN`.
- **Writing** (add, propose, report, start, stop, done, cancel, reopen, update) needs task-write access for the task's audience. A workspace in the trash answers 410 `WORKSPACE_DELETED` to every task call until an admin restores it.
- **Stop** is for the holder. The person may stop any of their own agents' holds, and a workspace admin may stop anyone's; everyone else gets `TASK_TAKEN`.
- Losing access (removed from the workspace or its owning team, downgraded, narrowed out of the audience) stops your holds and clears the assignee and reviewer roles you can no longer fill; a proposal In review keeps its proposer.

### Completing

- `rip task done` completes a task that is **free** (To do, or a lapsed agent hold) or **yours**; you do not need to start it first. Someone else's live hold → `TASK_TAKEN`, and **nothing is saved**: keep your results locally and pick another task, or wait.
- `--result-text "<what came of it>"` (at most 280 characters; given again, it replaces the old text) and `--link artifact:<publicId>[@version]` or `--link url:<https://…>`, repeatable, up to 50; `rip task show` lists them as results. An artifact link must live in the task's workspace and be visible to its audience.
- An artifact result that is in the trash is refused (410 `DELETED`), and `rip task show` leaves out results that are in the trash.
- Reopening keeps the results. Status is the truth, not the result set.

### A task's history

`rip task show <id>` prints the task's latest 30 steps, newest first: when, the action, who, and the why (`(earlier history not shown)` when the list does not reach the task's creation). Task events are also **workspace activity**: `task.created`, `task.proposed`, `task.approved`, `task.skipped`, `task.started`, `task.stopped`, `task.lease_expired`, `task.completed`, `task.reported`, `task.result_added`, `task.cancelled` and `task.reopened` arrive through `rip workspace changes <workspace>` (MCP `workspace_changes`) alongside the workspace's other changes; older rows may still say `task.claimed`, `task.released` or `task.dismissed`, and older `task.created` payloads name the assignee under an earlier key where new ones say `assigneeId`. No event carries a draft or a result's text. The account/team feed below never carries task events.

---

## Activity

An append-only feed of what happened in a team or your own scope: team shares, connection changes, and member removals. Non-consuming — poll it freely.

```bash
rip activity --team quintel
rip activity --team quintel --type connection.created,team.member_removed --since 7
rip activity --actor alek
rip activity --subject <connection-id>
```

Every row carries a sentence rendered server-side, so `--json` and human output tell the same story:

```
alek created connection minimax 12m ago (claude-code)
sam removed alek from the team 2h ago
```

Verbs: `artifact.shared_to_team`, `connection.created`, `connection.disabled`, `credential.created`, `credential.rotated`, `team.member_removed` (older rows may read `connection.rotated`). `--subject <id>` narrows the feed to one subject: the id a row ends with (a connection's, a credential's), or an artifact's id or alias, with no type prefix. An artifact deleted forever has no id; its row keeps its title. Task history is not here; read it with `rip workspace changes <workspace>`.

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
| `WORKSPACE_REQUIRED` | `task list` / `task add` / a new `task propose` or `task report` need `--workspace-id` — every task lives in a workspace |
| `WORKSPACE_FORBIDDEN` | You have no access to the workspace or the task's audience, or no task-write access |
| `WORKSPACE_DELETED` | The workspace is in the trash; a workspace admin can `rip trash restore <id>` |
| `TASK_TAKEN` | Someone else is working on it. `holder` (printed as `Held by: …`) says who and until when — pick another task or wait. Nothing was saved |
| `TASK_IN_REVIEW` | The task waits for a decision: start, stop and complete are refused, and its assignee and reviewer stay put (a skipped proposal's too). Your own proposal: stop; once approved, a later load shows it under Waiting on you. Someone else's (proposing on another agent's proposal is refused the same way): leave it to its reviewer |
| `TASK_NOT_IN_REVIEW` | Nothing to decide: `Decided:` (`details.decision`) says who decided it and when, `Status:` where it is now. `rip task show <id>` |
| `REVIEW_NOT_YOURS` | Not addressed to you: `Reviewer:` (`details.reviewer`; null is any person who can edit tasks) says who decides it. Decide only what `--reviewer me` lists; nothing was written |
| `INVALID_REVIEWER` | The reviewer must be a member who can edit tasks in the audience, never the assignee or you. When the task already names one (`details.reviewer`), omit `--reviewer` or name that one; if it names you, ask whoever set it to change it |
| `TOO_MANY_PROPOSALS` | 200 of your proposals are In review in this workspace: wait for decisions, or withdraw some with `rip task cancel`, before proposing more |
| `TASK_NOT_DONE` | A later result (`rip task report <id>`) goes on a Done task; finish this one with `rip task done <id> --result-text "…"` |
| `CONFLICT` | On `decide`: the draft changed since you read it (`currentRevision`). Read it again before deciding. On `update`: re-read and retry |
| `PRECONDITION_REQUIRED` | `decide` and `update` need `--expected-revision` |
| `TASK_NOT_STARTED` | `stop` on a task that is not Doing (or your lease already lapsed). `rip task show <id>` |
| `TASK_CLOSED` | The task is cancelled (or, for `start`, done). Reopen it first if the work is still wanted |
| `TASK_ALREADY_DONE` / `TASK_NOT_CLOSED` | Already done (reopen first) / only done or cancelled tasks reopen. `rip task show <id>` |
| `INVALID_ASSIGNEE` | The `--assignee` is not a member who can edit tasks in the task's audience, or an `agent:<handle>` that is unknown here or revoked |
| `INVALID_FIELD` | A draft over 64,000 characters, a verb over 24, a result over 280, a kind not matching the grammar, a kind other than the task's, an edited draft on a task without a draft, or a parent outside the workspace (or with 100 children). `field` says which |
| `INVALID_CURSOR` | Cursors are opaque — re-run the query rather than editing the value |
| `INVALID_FIELD` on `--since` | `--since 0`, a negative, and a unix timestamp are all rejected. Use a positive number of days or an ISO-8601 timestamp |
