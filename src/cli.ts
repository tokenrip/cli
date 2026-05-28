#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { configSetKey, configSetUrl, configShow } from './commands/config.js';
import { upload } from './commands/upload.js';
import { publish } from './commands/publish.js';
import { status } from './commands/status.js';
import { deleteArtifact } from './commands/delete.js';
import { archiveArtifact, unarchiveArtifact } from './commands/archive.js';
import { star, unstar, starred } from './commands/star.js';
import { forkArtifact } from './commands/fork.js';
import { update } from './commands/update.js';
import { deleteVersion } from './commands/delete-version.js';
import { stats } from './commands/stats.js';
import { share } from './commands/share.js';
import { artifactGet } from './commands/artifact-get.js';
import { artifactInspect } from './commands/artifact-inspect.js';
import { mountInspect } from './commands/mount-inspect.js';
import { surfacePublish, surfaceUpdate, surfaceList, surfaceGet, surfaceValidate, surfacePromote, surfaceOpen, surfaceRevisions, surfaceRestore, surfaceDelete } from './commands/surface.js';
import { artifactDownload } from './commands/artifact-download.js';
import { artifactCat } from './commands/artifact-cat.js';
import { artifactVersions } from './commands/artifact-versions.js';
import { artifactDiff } from './commands/artifact-diff.js';
import { artifactComment, artifactComments } from './commands/artifact-comments.js';
import { patch } from './commands/patch.js';
import { agentArtifacts, agentDelete, agentEnd, agentFork, agentList, agentLoad, agentMount, agentMountArtifacts, agentMountContext, agentMountRename, agentMounts, agentPublish, agentPublishToggle, agentRecord, agentRewriteArtifact, agentSetDisplay, agentSetFeatured, agentShow, agentShowMount, agentToolExecute, agentToolSubmit, agentUnmount, agentUnpublish, agentValidate } from './commands/agent.js';
import { mountTableList, mountTableRows, mountTableLatest, mountTableByTag, mountTablePatch } from './commands/mount-table.js';
import { adminAgentList, adminAgentSessions, adminAgentSetFeatured, adminAgentShow, adminAgentUnpublish } from './commands/admin-agent.js';
import { tour, tourNext, tourRestart } from './commands/tour.js';
import { wrapCommand, setForceJson, setConfigHuman, outputSuccess } from './output.js';
import { loadConfig } from './config.js';
import { runMigrations } from './migrations.js';
import { checkForUpdate } from './update-check.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();
program
  .name('rip')
  .description('Tokenrip — The collaboration layer for agents and operators')
  .version(version)
  .option('--json', 'Use JSON output instead of human-readable')
  .option('--agent <name>', 'Use a specific agent identity for this command')
  .hook('preAction', async (thisCommand) => {
    if (program.opts().json) setForceJson(true);
    const opts = thisCommand.optsWithGlobals();
    if (opts.agent) {
      const { setAgentOverride } = await import('./identities.js');
      setAgentOverride(opts.agent);
    }
  });

// ── artifact commands ──────────────────────────────────────────────────
const artifact = program
  .command('artifact')
  .alias('art')
  .description('Create, manage, and inspect artifacts');

artifact
  .command('upload')
  .argument('<file>', 'File path to upload (PDF, image, document, etc.)')
  .option('--title <title>', 'Display title for the artifact')
  .option('--parent <uuid>', 'Parent artifact ID for lineage tracking')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--refs <urls>', 'Comma-separated input reference URLs')
  .option('--team <slugs>', 'Comma-separated team slugs to share this artifact with')
  .option('--folder <slug>', 'File into folder')
  .option('--dry-run', 'Validate inputs without uploading')
  .description('Upload a file and get a shareable link')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact upload report.pdf --title "Agent Analysis"
  $ rip artifact upload chart.png --context "Claude Agent 1" \\
    --refs "https://source.example.com,https://another.com"
`)
  .action(wrapCommand(upload));

artifact
  .command('publish')
  .argument('[file]', 'File containing the content to publish (omit if using --content)')
  .requiredOption('--type <type>', 'Content type: markdown, html, chart, code, text, json, csv, or table')
  .option('--title <title>', 'Display title for the artifact')
  .option('--content <string>', 'Inline content to publish (alternative to a file; requires --title)')
  .option('--alias <alias>', 'Human-readable alias for the artifact URL')
  .option('--parent <uuid>', 'Parent artifact ID for lineage tracking')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--refs <urls>', 'Comma-separated input reference URLs')
  .option('--schema <json>', 'Column schema JSON (for tables, or to type CSV columns on import)')
  .option('--headers', 'CSV has a header row — use it for column names (pairs with --from-csv)')
  .option('--from-csv', 'Parse the file as CSV and populate a new table (pairs with --type table)')
  .option('--team <slugs>', 'Comma-separated team slugs to share this artifact with')
  .option('--folder <slug>', 'File into folder')
  .option('--metadata <json>', 'Arbitrary metadata JSON object (merged into artifact metadata)')
  .option('--star', 'Star the artifact immediately after publishing')
  .option('--dry-run', 'Validate inputs without publishing')
  .description('Publish structured content with rich rendering support')
  .addHelpText('after', `
CONTENT TYPES:
  markdown   - Rendered markdown with formatting
  html       - Custom HTML rendering
  chart      - JSON chart/visualization data
  code       - Code snippets with syntax highlighting
  text       - Plain text
  json       - Interactive JSON viewer with collapse/expand
  csv        - Versioned CSV file, rendered as a table
  table      - Structured data table with row-level API (requires --schema or --from-csv)

EXAMPLES:
  $ rip artifact publish analysis.md --type markdown --title "Summary"
  $ rip artifact publish data.json --type chart \\
    --context "Data viz agent" --refs "https://api.example.com"
  $ rip artifact publish data.csv --type csv --title "Q1 leads"
  $ rip artifact publish schema.json --type table --title "Research"
  $ rip artifact publish --type table --title "Research" \\
    --schema '[{"name":"company","type":"text"},{"name":"signal","type":"text"}]'
  $ rip artifact publish leads.csv --type table --from-csv --headers \\
    --title "Leads from CSV"
`)
  .action(wrapCommand(publish));

artifact
  .command('list')
  .option('--since <iso-date>', 'Only show artifacts modified after this timestamp (ISO 8601)')
  .option('--limit <n>', 'Maximum number of artifacts to return (default: 20)', '20')
  .option('--type <type>', 'Filter by artifact type (markdown, html, chart, code, text, file)')
  .option('--archived', 'Show only archived artifacts')
  .option('--include-archived', 'Include archived artifacts alongside active ones')
  .option('--folder <slug>', 'Filter by folder')
  .option('--unfiled', 'Show only unfiled artifacts')
  .option('--team <slug>', 'Filter to team artifacts')
  .description('List your published artifacts and their metadata')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact list
  $ rip artifact list --since 2026-03-30T00:00:00Z
  $ rip artifact list --type markdown --limit 5
  $ rip artifact list --archived
  $ rip artifact list --include-archived
  $ rip artifact list --folder reports
  $ rip artifact list --unfiled
  $ rip artifact list --team acme
  $ rip artifact list --team acme --folder reports
`)
  .action(wrapCommand(status));

artifact
  .command('delete')
  .argument('<identifier>', 'Artifact UUID, alias, or full URL (https://tokenrip.com/s/...)')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .description('Permanently delete an artifact and its shareable link')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact delete 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact delete my-alias
  $ rip artifact delete https://tokenrip.com/s/my-alias

CAUTION:
  This permanently removes the artifact and its shareable link.
  This action cannot be undone.
`)
  .action(wrapCommand(deleteArtifact));

artifact
  .command('archive')
  .argument('<identifier>', 'Artifact UUID, alias, or full URL (https://tokenrip.com/s/...)')
  .description('Archive an artifact (hidden from listings but still accessible by ID)')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact archive 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact archive my-alias
  $ rip artifact archive https://tokenrip.com/s/my-alias

  Archived artifacts are hidden from listings and searches by default,
  but remain accessible by ID and can be unarchived at any time.
`)
  .action(wrapCommand(archiveArtifact));

artifact
  .command('unarchive')
  .argument('<identifier>', 'Artifact UUID, alias, or full URL (https://tokenrip.com/s/...)')
  .description('Unarchive an artifact, restoring it to published state')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact unarchive 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact unarchive my-alias
`)
  .action(wrapCommand(unarchiveArtifact));

artifact
  .command('star')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .description('Star an artifact — pins it to your dashboard')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact star 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact star my-alias
  $ rip artifact star '~alice/dashboard'
`)
  .action(wrapCommand(star));

artifact
  .command('unstar')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .description('Unstar an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact unstar 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact unstar my-alias
`)
  .action(wrapCommand(unstar));

artifact
  .command('starred')
  .option('--since <iso>', 'Only return stars created after this ISO 8601 timestamp')
  .option('--limit <n>', 'Maximum number of items to return', '100')
  .description('List your starred artifacts (newest-starred first)')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact starred
  $ rip artifact starred --limit 20
  $ rip artifact starred --since 2026-04-01T00:00:00Z
`)
  .action(wrapCommand(starred));

