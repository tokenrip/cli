# Workspaces

An owned namespace (yours or a team's) for native **notes** plus **included primitives**. Use the `rip workspace` command group (aliased **`rip ws`**). Return to [SKILL.md](../SKILL.md) for the top-level decision trees.

A **workspace** holds two things:

1. **Native notes** you write directly in Tokenrip — capture, search, link, and (optionally) promote through a maturity ladder.
2. **Included primitives** — existing artifacts (a table is an artifact) that you either **own** into the workspace (it becomes their home; deleting the workspace destroys them) or **link** as references (deleting the workspace only unfiles them).

Think of it as the folder's more capable sibling: a folder organizes artifacts; a workspace also has content of its own and a membership model.

## When to use

- "capture this idea" / "drop a note" → `rip workspace capture`
- "search my notes" → `rip workspace search`
- "group these artifacts" → `rip workspace item link` / `item add --ownership owned`
- "share this workspace with X" → `rip workspace member add`
- "link note A to note B" → `rip workspace link add`
- "what should I consolidate?" → `rip workspace worklist`
- "promote this note's maturity" → `rip workspace note promote`
- "archive / restore / delete a note" → `rip workspace note archive` / `note unarchive` / `note delete`

## Create + capture

```bash
rip workspace create research --name "Research" [--description <text>] [--team <slug>]
rip workspace capture research "PostgreSQL websearch_to_tsquery handles phrases and negation"
rip workspace search research "tsquery"          # full-text search over note bodies
rip workspace list
rip workspace show research
```

Note slugs are date-prefixed (`YYYY-MM-DD-<kebab-title>`), with a numeric suffix on same-day collisions.

## Include an artifact (own vs link)

```bash
rip workspace item link research <artifact-public-id>                    # reference (persists on delete)
rip workspace item add research <artifact-public-id> --ownership owned   # move in (destroyed on delete)
rip workspace item list research
rip workspace item remove research <artifact-public-id>                  # only unfiles; never destroys a linked artifact
```

At most **one** workspace can *own* a given artifact (409 `ALREADY_OWNED` otherwise); any number can *link* it.

## Structured notes + links

```bash
rip workspace note set research --title "Quarterly goals" --body "Ship Slice 1"   # create
rip workspace note set research --title "Atom" --body "..." --source-artifact <publicId>   # create as an atom of a source (create only)
rip workspace note set research --slug 2026-05-29-quarterly-goals --body "..."     # update by slug
rip workspace note get research 2026-05-29-quarterly-goals
rip workspace note list research                              # active notes (archived hidden)
rip workspace note list research --archived                   # only archived (--include-archived for both)
rip workspace note archive research <slug>                    # hide from the default list
rip workspace note unarchive research <slug>                  # restore it
rip workspace note delete research <slug>                     # permanent (also removes its links)
rip workspace link add research 2026-05-29-quarterly-goals 2026-05-29-okrs --relation refines
rip workspace link list research 2026-05-29-quarterly-goals
```

Each note tracks how many notes link *to* it (`backlinkCount`). **Archiving** hides a note from the default list and the agent's eager `agent_load` tiers without deleting it — list it back with `--archived` and restore with `note unarchive`.

`--source-artifact <publicId>` is a **create-only** flag: it records the note as an *atom* of that source artifact (the atom→source link). It can't be changed on update. Use it when a note distils one source — `note list research --source-artifact <publicId>` then lists only the atoms of that source.

## Members and roles

```bash
rip workspace member add research rip1<account-id> --role editor
rip workspace member list research
rip workspace member remove research rip1<account-id>
```

The member argument accepts an account id, an alias, or one of your saved contact labels.

| Role | Can |
|---|---|
| `viewer` | Read and search notes and items |
| `editor` | …plus write notes and add/remove items |
| `admin` | …plus manage members, archive, and delete |

An artifact you **include** becomes reachable by the workspace's members (the same way team-shared artifacts work). Team-owned workspaces grant every team member admin-equivalent access automatically.

## Maturity + consolidation (when configured)

These apply only when a workspace has a **maturity ladder** — most often an agent's *memory* workspace (see below). The platform enforces only the mechanics; what a state means ("evergreen") is the brain's job.

```bash
rip workspace note set research --slug <slug> --maturity seedling   # set/validate a maturity state
rip workspace note promote research <slug>                          # advance ONE step, gated by the promotion rule
rip workspace worklist research                                     # consolidation candidates
rip workspace worklist research --stale-capture-days 14 --stale-top-tier-days 60
```

- Promotion advances exactly one step along the configured order; a `min-backlinks-N` rule requires the note to have ≥ N backlinks first (else `PROMOTION_BLOCKED`).
- `worklist` returns four candidate sets for the consolidation/absorb ritual: **staleCaptures**, **orphans** (no backlinks), **promotionCandidates**, **staleTopTier**. It's a read — the harness (not the backend) decides what to do with them, using the write tools above (`note set` / `note promote` / `link add` / archive).
- When the workspace is a **brain**, `worklist` also returns brain candidate-sets (all brain-membership-scoped): **unAtomizedSources** (source artifacts with no atoms yet, ranked by retrieval hotness), **staleAtomSources** (sources whose atoms have drifted from the current source version), **recurringSignals** (signals that keep resurfacing and may deserve a note), and **pendingInbox** (staged items awaiting an editor — editor-gated). These feed the `atomize` / `consolidate` rituals above.

## Delete

```bash
rip workspace delete research   # destroys OWNED items, unfiles LINKED ones; notes, links, members go too
```

Deleting a workspace is one clean operation: owned items are destroyed (storage reclaimed), linked items are merely unfiled, and all native notes/links/membership are removed.

## Agent memory (imprint authors)

An imprint manifest can declare a `workspace` block and bind a workspace to a mount as the agent's **living memory** — auto-provisioned on first load, surfaced in `agent_load` as an eager working-set plus a lazy index, with the maturity ladder and `worklist` driving a scheduled consolidation ritual. That binding is opt-in and changes nothing about the direct CLI usage above. See `docs/architecture/workspaces.md` for the full model.

## Sharing between agents (workspace bindings)

An imprint can also declare named `workspaceBindings[]` slots for **shared** workspaces it consumes (`access: read`) or produces (`access: read-write`) — the cross-agent pipeline primitive. The operator wires each slot to a concrete workspace per mount:

```bash
rip workspace create demand-hub --name "Demand Hub"          # the shared hub (outlives every mount)
rip agent mount researcher --workspace output=demand-hub     # producer binds at mount time
rip agent mount-workspace <mount-id> research=demand-hub     # consumer binds post-mount
```

On load the agent gets an index of each bound workspace (no bodies — fetch via `workspace note get`/`search`) and a report of unbound/broken slots. Cross-account: the hub owner grants membership first (`rip workspace member add … --role viewer|editor`), then the consumer binds by workspace **id**. During a session, always pass the session token on workspace writes — `read` slots reject the agent's own session writes (`WORKSPACE_BINDING_READ_ONLY`). Notes written in a session carry provenance (`sourceImprintSlug`, `sourceMountId`).

## Brains (shared memory)

A **brain** is a workspace with semantic search on plus a **write policy** (an intake gate). Use `rip brain` (alias **`rip br`**) — a thin facade over the same service. Reach for a brain over a plain workspace when multiple agents must **recall** shared knowledge before acting, not just store it.

Set up shared cross-agent memory?
  → `rip brain create <slug> [--team <slug>] [--instructions <alias>] [--write-policy open|gate-editors|gate-all] [--atomize-playbook <alias>] [--consolidate-playbook <alias>]`

Orient before working (instructions + working set + index)?
  → `rip brain load <brain>`

Run a refinement ritual (atomize raw sources / consolidate the note spine)?
  → `rip brain load <brain> --command <atomize|consolidate>`   # loads the playbook as the envelope's `flow` block
  → `rip brain consolidate <brain>` / `rip brain atomize <brain>`   # shortcuts for the two commands

Recall before deciding / drafting / quoting a figure?
  → `rip brain search <brain> "<query>" [--mode hybrid|keyword|semantic] [--include-superseded] [--expand <n>]`

Deposit a fact / decision / finding?
  → `rip brain capture <brain> --content "<text>" [--title "..."] [--zone signal|doctrine|output] [--supersedes <slug>] [--mode sync|async]`

Review what's staged (editor+)?
  → `rip brain inbox <brain>`

Admit / discard / fold a staged item (editor+)?
  → `rip brain inbox-resolve <brain> <item> accept|reject|merge [--target <slug>]`

Three things to get right:
- **Branch on the search discriminator.** Hits carry `kind: "note"` (+ `slug`) for curated notes, or `type: "artifact"` for raw source chunks.
- **Roles + intake.** A brain adds a **`contributor`** tier *between* viewer and editor (the role table above is viewer/editor/admin only). `capture` needs ≥ contributor, and under a gated `--write-policy` a contributor's capture **stages into the inbox** (not live). `--zone` (default `doctrine`) sets recall weighting; `--supersedes` retires a prior note.
- **Fan-out is MCP-only.** `brain_search` with no brain searches every brain attached to your session; the CLI always takes an explicit `<brain>`.

**Refinement playbooks.** `--command atomize|consolidate` swaps that command's playbook into the load envelope's `flow` block so a spine agent runs the ritual. By default the command resolves a built-in playbook; pin a per-brain override at creation with `--atomize-playbook <alias>` / `--consolidate-playbook <alias>` (artifact alias/id) when a brain needs its own house rules.

Members, roles, slug scoping, and `--json` are exactly as above — a brain is a workspace.

## Notes

- **Slugs are scoped.** A workspace slug resolves by precedence: your own workspaces → your teams' → ones you're an explicit member of. If a slug is ambiguous across those (rare — e.g. you're a member of two `research` workspaces), the CLI returns `AMBIGUOUS_WORKSPACE_SLUG`; use the workspace **id** instead.
- Add `--json` (or `TOKENRIP_OUTPUT=json`) for machine-readable output.
- Workspaces work identically across the CLI (`rip workspace …`), the MCP `workspace_*` tools, and the REST API (`/v0/workspaces`).
