# Agent Architecture

Agents are Tokenrip-hosted instructions + memory schemas that compatible model harnesses load and run. Tokenrip stores brain artifacts, memory, sessions, and artifacts; the user's model performs inference. Return to [SKILL.md](../SKILL.md) for decision trees and workflows.

## Publishing tiers

- **Tier 1** (anyone): `rip agent publish <manifest.json>` — personal or team (`--team <slug>`)
- **Tier 2** (public listing on `/agents`): add `--publish` — requires an approved Publisher

Apply for Publisher: `rip publisher apply --display-name "..." --email "..."`. Tokenrip approves out-of-band. One Publisher per account and one per team.

## Mounts

A *mount* is one deployment of an agent. Personal mounts are owned by one operator; team mounts are collaborative. Mounts are lazy-created on first `agent load` — only create explicit mounts when you need a second mount or a friendly name.

```bash
rip agent mount <slug>                                    # personal mount
rip agent mount <slug> --team <slug> --name engineering   # team mount with name
rip agent mount <slug> --context-from ./context.md        # mount with initial context
rip agent mounts                                          # list your mounts
rip agent show-mount <mount-id>                           # inspect: agent version, context, layers
rip agent mount-artifacts <mount-id>                      # every artifact the mount touches
rip agent mount-rename <mount-id> <new-name>              # rename
rip agent unmount <mount-id>                              # destroy mount + memory (irreversible)
```

## Template agents (per-mount context)

Template agents use `mountIntake.starterArtifactAlias` in the manifest. Each mount gets its own context document cloned from a starter artifact. The operator fills in sections and the brain reads it on every load (rendered as `<mount-context>` in the system prompt).

```json
{
  "slug": "blog-writing",
  "mountIntake": { "starterArtifactAlias": "blog-writing-context-starter" }
}
```

The starter artifact uses section headings as questions and HTML comments as prompts:

```markdown
# Blog Context

## Theme
<!-- What is this blog about? One sentence. -->

## Voice
<!-- 3–5 adjectives that describe how posts should sound. -->
```

Manage mount context:

```bash
rip agent mount-context <mount-id>                        # print context
rip agent mount-context <mount-id> --edit                 # edit in $EDITOR
rip agent mount-context <mount-id> --from-file ./ctx.md   # replace from file
```

The brain receives `<mount-context is-empty="true"/>` when the operator hasn't filled it in — design brains that degrade gracefully.

## The four memory layers

Loading a session compiles four layers:

| Layer | Scope | Owner | When active |
|---|---|---|---|
| Brain | — | Agent owner | Always |
| Shared memory | `shared` | Agent owner | Always |
| Team memory | `team` | Mount (partitioned by `mount_id`) | Team mounts only |
| Private memory | `operator-private` | Mount + operator | Always |

Two team mounts of the same agent have separate team-memory partitions.

### Memory primitives

- **`memoryCollections[]`** — schema-bound rows for structured records (commitments, patterns, decisions). Queryable, filterable. Scopes: `shared`, `team`, `operator-private`.
- **`memoryArtifacts[]`** — versioned narrative documents the agent rewrites holistically. For evolving understanding (operator profile, team context). Bounded by `maxBytes` and `rewriteRateLimit.perSessionMax`.

Team and operator-private materialization happens at first mount load, not at publish time.

## Session lifecycle

Drive a tracked session against a published agent (used by the `/tokenrip` bootloader):

```bash
rip --json agent load <slug> [--team <slug>]              # start session → token + brain envelope
rip --json agent record <token> --row '<json>'            # record a memory row
rip --json agent rewrite-artifact <token> <alias> --content-from <file>  # rewrite memory artifact
rip --json agent end <token> --summary "..."              # end session
```

Session commands always emit JSON. Add `--output-from <file> --output-title "..."` to `end` to publish a session output.

## Publishing an agent (full workflow)

```bash
# 1. Create a folder for brain artifacts
rip folder create office-hours

# 2. Publish brain artifacts
rip artifact publish brain/soul.md --type markdown --alias oh-soul --title "Soul" --folder office-hours
rip artifact publish brain/flow.md --type markdown --alias oh-flow --title "Flow" --folder office-hours

# 3. Publish the agent manifest
rip agent publish manifest.json --team acme

# 4. For public listing (requires approved Publisher)
rip agent publish manifest.json --publish --featured 10
```

Agent versioning: `rip agent publish` prints `Published <slug> as v<N>`. Mounts capture `agentVersionAtCreate` to flag version drift.

## Tools and workflow collections

Agents declare `tools[]` for external I/O and `workflowCollections[]` for tracking external state.

Tool types: `email-outbound`, `email-inbound`, `notify-slack`, `pdf-generate`. Execution modes: `backend`, `harness`, `harness-aliased`, `auto`. The brain calls `agent_tool_execute` (server-side) or `agent_tool_submit` (harness-produced results). Workflow collections use `mount-shared` scope.

## Cross-session references

Active only on team mounts. The brain receives flagged/recent items from other team members' private memory (paraphrased, never quoted verbatim). Solo mounts get `crossSessionReferences: { active: false, reasonInactive: "no-team" }`.

## `teamContext` signaling

Optional manifest field for honest signaling:

- `ignored` — no team-scope memory; solo and team deployments behave identically
- `supported` — team layer activates only with a team; both deployments work
- `recommended` — same as `supported`, plus discovery hints "best deployed with a team"

## Generic bootloader

Install once, run any published agent with `/tokenrip <slug>`:

```bash
mkdir -p .claude/commands
curl -fsSL https://api.tokenrip.com/skills/tokenrip-bootloader.md \
  > .claude/commands/tokenrip.md
```

The bootloader auto-installs the CLI, registers an account if missing, calls `agent load`, and drives the session lifecycle.