artifact
  .command('fork')
  .argument('<identifier>', 'Artifact public ID, alias, or scoped alias (~owner/alias) to fork')
  .option('--version <versionId>', 'Fork a specific version (defaults to latest)')
  .option('--title <title>', 'Title for the forked artifact (defaults to original)')
  .option('--folder <folder>', 'Folder slug to file the fork into')
  .description('Create your own copy of an existing artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact fork 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact fork my-skill --title "My Custom Skill"
  $ rip artifact fork '~alice/dashboard' --title "My Dashboard"
  $ rip artifact fork 550e8400 --version abc123 --folder tools
`)
  .action(wrapCommand(forkArtifact));

artifact
  .command('update')
  .argument('<uuid>', 'Artifact public ID')
  .argument('<file>', 'File containing the new version content')
  .option('--type <type>', 'Content type (markdown, html, chart, code, text, json, csv) — omit for binary file upload')
  .option('--description <text>', 'Version description')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--dry-run', 'Validate without publishing')
  .description('Publish a new version of an existing artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact update 550e8400-... report-v2.md --type markdown
  $ rip artifact update 550e8400-... chart.png --description "with axes fixed"
`)
  .action(wrapCommand(update));

artifact
  .command('delete-version')
  .argument('<uuid>', 'Artifact ID')
  .argument('<versionId>', 'Version ID to delete')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .description('Delete a specific version of an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact delete-version 550e8400-... 660f9500-...

CAUTION:
  This permanently removes the version content.
  Cannot delete the last remaining version — delete the artifact instead.
`)
  .action(wrapCommand(deleteVersion));

artifact
  .command('share')
  .argument('<uuid>', 'Artifact public ID to generate a share link for')
  .option('--comment-only', 'Only allow commenting (no version creation)')
  .option('--expires <duration>', 'Token expiry: 30m, 1h, 7d, 30d, etc.')
  .option('--for <agentId>', 'Restrict token to a specific agent (rip1...)')
  .description('Generate a shareable link with scoped permissions')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact share 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact share 550e8400-... --comment-only --expires 7d
  $ rip artifact share 550e8400-... --for rip1x9a2f...
`)
  .action(wrapCommand(share));

artifact
  .command('stats')
  .description('Show storage usage statistics')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact stats

Shows total artifact count and storage bytes broken down by type.
`)
  .action(wrapCommand(stats));

artifact
  .command('get')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .description('View details and permissions for any artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact get 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact get my-alias
  $ rip artifact get '~alice/dashboard'
  $ rip artifact get https://tokenrip.com/s/550e8400-e29b-41d4-a716-446655440000
`)
  .action(wrapCommand(artifactGet));

artifact
  .command('inspect')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .description('SDK-shaped inspection of a text artifact (drives Surface authoring)')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact inspect 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact inspect my-doc
  $ rip --json artifact inspect my-doc

NOTES:
  Wraps GET /v0/operator/artifacts/:publicId/inspect — the same payload the
  inspect_artifact MCP tool returns. Pairs with rip mount inspect for the
  full SDK-shaped surface needed to draft a tokenrip Surface (no raw
  /v0/... URLs surface to the caller).
  Only valid for text-supporting types (markdown, html, code, text, json);
  other types return INVALID_ARTIFACT_TYPE.
`)
  .action(wrapCommand(artifactInspect));

artifact
  .command('download')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--output <path>', 'Output file path (default: <uuid>.<ext> in current directory)')
  .option('--version <versionId>', 'Download a specific version')
  .option('--format <format>', 'Export format for tables: csv or json (default: csv)')
  .description('Download artifact content to a local file')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact download 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact download 550e8400-... --output ./report.pdf
  $ rip artifact download 550e8400-... --version abc123
  $ rip artifact download 550e8400-... --format json
`)
  .action(wrapCommand(artifactDownload));

artifact
  .command('cat')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--version <versionId>', 'Output a specific version')
  .description('Print artifact content to stdout')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact cat 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact cat my-post
  $ rip artifact cat '~alice/dashboard'
  $ rip artifact cat my-post --version abc123
  $ rip artifact cat my-post | head -20
`)
  .action(wrapCommand(artifactCat));

artifact
  .command('versions')
  .argument('<uuid>', 'Artifact UUID or full URL')
  .option('--version <versionId>', 'Get metadata for a specific version')
  .description('List versions of an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact versions 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact versions 550e8400-... --version abc123
`)
  .action(wrapCommand(artifactVersions));

artifact
  .command('diff')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--version <versionId>', 'Diff a specific version (default: current version)')
  .description('Show what changed in a version vs. the previous version')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact diff 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact diff my-alias --version abc123
`)
  .action(wrapCommand(artifactDiff));

artifact
  .command('comment')
  .argument('<uuid>', 'Artifact UUID or full URL')
  .argument('<message>', 'Comment text')
  .option('--intent <intent>', 'Message intent: propose, accept, reject, inform, request')
  .option('--type <type>', 'Message type')
  .option('--version-id <uuid>', 'Artifact version this comment refers to')
  .description('Post a comment on an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact comment 550e8400-... "Looks good, approved"
  $ rip artifact comment 550e8400-... "Needs revision" --intent reject
`)
  .action(wrapCommand(artifactComment));

artifact
  .command('comments')
  .argument('<uuid>', 'Artifact UUID or full URL')
  .option('--since <sequence>', 'Show messages after this sequence number')
  .option('--limit <n>', 'Max messages to return')
  .description('List comments on an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact comments 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact comments 550e8400-... --since 5 --limit 10
`)
  .action(wrapCommand(artifactComments));

artifact
  .command('move')
  .argument('<uuid>', 'Artifact UUID')
  .option('--folder <slug>', 'Target folder slug')
  .option('--team <slug>', 'Target team (for team folders)')
  .option('--unfiled', 'Remove from current folder')
  .description('Move an artifact into a folder or unfile it')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact move 550e8400-... --folder reports
  $ rip artifact move 550e8400-... --folder research --team my-team
  $ rip artifact move 550e8400-... --unfiled

NOTES:
  Returns FOLDER_LOCKED (HTTP 409) for moves into or out of system-managed
  agent or mount folders — agent package contents and mount-materialized
  artifacts are managed by the platform.
`)
  .action(wrapCommand(async (uuid, options) => {
    const { artifactMove } = await import('./commands/folder.js');
    await artifactMove(uuid, options);
  }));

artifact
  .command('bulk')
  .argument('<action>', 'Bulk action: move, archive, or delete')
  .requiredOption('--ids <csv>', 'Comma-separated artifact identifiers (UUID, alias, or URL)')
  .option('--folder <slug>', 'Target folder slug (for move)')
  .option('--team <slug>', 'Target team for the folder (for move into a team folder)')
  .option('--unfiled', 'Unfile the artifacts (for move)')
  .description('Move, archive, or delete many artifacts in one call')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact bulk move --ids "id1,id2,id3" --folder reports
  $ rip artifact bulk move --ids "id1,id2" --folder research --team my-team
  $ rip artifact bulk move --ids "id1,id2" --unfiled
  $ rip artifact bulk archive --ids "id1,id2,id3"
  $ rip artifact bulk delete --ids "id1,id2"

CAUTION:
  The "delete" action permanently destroys every listed artifact and its
  shareable link. This action cannot be undone. Up to 200 ids per call.
`)
  .action(wrapCommand(async (action, options) => {
    const { artifactBulk } = await import('./commands/bulk.js');
    await artifactBulk(action, options);
  }));

artifact
  .command('patch')
  .argument('<identifier>', 'Artifact UUID or alias')
  .option('--metadata <json>', 'Metadata JSON object (replaces existing metadata)')
  .option('--alias <alias>', 'New alias for the artifact')
  .option('--title <title>', 'New title for the artifact')
  .option('--description <description>', 'New description for the artifact (empty string clears it)')
  .description('Update artifact metadata and/or alias without creating a new version')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact patch 550e8400-... --metadata '{"tags":["ai","agents"]}'
  $ rip artifact patch my-post --alias new-slug
  $ rip artifact patch my-post --metadata '{"featured":true}' --alias new-slug
  $ rip artifact patch my-post --title "New Title"
  $ rip artifact patch my-post --description "A helpful description"
`)
  .action(wrapCommand(patch));

// ── table commands ──────────────────────────────────────────────────
const table = program
  .command('table')
  .description('Manage table rows (append, list, update, delete)');

table
  .command('append')
  .argument('<uuid>', 'Table artifact public ID')
  .option('--data <json>', 'Row data as inline JSON (single object or array)')
  .option('--file <path>', 'Path to JSON file with row data (object or array)')
  .description('Append one or more rows to a table (max 1000 per call)')
  .addHelpText('after', `
EXAMPLES:
  $ rip table append 550e8400-... --data '{"company":"Acme","signal":"API launch"}'
  $ rip table append 550e8400-... --file rows.json

NOTE: Maximum 1000 rows per call. For larger datasets, split into multiple calls.
`)
  .action(wrapCommand(async (uuid, options) => {
    const { tableAppend } = await import('./commands/table.js');
    await tableAppend(uuid, options);
  }));

