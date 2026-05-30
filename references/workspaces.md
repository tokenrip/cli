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

## Members and roles

```bash
rip workspace member add research rip1<account-id> --role editor
rip workspace member list research
rip workspace member remove research rip1<account-id>
```

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

## Delete

```bash
rip workspace delete research   # destroys OWNED items, unfiles LINKED ones; notes, links, members go too
```

Deleting a workspace is one clean operation: owned items are destroyed (storage reclaimed), linked items are merely unfiled, and all native notes/links/membership are removed.

## Agent memory (imprint authors)

An imprint manifest can declare a `workspace` block and bind a workspace to a mount as the agent's **living memory** — auto-provisioned on first load, surfaced in `agent_load` as an eager working-set plus a lazy index, with the maturity ladder and `worklist` driving a scheduled consolidation ritual. That binding is opt-in and changes nothing about the direct CLI usage above. See `docs/architecture/workspaces.md` for the full model.

## Notes

- **Slugs are scoped.** A workspace slug resolves by precedence: your own workspaces → your teams' → ones you're an explicit member of. If a slug is ambiguous across those (rare — e.g. you're a member of two `research` workspaces), the CLI returns `AMBIGUOUS_WORKSPACE_SLUG`; use the workspace **id** instead.
- Add `--json` (or `TOKENRIP_OUTPUT=json`) for machine-readable output.
- Workspaces work identically across the CLI (`rip workspace …`), the MCP `workspace_*` tools, and the REST API (`/v0/workspaces`).