table
  .command('rows')
  .argument('<uuid>', 'Table artifact public ID')
  .option('--limit <n>', 'Max rows to return (default: 100, max: 500)')
  .option('--after <rowId>', 'Cursor: show rows after this row ID')
  .option('--sort-by <column>', 'Sort by column name')
  .option('--sort-order <order>', 'Sort direction: asc or desc (default: asc)')
  .option('--filter <key=value...>', 'Filter rows by column value (repeatable)')
  .description('List rows in a table')
  .addHelpText('after', `
EXAMPLES:
  $ rip table rows 550e8400-...
  $ rip table rows 550e8400-... --limit 50
  $ rip table rows 550e8400-... --sort-by discovered_at --sort-order desc
  $ rip table rows 550e8400-... --filter ignored=false --filter action=engage
`)
  .action(wrapCommand(async (uuid, options) => {
    const { tableRows } = await import('./commands/table.js');
    await tableRows(uuid, options);
  }));

table
  .command('update')
  .argument('<uuid>', 'Table artifact public ID')
  .argument('<rowId>', 'Row ID to update')
  .requiredOption('--data <json>', 'Fields to update as JSON (partial merge)')
  .description('Update a single row in a table')
  .addHelpText('after', `
EXAMPLES:
  $ rip table update 550e8400-... 660f9500-... --data '{"relevance":"low"}'
`)
  .action(wrapCommand(async (uuid, rowId, options) => {
    const { tableUpdate } = await import('./commands/table.js');
    await tableUpdate(uuid, rowId, options);
  }));

table
  .command('delete')
  .argument('<uuid>', 'Table artifact public ID')
  .requiredOption('--rows <ids>', 'Comma-separated row IDs to delete')
  .description('Delete rows from a table')
  .addHelpText('after', `
EXAMPLES:
  $ rip table delete 550e8400-... --rows uuid1,uuid2
`)
  .action(wrapCommand(async (uuid, options) => {
    const { tableDelete } = await import('./commands/table.js');
    await tableDelete(uuid, options);
  }));

// ── mount commands (top-level discovery surface) ────────────────────
//
// Operator-facing entry point for the SDK-shaped mount inspection API. Most
// mount lifecycle commands live under `rip agent` (mount/mounts/unmount); this
// top-level `mount` group is for the discovery surface that pairs with the
// `inspect_mount` MCP tool and `rip artifact inspect`.
const mount = program
  .command('mount')
  .description('Inspect mounts (discovery surface for Surface authoring)');

mount
  .command('inspect')
  .argument('<mountId>', 'Mount ID returned by `rip agent mount` or `rip agent mounts`')
  .description('SDK-shaped inspection of a mount and its tables')
  .addHelpText('after', `
EXAMPLES:
  $ rip mount inspect 550e8400-e29b-41d4-a716-446655440000
  $ rip --json mount inspect 550e8400-...

NOTES:
  Wraps GET /v0/operator/mounts/:mountId/inspect — the same payload the
  inspect_mount MCP tool returns. Returns mount metadata + per-table
  schema, ≤5 sample rows, recommended SDK binding, and
  window.tokenrip.tables example snippets. Pairs with
  rip artifact inspect for artifact-backed Surfaces.
`)
  .action(wrapCommand(mountInspect));

// ── surface commands (Surface substrate) ─────────────────────────────
//
// Surfaces are self-contained HTML pages hosted at `/x/<publicId>` that
// call the Tokenrip SDK (`window.tokenrip.surface.*`) to read and write
// bound data sources. All endpoints are owner-only — `requireAuthClient`
// fails fast on missing identity. Pairs with `rip mount inspect` and
// `rip artifact inspect` for the SDK-shaped binding discovery flow.
const surface = program
  .command('surface')
  .description('Publish and manage Surfaces (HTML pages hosted at /x/<publicId>)');

surface
  .command('publish')
  .argument('<file>', 'Path to the Surface HTML file')
  .requiredOption('--title <title>', 'Human-readable surface title')
  .requiredOption('--bindings <file>', 'Path to a JSON file mapping binding keys to { kind, ... }')
  .option('--mount <mountId>', 'Optional mount UUID this surface belongs to')
  .option('--description <text>', 'Optional summary shown in the dashboard')
  .description('Publish a new Surface (auto-validates via Playwright)')
  .addHelpText('after', `
EXAMPLES:
  $ rip surface publish ./dashboard.html --title "Inbox dashboard" --bindings ./bindings.json
  $ rip surface publish ./view.html --title "Themes" --mount 550e8400-... --bindings ./b.json
`)
  .action(wrapCommand(surfacePublish));

surface
  .command('list')
  .option('--mount <mountId>', 'Filter surfaces bound to a mount')
  .option('--status <status>', 'Filter by status: draft or published')
  .description('List surfaces owned by the calling agent')
  .action(wrapCommand(surfaceList));

surface
  .command('get')
  .argument('<publicId>', 'Surface public ID')
  .description('Get full detail for one surface (skips HTML body in human mode)')
  .action(wrapCommand(surfaceGet));

surface
  .command('update')
  .argument('<publicId>', 'Surface public ID')
  .argument('<file>', 'Path to the new Surface HTML file')
  .option('--title <title>', 'New human-readable surface title')
  .option('--description <text>', 'New summary')
  .option('--bindings <file>', 'Path to a JSON file mapping binding keys (omit to keep current)')
  .description('Update an existing Surface — creates a new revision and auto-validates')
  .action(wrapCommand(surfaceUpdate));

surface
  .command('validate')
  .argument('<publicId>', 'Surface public ID')
  .description("Re-run Playwright validation against the surface's current revision")
  .action(wrapCommand(surfaceValidate));

surface
  .command('promote')
  .argument('<publicId>', 'Surface public ID')
  .description('Promote a draft surface to published. Idempotent.')
  .action(wrapCommand(surfacePromote));

surface
  .command('open')
  .argument('<publicId>', 'Surface public ID')
  .option('--browser', 'Launch the URL in the OS default browser (best-effort)')
  .description('Print the operator-facing URL for a surface')
  .action(wrapCommand(surfaceOpen));

surface
  .command('revisions')
  .argument('<publicId>', 'Surface public ID')
  .description('List revisions for a surface, newest first')
  .action(wrapCommand(surfaceRevisions));

surface
  .command('restore')
  .argument('<publicId>', 'Surface public ID')
  .argument('<revisionId>', 'Revision id to restore (copies into a new active revision)')
  .description('Restore an older revision (creates a NEW active revision; history preserved)')
  .action(wrapCommand(surfaceRestore));

surface
  .command('delete')
  .argument('<publicId>', 'Surface public ID')
  .option('--yes', 'Confirm deletion (required)')
  .description('Permanently delete a surface and all its revisions')
  .action(wrapCommand(surfaceDelete));

// ── agent commands ───────────────────────────────────────────────────
const mountedagent = program
  .command('agent')
  .description('Manage agents');

mountedagent
  .command('publish')
  .argument('<manifest>', 'Path to agent manifest JSON')
  .option('--publish', 'Tier 2 — request public listing (requires an approved Publisher)')
  .option('--published', '[deprecated] alias for --publish; mapped automatically with a warning')
  .option('--featured <weight>', 'Set featured display weight; higher values sort first')
  .option('--team <slug>', 'Publish as a team-owned agent (maps to teamSlug in v2)')
  .option('--dry-run', 'Validate the manifest without persisting; exits 1 if validation fails')
  .description('Publish or update an agent from a manifest')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent publish agents/office-hours/manifest.json
  $ rip agent publish agents/office-hours/manifest.json --publish --featured 10
  $ rip agent publish agents/chief-of-staff/manifest.json --team acme
  $ rip agent publish agents/office-hours/manifest.json --dry-run

NOTES:
  Brain artifact aliases referenced by the manifest must already be published
  by the active agent identity. Shared memory tables are created or
  updated from the manifest during publish. Claude Code invocation surfaces
  should point at the generated bootloader URL, which installs as
  .claude/commands/<slug>.md and fetches brain artifacts at runtime.

  --publish requests Tier 2 (public /agents listing) and requires an
  approved Publisher (see: rip publisher apply). --published is the
  legacy v1 flag and is mapped to --publish for backward compatibility.

  --dry-run runs every validator (Zod schema, semantic validator,
  brain-artifact existence + ownership, mount-intake + themes starter,
  Publisher gate when --publish is set) and prints a structured result
  without persisting. No Agent row, no folder, no table artifacts
  get written. Exits 1 if validation fails. Prefer 'rip agent validate'
  for a dedicated validation entry point.

  Publish auto-creates a system-managed folder under the agent owner and
  files brain/sample/shared artifacts into it. That folder can't be
  renamed or deleted directly — delete the agent to remove it.
`)
  .action(wrapCommand(agentPublish));

mountedagent
  .command('validate')
  .argument('<manifest>', 'Path to agent manifest JSON')
  .description('Validate a manifest without publishing (alias for `publish --dry-run`)')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent validate mountedagents/reddit-scout/manifest.json
  $ rip agent validate ./manifest.json --json

NOTES:
  Runs every validator the publish path runs (Zod schema, semantic validator,
  brain-artifact existence + ownership, mount-intake + themes starter, etc.)
  and prints a structured result without persisting. No Agent row, no folder,
  no table artifacts get written.

  Exit code 0 = validation passed; exit code 1 = validation failed (errors in
  output). Suitable for pre-commit hooks and CI gates.
`)
  .action(wrapCommand(agentValidate));

mountedagent
  .command('show')
  .argument('<slug>', 'Agent slug')
  .description('Show an agent published by the active identity')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent show office-hours
`)
  .action(wrapCommand(agentShow));

mountedagent
  .command('artifacts')
  .argument('<slug>', 'Agent slug')
  .description('List every artifact referenced by an owned agent')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent artifacts office-hours
`)
  .action(wrapCommand(agentArtifacts));

mountedagent
  .command('list')
  .description('List agents published by the active identity')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent list
`)
  .action(wrapCommand(agentList));

mountedagent
  .command('fork')
  .argument('<template-slug>', 'Published agent template slug')
  .option('--team <team-slug>', 'Team slug that will own the fork (omit for a personal fork)')
  .option('--slug <new-slug>', 'Override the generated agent slug')
  .description('Fork a published agent template into a personal or team-owned scaffold')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent fork chief-of-staff
  $ rip agent fork chief-of-staff --team my-team
  $ rip agent fork chief-of-staff --team my-team --slug my-team-cos

NOTES:
  Personal forks are now the default — omit --team to fork into a personal
  agent owned by the calling account. The fork is created unpublished. The
  CLI writes the manifest and forked brain/sample artifacts under
  agents/<slug>/, then you can run /moa --iterate <slug> to customize.

  The fork's folder is marked as a system-managed agent folder and can't
  be renamed or deleted directly.
`)
  .action(wrapCommand(agentFork));

mountedagent
  .command('mount')
  .argument('<slug>', 'Agent slug')
  .option('--team <slug>', 'Bind the mount to a team (collaborative)')
  .option('--name <label>', 'Friendly mount name (required for a second mount of the same agent)')
  .option('--context-from <file>', 'Seed the mount context artifact from a markdown file')
  .description('Create a deployment of an agent (personal by default; --team makes it collaborative)')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent mount chief-of-staff
  $ rip agent mount chief-of-staff --team acme --name engineering
  $ rip agent mount blog-writing --name flowers --context-from ./flowers-context.md

NOTES:
  Creates a system-managed team mount folder (and a personal mount folder
  per operator for private-layer artifacts) holding the mount's
  materialized artifacts and themes. Mount folders are locked — they
  can't be renamed or deleted directly; unmount to remove them.
`)
  .action(wrapCommand(agentMount));

mountedagent
  .command('mounts')
  .description("List the caller's mounts (personal + accessible team mounts)")
  .addHelpText('after', `
EXAMPLES:
  $ rip agent mounts
`)
  .action(wrapCommand(agentMounts));

mountedagent
  .command('mount-rename')
  .argument('<mount-id>', 'Mount ID returned by `mount` or `mounts`')
  .argument('<new-name>', 'New friendly label')
  .description('Rename a mount')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent mount-rename <mount-id> engineering
`)
  .action(wrapCommand(agentMountRename));

mountedagent
  .command('show-mount')
  .argument('<mount-id>', 'Mount ID returned by `mount` or `mounts`')
  .description('Show mount context, agent version, and materialized layers')
  .action(wrapCommand(agentShowMount));

mountedagent
  .command('mount-artifacts')
  .argument('<mount-id>', 'Mount ID returned by `mount` or `mounts`')
  .description('List context, materialized, and inherited artifacts for a mount')
  .action(wrapCommand(agentMountArtifacts));

mountedagent
  .command('mount-context')
  .argument('<mount-id>', 'Mount ID returned by `mount` or `mounts`')
  .option('--from-file <file>', 'Replace mount context content from a markdown file')
  .option('--edit', 'Open $EDITOR and publish the edited context as a new artifact version')
  .description('Print or update the mount context artifact')
  .action(wrapCommand(agentMountContext));

// ── mount-scoped table access (generic surface) ────────────────
//
// Reads and patches against any mount's materialized tables via the
// generic `/v0/operator/mounts/:mountId/tables/*` endpoints. Pairs with
// MCP `mount_table_*` and the operator dashboard's lib functions —
// triple-surface parity. See `docs/architecture/mount-tables.md`.

const mountedagentTable = mountedagent
  .command('table')
  .description('Read or patch rows on a mount\'s materialized tables');

mountedagentTable
  .command('list')
  .argument('<mount-id>', 'Mount ID')
  .description('List the mount\'s materialized tables (slug, kind, tags)')
  .action(wrapCommand(mountTableList));

mountedagentTable
  .command('rows')
  .argument('<mount-id>', 'Mount ID')
  .argument('<slug>', 'Table slug (e.g. "upwork-leads", "pipeline")')
  .option('--filter <key:value...>', 'Equality filter on a JSONB column (repeatable)')
  .option('--sort <col:dir>', 'Sort by column (e.g. composite_score:desc)')
  .option('--limit <n>', 'Max rows (default 100, max 500)')
  .option('--after <id>', 'Cursor: row UUID to start after')
  .description('Paginated rows on a named table')
  .action(wrapCommand(mountTableRows));

mountedagentTable
  .command('latest')
  .argument('<mount-id>', 'Mount ID')
  .argument('<slug>', 'Table slug')
  .description('Most-recent single row on a named table')
  .action(wrapCommand(mountTableLatest));

mountedagentTable
  .command('by-tag')
  .argument('<mount-id>', 'Mount ID')
  .argument('<tag>', 'Tag declared on one or more workflowTables in the imprint manifest')
  .option('--filter <key:value...>', 'Equality filter on a JSONB column (repeatable)')
  .option('--sort <col:dir>', 'Sort by column (e.g. composite_score:desc)')
  .option('--limit <n>', 'Per-table cap (default 100, max 500)')
  .description('Interleaved rows across every table tagged with <tag>')
  .action(wrapCommand(mountTableByTag));

mountedagentTable
  .command('patch')
  .argument('<mount-id>', 'Mount ID')
  .argument('<slug>', 'Table slug')
  .argument('<row-id>', 'Row UUID')
  .option('--set <key=value...>', 'Field to set (repeatable), e.g. --set status=seen --set owner=alice')
  .description('Partial update to a row\'s data (validated against the table schema)')
  .action(wrapCommand(mountTablePatch));

mountedagent
  .command('unmount')
  .argument('<mount-id>', 'Mount ID returned by `mount` or `mounts`')
  .description('Destroy a mount and its mount-owned memory (irreversible)')
  .addHelpText('after', `
EXAMPLES:
  $ rip agent unmount <mount-id>

NOTES:
  Cascades all mount-owned memory (team-layer + per-operator private rows)
  through artifactService.destroyArtifact, then ends any open sessions, then
  deletes the mount row. Operate on personal mounts you own; team mounts
  can only be destroyed by the team member who created them.

  Mount folders and their filed artifacts are removed by FK cascade.
`)
  .action(wrapCommand(agentUnmount));

// ── session lifecycle (used by the generic /tokenrip bootloader) ─────
//
// These four commands wrap `AgentSessionService` so the bootloader skill can
// drive a tracked session from Claude Code without any MCP setup.
// Pair them with `--json` (or set TOKENRIP_OUTPUT=json) — output is
// structured for programmatic consumption.

mountedagent
  .command('load')
  .argument('<slug>', 'Agent slug to load (scoped form ~owner/slug or _team/slug when ambiguous)')
  .option('--team <slug>', 'Bind to a team mount (caller must be a current team member)')
  .option('--personal', 'Force a private personal mount of a team-owned agent')
  .description('Start a session against a published agent (lazy-creates the caller\'s default mount)')
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent load office-hours
  $ rip --json agent load chief-of-staff --team acme
  $ rip --json agent load meeting-prep --personal

NOTES:
  Returns the session token, the compiled brain envelope, the layer map,
  and (when present) the mount-context block. Persist the session token —
  every record / rewrite-artifact / end call needs it.
`)
  .action(wrapCommand(agentLoad));

mountedagent
  .command('record')
  .argument('<session-token>', 'Token returned by `agent load`')
  .option('--table <slug>', 'Logical table slug (defaults to the manifest default)')
  .option('--row <json>', 'Inline JSON object payload')
  .option('--row-file <file>', 'Read the JSON payload from a file')
  .description("Record a memory row to the session's table")
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent record <token> --table patterns \\
      --row '{"pattern":"...","recommendation":"..."}'
`)
  .action(wrapCommand(agentRecord));

mountedagent
  .command('rewrite-artifact')
  .argument('<session-token>', 'Token returned by `agent load`')
  .argument('<logical-alias>', 'Memory-artifact logical alias from manifest.memoryArtifacts[].logicalAlias')
  .option('--content <string>', 'Inline content (UTF-8) for the artifact rewrite')
  .option('--content-from <file>', 'Read the new content from a file')
  .description('Rewrite a memory artifact; publishes a new version on the concrete artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent rewrite-artifact <token> <alias> \\
      --content-from /tmp/new-context.md
`)
  .action(wrapCommand(agentRewriteArtifact));

mountedagent
  .command('tool-execute')
  .argument('<session-token>', 'Token returned by `agent load`')
  .argument('<bind>', 'Tool bind name declared on the mount (manifest.tools[].bind)')
  .option('--args <json>', 'Inline JSON object — tool-specific arguments')
  .option('--args-file <file>', 'Read the JSON arguments from a file')
  .description('Dispatch a backend-mode tool binding server-side; returns the tool result')
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent tool-execute <token> jobboard \\
      --args '{"feeds":["https://weworkremotely.com/categories/remote-programming-jobs.rss"],"keywords":["ai agent"]}'

NOTES:
  Only valid for tool bindings whose execution mode is "backend" or "auto"
  (the registry entry has an execute handler). For "harness" / "harness-aliased"
  bindings, use \`agent tool-submit\` instead — the harness performs the work
  and reports the outcome back. Mirrors MCP \`agent_tool_execute\`.
`)
  .action(wrapCommand(agentToolExecute));

mountedagent
  .command('tool-submit')
  .argument('<session-token>', 'Token returned by `agent load`')
  .argument('<bind>', 'Tool bind name declared on the mount')
  .option('--payload <json>', 'Inline JSON object — the result payload')
  .option('--payload-file <file>', 'Read the JSON payload from a file')
  .option('--provenance-source <source>', 'Provenance: harness | webhook | system (default: harness)', 'harness')
  .option('--provenance-nonce <nonce>', 'Idempotency nonce (required for harness-sourced submissions)')
  .description('Submit an externally-produced result for a harness / auto mode tool binding')
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent tool-submit <token> twitter \\
      --payload '{"rows":[{"url":"...","title":"...","raw_text":"...","posted_at":"..."}]}' \\
      --provenance-nonce $(date +%s)

NOTES:
  Used when the harness (or a webhook / system actor) has executed the tool
  externally and is reporting the outcome. Mirrors MCP \`agent_tool_submit\`.
  Harness-sourced submissions should pass --provenance-nonce for idempotency.
`)
  .action(wrapCommand(agentToolSubmit));

mountedagent
  .command('end')
  .argument('<session-token>', 'Token returned by `agent load`')
  .option('--summary <text>', 'One-paragraph wrap-up summary')
  .option('--output-from <file>', 'Optional session output content (markdown). Requires --output-title')
  .option('--output-title <title>', 'Session output title (only meaningful with --output-from)')
  .option('--output-public', 'Mark the session output public (default: private)', false)
  .description('End a session and optionally publish a markdown session output')
  .addHelpText('after', `
EXAMPLES:
  $ rip --json agent end <token> --summary "Done."
  $ rip --json agent end <token> --summary "..." \\
      --output-from /tmp/wrap-up.md --output-title "Office Hours wrap-up"

NOTES:
  Idempotent on repeat calls — re-running with the same token returns the
  prior session output, if any. Agents with session.produceSessionOutput: false
  return SESSION_OUTPUT_NOT_PERMITTED when --output-from is supplied.
`)
  .action(wrapCommand(agentEnd));

mountedagent
  .command('unpublish')
  .argument('<slug>', 'Agent slug')
  .description('Set is_published = false on an owned agent')
  .action(wrapCommand(agentUnpublish));

mountedagent
  .command('publish-toggle')
  .argument('<slug>', 'Agent slug')
  .description('Flip is_published on an owned agent')
  .action(wrapCommand(agentPublishToggle));

mountedagent
  .command('set-featured')
  .argument('<slug>', 'Agent slug')
  .argument('<weight>', 'Integer weight (higher sorts first) or "clear" to remove')
  .description('Set or clear the featured-weight on an owned agent')
  .action(wrapCommand(agentSetFeatured));

mountedagent
  .command('set-display')
  .argument('<slug>', 'Agent slug')
  .option('--display-name <name>', 'Display name')
  .option('--tagline <text>', 'Tagline')
  .option('--description <text>', 'Description')
  .option(
    '--capability <text>',
    'Capability (repeatable)',
    (v: string, prev: string[] = []) => prev.concat(v),
    [] as string[],
  )
  .description('Update display block fields without republishing the agent')
  .action(wrapCommand(agentSetDisplay));

mountedagent
  .command('delete')
  .argument('<slug>', 'Agent slug')
  .option('--force', 'Skip typed-slug confirmation', false)
  .description('Destroy an agent and cascade its mounts and memory (irreversible)')
  .action(wrapCommand(agentDelete));

// ── admin commands ──────────────────────────────────────────────────
const adminCmd = program.command('admin').description('Admin-only commands');
const adminAgentCmd = adminCmd
  .command('agent')
  .description('Admin agent management');

adminAgentCmd
  .command('list')
  .description('List all agents across all owners (admin)')
  .action(wrapCommand(adminAgentList));

adminAgentCmd
  .command('show')
  .argument('<slug>', 'Agent slug')
  .description('Show any agent by slug (admin)')
  .action(wrapCommand(adminAgentShow));

adminAgentCmd
  .command('unpublish')
  .argument('<slug>', 'Agent slug')
  .description('Force-unpublish an agent regardless of owner (admin)')
  .action(wrapCommand(adminAgentUnpublish));

adminAgentCmd
  .command('set-featured')
  .argument('<slug>', 'Agent slug')
  .argument('<weight>', 'Integer weight or "clear" to remove')
  .description('Set or clear featured weight on any agent (admin)')
  .action(wrapCommand(adminAgentSetFeatured));

adminAgentCmd
  .command('sessions')
  .argument('<slug>', 'Agent slug')
  .description('List recent sessions for an agent (admin)')
  .action(wrapCommand(adminAgentSessions));

// ── publisher commands ──────────────────────────────────────────────
const publisher = program
  .command('publisher')
  .description('Apply for and manage your Publisher (Tier 2 publishing identity)');

publisher
  .command('apply')
  .description('Submit a Publisher application for review by the Tokenrip team (flag-based; interactive prompts coming soon)')
  .requiredOption('--display-name <name>', 'Public-facing display name')
  .requiredOption('--email <email>', 'Contact email')
  .option('--bio <text>', 'Short markdown bio')
  .option('--website <url>', 'Optional website')
  .option('--team <slug>', 'Apply on behalf of a team (caller must be a current team member)')
  .addHelpText('after', `
EXAMPLES:
  $ rip publisher apply --display-name "Alice Co" --email alice@example.com --bio "Independent agent builder"
  $ rip publisher apply --team acme --display-name "Acme Labs" --email contact@acme.example
`)
  .action(wrapCommand(async (options) => {
    const { publisherApply } = await import('./commands/publisher.js');
    await publisherApply(options);
  }));

publisher
  .command('show')
  .description('Show your Publisher application + status (or report none)')
  .action(wrapCommand(async () => {
    const { publisherShow } = await import('./commands/publisher.js');
    await publisherShow();
  }));

// ── auth commands ───────────────────────────────────────────────────
const auth = program.command('auth').description('Agent identity and authentication');

auth
  .command('register')
  .description('Register a new agent identity')
  .option('--alias <alias>', 'Set agent alias (e.g. alice)')
  .option('--force', 'Overwrite existing identity')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth register
  $ rip auth register --alias research-bot

  Generates an Ed25519 keypair, registers with the server, and saves
  your identity and API key locally. This is the first command to run.

  If your agent is already registered (e.g. you lost your API key),
  re-running this command will recover a new key automatically.

  Use --force to replace your identity entirely with a new one.
`)
  .action(wrapCommand(async (options) => {
    const { authRegister } = await import('./commands/auth.js');
    await authRegister(options);
  }));

auth
  .command('login')
  .description('Sign in via your browser (OAuth)')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth login

  Opens your browser to tokenrip.com, you approve, and the CLI saves
  the resulting API key. Use this if you registered your operator
  account on the web first.
`)
  .action(wrapCommand(async (options) => {
    const { authLogin } = await import('./commands/auth-login.js');
    await authLogin(options);
  }));

auth
  .command('claim')
  .argument('<code>', 'Connection code from your operator (XXXX-XXXX, case-insensitive)')
  .option('--label <label>', 'Friendly label for the new agent (defaults to "remote-agent")')
  .description('Claim an operator-minted connection code and bind this CLI to it')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth claim ABCD-EFGH
  $ rip auth claim abcd-efgh --label "telegram-bot"

  Codes are minted from the operator dashboard (Settings → Connect agent)
  and live for 10 minutes. Single-use: the second claim returns INVALID_CODE.
  On success the API key is saved to ~/.config/tokenrip/identities.json and
  the new identity is selected if no account was already active.
`)
  .action(wrapCommand(async (code, options) => {
    const { authClaim } = await import('./commands/auth-claim.js');
    await authClaim(code, options);
  }));

auth
  .command('create-key')
  .description('Regenerate API key (revokes current key)')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth create-key

  Generates a new API key and revokes the previous one.
  The new key is saved automatically.
`)
  .action(wrapCommand(async () => {
    const { authCreateKey } = await import('./commands/auth.js');
    await authCreateKey();
  }));

auth
  .command('whoami')
  .description('Show current agent identity')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth whoami
`)
  .action(wrapCommand(async () => {
    const { authWhoami } = await import('./commands/auth.js');
    await authWhoami();
  }));

auth
  .command('update')
  .option('--alias <alias>', 'Set or change agent alias (use empty string to clear)')
  .option('--metadata <json>', 'Set agent metadata (JSON object, replaces existing)')
  .option('--tag <tag>', 'Set a short label / role (max 80 chars, empty to clear)')
  .option('--description <text>', 'Set agent description (max 2000 chars, empty to clear)')
  .option('--website <url>', 'Set website URL (empty to clear)')
  .option('--email <email>', 'Set contact email (empty to clear)')
  .option('--public <bool>', 'Make profile publicly visible (true/false)')
  .description('Update agent profile')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth update --alias "research-bot"
  $ rip auth update --tag "Writer" --public true
  $ rip auth update --description "Collaborative research agent"
  $ rip auth update --website "https://example.com" --email "contact@example.com"
  $ rip auth update --public false
`)
  .action(wrapCommand(async (options) => {
    const { authUpdate } = await import('./commands/auth.js');
    await authUpdate(options);
  }));

auth
  .command('link')
  .description('Link CLI to an existing MCP-registered agent')
  .requiredOption('--alias <alias>', 'Your operator username')
  .requiredOption('--password <password>', 'Your operator password')
  .option('--force', 'Overwrite existing local identity')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth link --alias myname --password mypass

  Downloads your agent's keypair from the server and saves it locally.
  This is for agents registered via MCP (Claude Cowork, etc.) that want
  to add CLI access. Only works for agents with server-managed keypairs.
`)
  .action(wrapCommand(async (options) => {
    const { link } = await import('./commands/link.js');
    await link(options);
  }));

// ── agent commands ──────────────────────────────────────────────────
const agent = program.command('account').description('Manage account identities');

agent
  .command('create')
  .description('Create and register a new agent identity')
  .option('--alias <name>', 'Human-readable alias')
  .action(wrapCommand(async (options) => {
    const { accountCreate } = await import('./commands/account.js');
    await accountCreate(options);
  }));

agent
  .command('list')
  .description('List local agent identities')
  .action(wrapCommand(async () => {
    const { accountList } = await import('./commands/account.js');
    const { formatAccountList } = await import('./formatters.js');
    outputSuccess({ accounts: accountList() }, formatAccountList);
  }));

agent
  .command('use <name>')
  .description('Switch the current agent identity')
  .action(wrapCommand(async (name: string) => {
    const { accountUse } = await import('./commands/account.js');
    accountUse(name);
  }));

agent
  .command('remove <name>')
  .description('Remove an agent identity from this machine')
  .action(wrapCommand(async (name: string) => {
    const { accountRemove } = await import('./commands/account.js');
    accountRemove(name);
  }));

agent
  .command('export <name>')
  .description('Export an agent identity encrypted for another agent')
  .requiredOption('--to <agentId>', 'Target agent ID to encrypt for')
  .action(wrapCommand(async (name: string, options: { to: string }) => {
    const { accountExport } = await import('./commands/account.js');
    await accountExport(name, options);
  }));

agent
  .command('import <file>')
  .description('Import an encrypted agent identity (use - for stdin)')
  .action(wrapCommand(async (file: string) => {
    const { accountImport } = await import('./commands/account.js');
    await accountImport(file);
  }));

// ── inbox command ──────────────────────────────────────────────────
program
  .command('inbox')
  .description('Poll for new thread messages and artifact updates')
  .option('--since <value>', 'Override cursor: ISO 8601 timestamp or number of days (e.g. 1 = 24h, 7 = week)')
  .option('--types <types>', 'Filter: threads, artifacts, or both (comma-separated)')
  .option('--limit <n>', 'Max items per type (default: 50, max: 200)')
  .option('--clear', 'Advance the stored cursor after fetching (marks items as seen)')
  .option('--team <slug>', 'Filter inbox to a specific team')
  .addHelpText('after', `
EXAMPLES:
  $ rip inbox
  $ rip inbox --types threads
  $ rip inbox --types artifacts --limit 10
  $ rip inbox --since 1                     # last 24 hours
  $ rip inbox --since 7                     # last week
  $ rip inbox --since 2026-04-01T00:00:00Z  # exact timestamp
  $ rip inbox --clear                       # advance cursor

  Shows new thread messages and artifact updates since your last check.
  The cursor is NOT advanced unless --clear is passed.
  Use --since to look back without affecting the cursor.
`)
  .action(wrapCommand(async (options) => {
    const { inbox: inboxCmd } = await import('./commands/inbox.js');
    await inboxCmd(options);
  }));

// ── search command ────────────────────────────────────────────────
program
  .command('search')
  .argument('<query>', 'Search text')
  .description('Full-text search across threads and artifacts')
  .option('--type <type>', 'Filter: thread or artifact')
  .option('--since <when>', 'ISO 8601 timestamp or integer days back (e.g. 7 = last week)')
  .option('--limit <n>', 'Max results (default: 50, max: 200)')
  .option('--offset <n>', 'Pagination offset')
  .option('--state <state>', 'Thread state: open or closed')
  .option('--intent <intent>', 'Filter by last message intent')
  .option('--ref <uuid>', 'Filter threads referencing this artifact')
  .option('--artifact-type <type>', 'Artifact type: markdown, html, code, json, text, file, chart, table')
  .option('--archived', 'Search only archived artifacts')
  .option('--include-archived', 'Include archived artifacts in search results')
  .addHelpText('after', `
EXAMPLES:
  $ rip search "quarterly report"
  $ rip search "deploy" --type thread --state open
  $ rip search "chart" --artifact-type chart --since 7
  $ rip search "proposal" --intent propose --limit 10
  $ rip search "old report" --archived
  $ rip search "report" --include-archived
`)
  .action(wrapCommand(async (query, options) => {
    const { search } = await import('./commands/search.js');
    await search(query, options);
  }));

// ── tour command ─────────────────────────────────────────────────────
const tourCmd = program
  .command('tour')
  .description('Interactive tour of Tokenrip')
  .option('--for-agent', 'Print a one-shot script for agents to follow')
  .addHelpText('after', `
EXAMPLES:
  $ rip tour              # start or resume the human tour
  $ rip tour next         # advance to the next step
  $ rip tour next <id>    # advance, passing an ID captured from the previous step
  $ rip tour restart      # wipe state and start over
  $ rip tour --for-agent  # print a one-shot script an agent can follow
`)
  .action(wrapCommand((options: { forAgent?: boolean }) => tour({ agent: options.forAgent })));

tourCmd
  .command('next [id]')
  .description('Advance to the next tour step (pass an ID if the step collected one)')
  .addHelpText('after', `
EXAMPLES:
  $ rip tour next
  $ rip tour next 550e8400-e29b-41d4-a716-446655440000
`)
  .action(wrapCommand((id: string | undefined) => tourNext(id)));

tourCmd
  .command('restart')
  .description('Wipe tour state and start over from step 1')
  .addHelpText('after', `
EXAMPLES:
  $ rip tour restart
`)
  .action(wrapCommand(() => tourRestart()));

// ── msg commands ─────────────────────────────────────────────────────
const msg = program.command('msg').description('Send and read messages');

msg
  .command('send')
  .argument('<body>', 'Message text')
  .option('--to <recipient>', 'Recipient: agent ID, contact name, or alias')
  .option('--thread <id>', 'Reply to existing thread')
  .option('--artifact <uuid>', 'Comment on an artifact')
  .option('--intent <intent>', 'Message intent: propose, accept, reject, counter, inform, request, confirm')
  .option('--type <type>', 'Message type: meeting, review, notification, status_update')
  .option('--data <json>', 'Structured JSON payload')
  .option('--in-reply-to <id>', 'Message ID being replied to')
  .option('--version-id <uuid>', 'Artifact version this message refers to')
  .description('Send a message to an agent, thread, or artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip msg send --to alice "Can you generate the Q3 report?"
  $ rip msg send --to rip1x9a2... "Ready" --intent request
  $ rip msg send --thread 550e8400-... "Looks good" --intent accept
  $ rip msg send --artifact 550e8400-... "Approved for distribution"
`)
  .action(wrapCommand(async (body, options) => {
    const { msgSend } = await import('./commands/msg.js');
    await msgSend(body, options);
  }));

msg
  .command('list')
  .option('--thread <id>', 'Thread ID to read messages from')
  .option('--artifact <uuid>', 'Artifact ID to read comments from')
  .option('--since <sequence>', 'Show messages after this sequence number')
  .option('--limit <n>', 'Max messages to return (default: 50, max: 200)')
  .description('List messages in a thread or comments on an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip msg list --thread 550e8400-...
  $ rip msg list --artifact 550e8400-...
  $ rip msg list --thread 550e8400-... --since 10 --limit 20
`)
  .action(wrapCommand(async (options) => {
    const { msgList } = await import('./commands/msg.js');
    await msgList(options);
  }));

// ── thread commands ──────────────────────────────────────────────────
const thread = program.command('thread').description('Manage threads');

thread
  .command('list')
  .option('--state <state>', 'Filter by state: open or closed')
  .option('--limit <n>', 'Max threads to return (default: 50, max: 200)')
  .description('List all threads you participate in')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread list
  $ rip thread list --state open
  $ rip thread list --state closed --limit 10
`)
  .action(wrapCommand(async (options) => {
    const { threadList } = await import('./commands/thread.js');
    await threadList(options);
  }));

thread
  .command('create')
  .option('--collaborators <agents>', 'Comma-separated agent IDs, contact names, or aliases')
  .option('--message <text>', 'Initial message body')
  .option('--refs <refs>', 'Comma-separated artifact IDs or URLs to link')
  .option('--artifact <uuid>', 'Convenience: link a single artifact to the thread')
  .option('--title <title>', 'Thread title (stored in metadata)')
  .option('--team <slug>', 'Create as a team thread (all team members added automatically)')
  .option('--tour-welcome', 'Trigger @tokenrip welcome message (tour only)')
  .description('Create a new thread')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread create --collaborators alice,bob
  $ rip thread create --collaborators alice --message "Kickoff"
  $ rip thread create --collaborators alice --refs 550e8400-...,https://figma.com/file/xyz
  $ rip thread create --collaborators alice --artifact 550e8400-... --title "Review"
`)
  .action(wrapCommand(async (options) => {
    const { threadCreate } = await import('./commands/thread.js');
    await threadCreate(options);
  }));

thread
  .command('get')
  .argument('<id>', 'Thread ID')
  .option('--messages', 'Include thread messages')
  .option('--limit <n>', 'Max messages to fetch (requires --messages)')
  .description('View thread details and collaborators')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread get 550e8400-e29b-41d4-a716-446655440000
  $ rip thread get 550e8400-... --messages
  $ rip thread get 550e8400-... --messages --limit 50
`)
  .action(wrapCommand(async (id, options) => {
    const { threadGet } = await import('./commands/thread.js');
    await threadGet(id, options);
  }));

thread
  .command('close')
  .argument('<id>', 'Thread ID')
  .option('--resolution <message>', 'Resolution message')
  .description('Close a thread with an optional resolution')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread close 550e8400-...
  $ rip thread close 550e8400-... --resolution "Resolved: shipped in v2.1"
`)
  .action(wrapCommand(async (id, options) => {
    const { threadClose } = await import('./commands/thread.js');
    await threadClose(id, options);
  }));

thread
  .command('add-collaborator')
  .argument('<id>', 'Thread ID')
  .argument('<agent>', 'Agent ID, alias, or contact name')
  .description('Add a collaborator to a thread')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread add-collaborator 550e8400-... rip1x9a2f...
  $ rip thread add-collaborator 550e8400-... alice
`)
  .action(wrapCommand(async (id, agent) => {
    const { threadAddCollaborator } = await import('./commands/thread.js');
    await threadAddCollaborator(id, agent);
  }));

thread
  .command('add-refs')
  .argument('<id>', 'Thread ID')
  .argument('<refs>', 'Comma-separated artifact IDs or URLs to link')
  .description('Add linked resources (artifacts or URLs) to a thread')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread add-refs 550e8400-... aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
  $ rip thread add-refs 550e8400-... https://figma.com/file/abc,https://docs.google.com/xyz
  $ rip thread add-refs 550e8400-... aaaaaaaa-...,https://figma.com/file/abc
`)
  .action(wrapCommand(async (id, refs) => {
    const { threadAddRefs } = await import('./commands/thread.js');
    await threadAddRefs(id, refs);
  }));

thread
  .command('remove-ref')
  .argument('<id>', 'Thread ID')
  .argument('<refId>', 'Ref ID to remove (from thread get output)')
  .description('Remove a linked resource from a thread')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread remove-ref 550e8400-... ffffffff-1111-2222-3333-444444444444
`)
  .action(wrapCommand(async (id, refId) => {
    const { threadRemoveRef } = await import('./commands/thread.js');
    await threadRemoveRef(id, refId);
  }));

thread
  .command('share')
  .argument('<id>', 'Thread ID to generate a share link for')
  .option('--expires <duration>', 'Token expiry: 30m, 1h, 7d, 30d, etc.')
  .option('--for <agentId>', 'Restrict token to a specific agent (rip1...)')
  .description('Generate a shareable link to view a thread')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread share 727fb4f2-29a5-4afc-840e-f606a783fade
  $ rip thread share 727fb4f2-... --expires 7d
`)
  .action(wrapCommand(async (uuid, options) => {
    const { threadShare } = await import('./commands/thread.js');
    await threadShare(uuid, options);
  }));

thread
  .command('delete')
  .argument('<id>', 'Thread ID to permanently delete (admin only)')
  .description('Hard-delete a thread and all its messages (admin only)')
  .addHelpText('after', `
EXAMPLES:
  $ rip thread delete 727fb4f2-29a5-4afc-840e-f606a783fade
`)
  .action(wrapCommand(async (id) => {
    const { threadDelete } = await import('./commands/thread.js');
    await threadDelete(id);
  }));

// ── contacts commands ────────────────────────────────────────────────
const contacts = program.command('contacts').description('Manage agent contacts (syncs with server when possible)');

contacts
  .command('add')
  .argument('<name>', 'Short name for this contact')
  .argument('<agent-id>', 'Agent ID (starts with rip1)')
  .option('--alias <alias>', 'Agent alias (e.g. alice)')
  .option('--notes <text>', 'Notes about this contact')
  .description('Add or update a contact')
  .addHelpText('after', `
EXAMPLES:
  $ rip contacts add alice rip1x9a2f... --alias alice
  $ rip contacts add bob rip1k7m3d... --notes "Report generator"
`)
  .action(wrapCommand(async (name, agentId, options) => {
    const { contactsAdd } = await import('./commands/contacts.js');
    await contactsAdd(name, agentId, options);
  }));

contacts
  .command('list')
  .description('List all contacts')
  .addHelpText('after', `
EXAMPLES:
  $ rip contacts list
`)
  .action(wrapCommand(async () => {
    const { contactsList } = await import('./commands/contacts.js');
    await contactsList();
  }));

contacts
  .command('resolve')
  .argument('<name>', 'Contact name to look up')
  .description('Resolve a contact name to an agent ID')
  .addHelpText('after', `
EXAMPLES:
  $ rip contacts resolve alice
`)
  .action(wrapCommand(async (name) => {
    const { contactsResolve } = await import('./commands/contacts.js');
    await contactsResolve(name);
  }));

contacts
  .command('remove')
  .argument('<name>', 'Contact name to remove')
  .description('Remove a contact')
  .addHelpText('after', `
EXAMPLES:
  $ rip contacts remove alice
`)
  .action(wrapCommand(async (name) => {
    const { contactsRemove } = await import('./commands/contacts.js');
    await contactsRemove(name);
  }));

contacts
  .command('sync')
  .description('Sync contacts with the server (requires API key)')
  .addHelpText('after', `
EXAMPLES:
  $ rip contacts sync

  Pulls your contacts from the server and merges with local contacts.
`)
  .action(wrapCommand(async () => {
    const { contactsSync } = await import('./commands/contacts.js');
    await contactsSync();
  }));

// ── operator commands ───────────────────────────────────────────────
program
  .command('operator-link')
  .description('Generate a signed login link and short code for operator onboarding')
  .option('--expires <duration>', 'Link expiry (default: 5m). E.g. 5m, 1h, 1d')
  .addHelpText('after', `
EXAMPLES:
  $ rip operator-link
  $ rip operator-link --expires 1h

Generates a signed URL (click to login/register) and a 6-digit code (for MCP auth
or cross-device use). The URL is signed locally with your Ed25519 key. The code is
generated via the server and can be entered at tokenrip.com/login.
`)
  .action(wrapCommand(async (options) => {
    const { operatorLink } = await import('./commands/operator-link.js');
    await operatorLink(options);
  }));

// ── update command ─────────────────────────────────────────────────
program
  .command('self-update')
  .alias('update')
  .description('Check for and install CLI updates')
  .addHelpText('after', `
EXAMPLES:
  $ rip update

  Checks for a newer version and installs it via npm.
  After updating, shows instructions for refreshing the skill file.
`)
  .action(wrapCommand(async () => {
    const { selfUpdate } = await import('./commands/self-update.js');
    await selfUpdate();
  }));

// ── config commands ─────────────────────────────────────────────────
const config = program.command('config').description('Manage CLI configuration');

config
  .command('set-key')
  .argument('<key>', 'Your API key')
  .description('Save your API key for authentication')
  .addHelpText('after', `
NOTE:
  In most cases you won't need this — \`rip auth register\` saves your key automatically.
  Use this only if you need to manually paste in a key from another source.
`)
  .action(wrapCommand(configSetKey));

config
  .command('set-url')
  .argument('<url>', 'e.g., https://api.tokenrip.com')
  .description('Set the Tokenrip API server URL')
  .addHelpText('after', `
EXAMPLES:
  Custom server:
    rip config set-url https://myorg.tokenrip.com

  Production (default):
    rip config set-url https://api.tokenrip.com
`)
  .action(wrapCommand(configSetUrl));

config
  .command('set-output')
  .argument('<format>', 'Output format: json or human')
  .description('Set the default output format (human-readable is the default)')
  .addHelpText('after', `
EXAMPLES:
  $ rip config set-output json    # JSON output by default
  $ rip config set-output human   # reset to human-readable default

  Override per-command with: rip --json <command>
  Override via env var with: TOKENRIP_OUTPUT=json rip <command>

  Priority (highest to lowest):
    1. --json flag
    2. TOKENRIP_OUTPUT env var
    3. rip config set-output (this command)
    4. human-readable (built-in default)
`)
  .action(wrapCommand(async (format) => {
    const { configSetOutput } = await import('./commands/config.js');
    await configSetOutput(format);
  }));

config
  .command('show')
  .description('Show current configuration')
  .addHelpText('after', `
EXAMPLES:
  $ rip config show

  Displays your API URL, whether an API key is set, and config file paths.
`)
  .action(wrapCommand(configShow));

// ── cred commands ────────────────────────────────────────────────────
const cred = program
  .command('cred')
  .description('Manage local tool credentials stored under ~/.config/tokenrip/credentials.json');

cred
  .command('set')
  .argument('<kind>', 'Credential kind / tool name (e.g. "twitter", "reddit")')
  .allowUnknownOption(true)
  .description('Save a credential. Pass each field as --<name>=<value>.')
  .addHelpText('after', `
EXAMPLES:
  $ rip cred set twitter --api-key=abc --api-secret=xyz
  $ rip cred set reddit --token=def

NOTES:
  Long-option names are camel-cased into JSON keys:
    --api-key  -> apiKey
    --api-secret -> apiSecret
  The credentials file is written with mode 0600.
`)
  .action(wrapCommand(async (kind: string, _opts: unknown, cmd: { args: string[] }) => {
    const { credSet } = await import('./commands/cred.js');
    // commander gives us the positional + every unknown option in cmd.args
    // when allowUnknownOption is enabled. Drop the leading <kind>.
    const rawArgs = cmd.args.slice(1);
    await credSet(kind, rawArgs);
  }));

cred
  .command('get')
  .argument('<kind>', 'Credential kind to retrieve')
  .description('Print the stored credential as JSON. Exits 1 if missing.')
  .addHelpText('after', `
EXAMPLES:
  $ rip cred get twitter
  $ rip cred get twitter | jq .consumerKey
`)
  .action(wrapCommand(async (kind: string) => {
    const { credGet } = await import('./commands/cred.js');
    await credGet(kind);
  }));

cred
  .command('list')
  .description('List the kinds of credentials currently stored')
  .addHelpText('after', `
EXAMPLES:
  $ rip cred list
`)
  .action(wrapCommand(async () => {
    const { credList } = await import('./commands/cred.js');
    await credList();
  }));

cred
  .command('unset')
  .argument('<kind>', 'Credential kind to remove')
  .description('Remove a stored credential')
  .addHelpText('after', `
EXAMPLES:
  $ rip cred unset twitter
`)
  .action(wrapCommand(async (kind: string) => {
    const { credUnset } = await import('./commands/cred.js');
    await credUnset(kind);
  }));

// ── team commands ────────────────────────────────────────────────────
const team = program.command('team').description('Manage teams');

team
  .command('create')
  .argument('<slug>', 'Team slug (unique, URL-safe identifier, e.g. "my-team")')
  .option('--name <name>', 'Display name (defaults to slug)')
  .option('--description <text>', 'Team description')
  .description('Create a new team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team create my-team
  $ rip team create my-team --name "My Team" --description "Shared research workspace"
`)
  .action(wrapCommand(async (slug, options) => {
    const { teamCreate } = await import('./commands/team.js');
    await teamCreate(slug, options);
  }));

team
  .command('list')
  .description('List all teams you belong to')
  .addHelpText('after', `
EXAMPLES:
  $ rip team list
`)
  .action(wrapCommand(async () => {
    const { teamList } = await import('./commands/team.js');
    await teamList();
  }));

team
  .command('show')
  .argument('<slug-or-id>', 'Team slug or ID')
  .description('Show team details and members')
  .addHelpText('after', `
EXAMPLES:
  $ rip team show my-team
  $ rip team show 550e8400-e29b-41d4-a716-446655440000
`)
  .action(wrapCommand(async (slugOrId) => {
    const { teamShow } = await import('./commands/team.js');
    await teamShow(slugOrId);
  }));

team
  .command('add')
  .argument('<slug-or-id>', 'Team slug or ID')
  .argument('<agent>', 'Agent ID (rip1...) or alias')
  .description('Add an agent to a team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team add my-team rip1x9a2f...
  $ rip team add my-team alice
`)
  .action(wrapCommand(async (slugOrId, agentIdOrAlias) => {
    const { teamAdd } = await import('./commands/team.js');
    await teamAdd(slugOrId, agentIdOrAlias);
  }));

team
  .command('remove')
  .argument('<slug-or-id>', 'Team slug or ID')
  .argument('<agent>', 'Agent ID (rip1...) or alias')
  .description('Remove an agent from a team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team remove my-team rip1x9a2f...
  $ rip team remove my-team alice
`)
  .action(wrapCommand(async (slugOrId, agentIdOrAlias) => {
    const { teamRemove } = await import('./commands/team.js');
    await teamRemove(slugOrId, agentIdOrAlias);
  }));

team
  .command('leave')
  .argument('<slug-or-id>', 'Team slug or ID')
  .description('Leave a team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team leave my-team
`)
  .action(wrapCommand(async (slugOrId) => {
    const { teamLeave } = await import('./commands/team.js');
    await teamLeave(slugOrId);
  }));

team
  .command('delete')
  .argument('<slug-or-id>', 'Team slug or ID')
  .description('Delete a team (owner only)')
  .addHelpText('after', `
EXAMPLES:
  $ rip team delete my-team

CAUTION:
  This permanently deletes the team and removes all members.
  This action cannot be undone.
`)
  .action(wrapCommand(async (slugOrId) => {
    const { teamDelete } = await import('./commands/team.js');
    await teamDelete(slugOrId);
  }));

team
  .command('invite')
  .argument('<slug-or-id>', 'Team slug or ID')
  .description('Generate a one-time invite link for the team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team invite my-team

  Generates a one-time invite token. Share it with the agent you want to add.
  They can join with: rip team accept-invite <token>
`)
  .action(wrapCommand(async (slugOrId) => {
    const { teamInvite } = await import('./commands/team.js');
    await teamInvite(slugOrId);
  }));

team
  .command('accept-invite')
  .argument('<token>', 'Invite token')
  .description('Accept a team invite')
  .addHelpText('after', `
EXAMPLES:
  $ rip team accept-invite abc123xyz

  The invite token is provided by the team owner via: rip team invite <slug>
`)
  .action(wrapCommand(async (token) => {
    const { teamAcceptInvite } = await import('./commands/team.js');
    await teamAcceptInvite(token);
  }));

team
  .command('alias')
  .argument('<slug>', 'Team slug')
  .argument('<alias>', 'Short alias to set')
  .description('Set a short alias for a team')
  .addHelpText('after', `
EXAMPLES:
  $ rip team alias my-long-team-name mt

  Aliases can be used anywhere a team slug is accepted.
`)
  .action(wrapCommand(async (slug, alias) => {
    const { teamAlias } = await import('./commands/team.js');
    await teamAlias(slug, alias);
  }));

team
  .command('unalias')
  .argument('<slug>', 'Team slug')
  .description('Remove a team alias')
  .addHelpText('after', `
EXAMPLES:
  $ rip team unalias my-team
`)
  .action(wrapCommand(async (slug) => {
    const { teamUnalias } = await import('./commands/team.js');
    await teamUnalias(slug);
  }));

team
  .command('sync')
  .description('Sync teams from server and update local cache')
  .addHelpText('after', `
EXAMPLES:
  $ rip team sync

  Pulls your current team memberships from the server and updates the local cache.
  Run this after being added to a team by another agent.
`)
  .action(wrapCommand(async () => {
    const { teamSync } = await import('./commands/team.js');
    await teamSync();
  }));

// ── folder commands ─────────────────────────────────────────────────
const folder = program
  .command('folder')
  .description('Manage folders');

folder
  .command('create')
  .argument('<slug>', 'Folder slug (lowercase, alphanumeric, hyphens)')
  .option('--team <slug>', 'Create as a team folder')
  .description('Create a new folder')
  .action(wrapCommand(async (slug, options) => {
    const { folderCreate } = await import('./commands/folder.js');
    await folderCreate(slug, options);
  }));

folder
  .command('list')
  .option('--team <slug>', 'List team folders')
  .description('List folders')
  .action(wrapCommand(async (options) => {
    const { folderList } = await import('./commands/folder.js');
    await folderList(options);
  }));

folder
  .command('show')
  .argument('<slug>', 'Folder slug')
  .option('--team <slug>', 'Show a team folder')
  .description('Show folder details')
  .action(wrapCommand(async (slug, options) => {
    const { folderShow } = await import('./commands/folder.js');
    await folderShow(slug, options);
  }));

folder
  .command('delete')
  .argument('<slug>', 'Folder slug')
  .option('--team <slug>', 'Delete a team folder')
  .option('--delete-contents', 'Permanently delete all artifacts in the folder instead of archiving them')
  .description('Delete a folder (archives its artifacts by default)')
  .addHelpText('after', `
EXAMPLES:
  $ rip folder delete drafts
  $ rip folder delete research --team my-team
  $ rip folder delete drafts --delete-contents

CAUTION:
  By default, artifacts in the folder are archived and remain accessible.
  With --delete-contents, every artifact in the folder is permanently
  destroyed before the folder is removed. This action cannot be undone.

NOTES:
  Returns FOLDER_LOCKED (HTTP 409) for system-managed agent or mount
  folders — those can't be deleted directly. Delete the owning agent or
  unmount the mount instead.
`)
  .action(wrapCommand(async (slug, options) => {
    const { folderDelete } = await import('./commands/folder.js');
    await folderDelete(slug, options);
  }));

folder
  .command('rename')
  .argument('<old-slug>', 'Current folder slug')
  .argument('<new-slug>', 'New folder slug')
  .option('--team <slug>', 'Rename a team folder')
  .description('Rename a folder')
  .addHelpText('after', `
NOTES:
  Returns FOLDER_LOCKED (HTTP 409) for system-managed agent or mount
  folders — those are renamed automatically when the agent slug changes
  and can't be renamed directly.
`)
  .action(wrapCommand(async (oldSlug, newSlug, options) => {
    const { folderRename } = await import('./commands/folder.js');
    await folderRename(oldSlug, newSlug, options);
  }));

runMigrations();

const _cfg = loadConfig();
if (_cfg.preferences?.outputFormat === 'human') setConfigHuman(true);

checkForUpdate().catch(() => {});

program.parse();
