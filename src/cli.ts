#!/usr/bin/env node
import { Command, Option } from 'commander';
import { configSetKey, configSetUrl, configShow } from './commands/config.js';
import { upload } from './commands/upload.js';
import { publish } from './commands/publish.js';
import { status } from './commands/status.js';
import { deleteArtifact } from './commands/delete.js';
import { forkArtifact } from './commands/fork.js';
import { update } from './commands/update.js';
import { deleteVersion } from './commands/delete-version.js';
import { stats } from './commands/stats.js';
import { artifactGet } from './commands/artifact-get.js';
import { bundleDeploy, bundleList, bundleGet, bundleVersions, bundleRollback, bundleOpen, bundleDelete } from './commands/bundle.js';
import { artifactDownload } from './commands/artifact-download.js';
import { artifactCat } from './commands/artifact-cat.js';
import { artifactVersions } from './commands/artifact-versions.js';
import { artifactDiff } from './commands/artifact-diff.js';
import { patch } from './commands/patch.js';
import { wrapCommand, setForceJson, setConfigHuman, outputSuccess } from './output.js';
import { loadConfig } from './config.js';
import { runMigrations } from './migrations.js';
import { checkForUpdate } from './update-check.js';
import { CLI_VERSION } from './version.js';

/**
 * Every writing command states why: one sentence on the person's goal, which the
 * server records on workspace items. `TOKENRIP_WHY` stands in for the flag (for a
 * script with one purpose); the flag wins.
 */
function withWhy(command: Command): Command {
  return command.addOption(new Option('--why <text>', 'One sentence: what the person is trying to accomplish, in their terms — not a description of this edit. Required for workspace items.').env('TOKENRIP_WHY'));
}

/**
 * Retired flags (plan D7): still accepted so an old invocation runs, hidden from help, and ignored.
 * The program's preAction hook prints one notice naming those given and clears them, so no command
 * sends them.
 */
const retiredOptions = new WeakSet<Option>();
function retired(flags: string): Option {
  const option = new Option(flags).hideHelp();
  retiredOptions.add(option);
  return option;
}

const program = new Command();
program
  .name('rip')
  .description('Tokenrip — shared workspaces for people and AI agents')
  .version(CLI_VERSION)
  .option('--json', 'Use JSON output instead of human-readable')
  .option('--agent <name>', 'Use a specific agent identity for this command')
  .hook('preAction', async (thisCommand, actionCommand) => {
    if (program.opts().json) setForceJson(true);
    const opts = thisCommand.optsWithGlobals();
    if (opts.agent) {
      const { setAgentOverride } = await import('./identities.js');
      setAgentOverride(opts.agent);
    }
    const given = actionCommand.options.filter(option => retiredOptions.has(option) && actionCommand.getOptionValue(option.attributeName()) !== undefined);
    if (given.length) {
      const { retiredFlagsNotice } = await import('./commands/workspace.js');
      console.error(retiredFlagsNotice(given.map(option => option.long!)));
      for (const option of given) actionCommand.setOptionValue(option.attributeName(), undefined);
    }
  });

// ── artifact commands ──────────────────────────────────────────────────
const artifact = program
  .command('artifact')
  .alias('art')
  .description('Create, manage, and inspect artifacts');

withWhy(artifact
  .command('upload'))
  .argument('<file>', 'File path to upload (PDF, image, document, etc.)')
  .option('--title <title>', 'Display title for the artifact')
  .option('--parent <uuid>', 'Parent artifact ID for lineage tracking')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--refs <urls>', 'Comma-separated input reference URLs')
  .option('--team <slugs>', 'Comma-separated team slugs to share this artifact with')
  .option('--folder <slug>', 'File into folder (with --workspace-id: a folder in that workspace, by slug or id)')
  .option('--public-asset', 'Store in a public bucket and return a direct CDN URL (publicUrl)')
  .option('--visibility <level>', 'Standalone visibility (link | public | private); omit with --workspace-id')
  .option('--workspace-id <id>', 'Create inside a workspace; no expected revision required')
  .option('--audience <audience>', 'Workspace audience: internal | shared (requires --workspace-id)')
  .addOption(retired('--workspace-session-id <id>'))
  .option('--dry-run', 'Validate inputs without uploading')
  .description('Upload a file and get a shareable link')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact upload report.pdf --title "Agent Analysis"
  $ rip artifact upload hero.png --public-asset   # -> data.publicUrl (direct CDN)
  $ rip artifact upload chart.png --context "Claude Agent 1" \\
    --refs "https://source.example.com,https://another.com"
`)
  .action(wrapCommand(upload));

withWhy(artifact
  .command('publish'))
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
  .option('--folder <slug>', 'File into folder (with --workspace-id: a folder in that workspace, by slug or id)')
  .option('--metadata <json>', 'Arbitrary metadata JSON object (merged into artifact metadata)')
  .option('--public-asset', 'Store bytes in a public bucket and return a direct CDN URL (not valid with private visibility)')
  .option('--visibility <level>', 'Standalone visibility: private | link | public (default link); omit with --workspace-id')
  .option('--strict', 'For tables: reject unknown columns and type-mismatched values on row writes')
  .option('--workspace-id <id>', 'Create inside a workspace; no expected revision required')
  .option('--audience <audience>', 'Workspace audience: internal | shared (requires --workspace-id)')
  .option('--handoff', 'Publish this markdown as the workspace handoff note for whoever comes next (requires --workspace-id)')
  .addOption(retired('--workspace-session-id <id>'))
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
  $ rip artifact publish notes.md --type markdown --title "Handoff" \\
    --workspace-id <id> --handoff --why "Leave the pricing work ready for the next agent"
`)
  .action(wrapCommand(publish));

artifact
  .command('list')
  .option('--since <iso-date>', 'Only show artifacts modified after this timestamp (ISO 8601)')
  .option('--limit <n>', 'Maximum number of artifacts to return (default: 20)', '20')
  .option('--type <type>', 'Filter by artifact type (markdown, html, chart, code, text, file)')
  .option('--folder <slug>', 'Filter by folder')
  .option('--unfiled', 'Show only unfiled artifacts')
  .option('--team <slug>', 'Filter to team artifacts')
  .description('List your published artifacts and their metadata')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact list
  $ rip artifact list --since 2026-03-30T00:00:00Z
  $ rip artifact list --type markdown --limit 5
  $ rip artifact list --folder reports
  $ rip artifact list --unfiled
  $ rip artifact list --team acme
  $ rip artifact list --team acme --folder reports
`)
  .action(wrapCommand(status));

withWhy(artifact
  .command('delete'))
  .argument('<identifier>', 'Artifact UUID, alias, or full URL (https://tokenrip.com/s/...)')
  .option('--dry-run', 'Show what would move to the trash without moving it')
  .option('--expected-workspace-revision <n>', 'Required live revision for a workspace artifact')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Move an artifact to the trash (restorable for 30 days)')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact delete 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact delete my-alias
  $ rip artifact delete https://tokenrip.com/s/my-alias

NOTE:
  The artifact leaves listings and search, and its link answers 410 with the
  deletion and purge dates. It is removed for good 30 days later. The alias
  stays held while it is in the trash. Workspace artifacts need
  --expected-workspace-revision.
`)
  .action(wrapCommand(deleteArtifact));

withWhy(artifact
  .command('fork'))
  .argument('<identifier>', 'Artifact public ID, alias, or scoped alias (~owner/alias) to fork')
  .option('--version-id <versionId>', 'Fork a specific version (defaults to latest)')
  .option('--title <title>', 'Title for the forked artifact (defaults to original)')
  .option('--folder <folder>', 'Folder slug to file the fork into')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Create your own copy of an existing artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact fork 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact fork my-skill --title "My Custom Skill"
  $ rip artifact fork '~alice/dashboard' --title "My Dashboard"
  $ rip artifact fork 550e8400 --version-id abc123 --folder tools
`)
  .action(wrapCommand(forkArtifact));

withWhy(artifact
  .command('update'))
  .argument('<uuid>', 'Artifact public ID')
  .argument('<file>', 'File containing the new version content')
  .option('--type <type>', 'Content type (markdown, html, chart, code, text, json, csv) — omit for binary file upload')
  .option('--description <text>', 'Version description')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--title <title>', 'Also update the artifact title (applied via a follow-up patch)')
  .option('--alias <alias>', 'Also update the artifact alias (applied via a follow-up patch)')
  .option('--expected-version-id <id>', 'Required current version ID when replacing workspace content')
  .addOption(retired('--workspace-session-id <id>'))
  .option('--dry-run', 'Validate without publishing')
  .description('Publish a new version of an existing artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact update 550e8400-... report-v2.md --type markdown
  $ rip artifact update 550e8400-... chart.png --description "with axes fixed"
  $ rip artifact update my-doc report-v2.md --type markdown --title "Report (v2)"

A new version keeps the artifact's audience. To share a workspace artifact,
use: rip artifact patch <id> --audience shared --expected-workspace-revision <n>
`)
  .action(wrapCommand(update));

withWhy(artifact
  .command('delete-version'))
  .argument('<uuid>', 'Artifact ID')
  .argument('<versionId>', 'Version ID to delete')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .option('--expected-workspace-revision <n>', 'Required live revision when deleting a workspace artifact version')
  .addOption(retired('--workspace-session-id <id>'))
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
  .command('download')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--output <path>', 'Output file path (default: <uuid>.<ext> in current directory)')
  .option('--version-id <versionId>', 'Download a specific version')
  .option('--format <format>', 'Export format for tables: csv or json (default: csv)')
  .description('Download artifact content to a local file')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact download 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact download 550e8400-... --output ./report.pdf
  $ rip artifact download 550e8400-... --version-id abc123
  $ rip artifact download 550e8400-... --format json
`)
  .action(wrapCommand(artifactDownload));

artifact
  .command('cat')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--version-id <versionId>', 'Output a specific version')
  .description('Print artifact content to stdout')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact cat 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact cat my-post
  $ rip artifact cat '~alice/dashboard'
  $ rip artifact cat my-post --version-id abc123
  $ rip artifact cat my-post | head -20
`)
  .action(wrapCommand(artifactCat));

artifact
  .command('versions')
  .argument('<uuid>', 'Artifact UUID or full URL')
  .option('--version-id <versionId>', 'Get metadata for a specific version')
  .description('List versions of an artifact')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact versions 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact versions 550e8400-... --version-id abc123
`)
  .action(wrapCommand(artifactVersions));

artifact
  .command('diff')
  .argument('<identifier>', 'Artifact UUID, alias, scoped alias (~owner/alias), or full URL')
  .option('--version-id <versionId>', 'Diff a specific version (default: current version)')
  .option('--from <versionId>', 'Diff from this version (its predecessor is the base) up to --version-id')
  .description('Show what changed in a version vs. the previous version, or across a range with --from')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact diff 550e8400-e29b-41d4-a716-446655440000
  $ rip artifact diff my-alias --version-id abc123
  $ rip artifact diff my-alias --from <firstVersionId> --version-id <lastVersionId>
`)
  .action(wrapCommand(artifactDiff));

withWhy(artifact
  .command('move'))
  .argument('<uuid>', 'Artifact UUID')
  .option('--folder <slug>', 'Target folder slug')
  .option('--folder-id <uuid>', 'Target workspace folder UUID')
  .option('--team <slug>', 'Target team (for team folders)')
  .option('--unfiled', 'Remove from current folder')
  .option('--expected-workspace-revision <n>', 'Required live revision for a workspace artifact')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Move an artifact into a folder or unfile it')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact move 550e8400-... --folder reports
  $ rip artifact move 550e8400-... --folder research --team my-team
  $ rip artifact move 550e8400-... --unfiled
`)
  .action(wrapCommand(async (uuid, options) => {
    const { artifactMove } = await import('./commands/folder.js');
    await artifactMove(uuid, options);
  }));

withWhy(artifact
  .command('bulk'))
  .argument('<action>', 'Bulk action: move or delete')
  .requiredOption('--ids <csv>', 'Comma-separated artifact identifiers (UUID, alias, or URL)')
  .option('--folder <slug>', 'Target folder slug (for move)')
  .option('--team <slug>', 'Target team for the folder (for move into a team folder)')
  .option('--unfiled', 'Unfile the artifacts (for move)')
  .option('--folder-id <uuid>', 'Target workspace folder UUID (for move)')
  .option('--expected-workspace-revisions <json>', 'Map artifact identifiers to live workspace revisions')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Move many artifacts, or move them to the trash, in one call')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact bulk move --ids "id1,id2,id3" --folder reports
  $ rip artifact bulk move --ids "id1,id2" --folder research --team my-team
  $ rip artifact bulk move --ids "id1,id2" --unfiled
  $ rip artifact bulk delete --ids "id1,id2"

NOTE:
  The "delete" action moves every listed artifact to the trash, restorable
  for 30 days, and prints each one's purge date. Up to 200 ids per call.
`)
  .action(wrapCommand(async (action, options) => {
    const { artifactBulk } = await import('./commands/bulk.js');
    await artifactBulk(action, options);
  }));

withWhy(artifact
  .command('patch'))
  .argument('<identifier>', 'Artifact UUID or alias')
  .option('--metadata <json>', 'Metadata JSON object (replaces existing metadata; a table keeps its schema and strict unless you send them)')
  .option('--alias <alias>', 'New alias for the artifact')
  .option('--title <title>', 'New title for the artifact')
  .option('--description <description>', 'New description for the artifact (empty string clears it)')
  .option('--visibility <level>', 'private | link | public')
  .option('--audience <audience>', 'Set workspace audience: internal | shared without creating a version')
  .option('--expected-workspace-revision <n>', 'Required live revision for a workspace artifact')
  .addOption(retired('--workspace-session-id <id>'))
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

// Share / un-share an existing artifact with teams (Moa debrief §3.4).
const artifactTeam = artifact
  .command('team')
  .description('Share or un-share an existing artifact with teams');

artifactTeam
  .command('add')
  .argument('<identifier>', 'Artifact UUID or alias')
  .argument('<teams...>', 'One or more team slugs (or local team aliases)')
  .description('Share an existing artifact with one or more teams')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact team add my-report acme-team
  $ rip artifact team add 550e8400-... acme-team beta-squad
`)
  .action(wrapCommand(async (identifier, teams) => {
    const { artifactTeamAdd } = await import('./commands/artifact-teams.js');
    await artifactTeamAdd(identifier, teams);
  }));

artifactTeam
  .command('remove')
  .argument('<identifier>', 'Artifact UUID or alias')
  .argument('<team>', 'Team slug (or local team alias) to un-share from')
  .description('Un-share an existing artifact from a team')
  .addHelpText('after', `
EXAMPLES:
  $ rip artifact team remove my-report acme-team
`)
  .action(wrapCommand(async (identifier, team) => {
    const { artifactTeamRemove } = await import('./commands/artifact-teams.js');
    await artifactTeamRemove(identifier, team);
  }));

// ── table commands ──────────────────────────────────────────────────
const table = program
  .command('table')
  .description('Manage table rows (append, list, update, delete)');

withWhy(table
  .command('append'))
  .argument('<uuid>', 'Table artifact public ID')
  .option('--data <json>', 'Row data as inline JSON (single object or array)')
  .option('--file <path>', 'Path to JSON file with row data (object or array)')
  .option('--upsert-on <column>', 'Update the row matching this column instead of inserting (must be the table key, its unique: true column)')
  .option('--expected-workspace-revision <n>', 'Required live workspace artifact revision')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Append one or more rows to a table (max 1000 per call)')
  .addHelpText('after', `
EXAMPLES:
  $ rip table append 550e8400-... --data '{"company":"Acme","signal":"API launch"}'
  $ rip table append 550e8400-... --file rows.json
  $ rip table append 550e8400-... --data '{"slug":"post","title":"v2"}' --upsert-on slug

NOTE: Maximum 1000 rows per call. For larger datasets, split into multiple calls.

UPSERT: --upsert-on makes publishing idempotent in one call — no check-then-write,
no race. A table has at most one key, its unique: true column, and --upsert-on
must name it; every row must carry the key (MISSING_FIELD otherwise).

KEY: the key compares the exact stored text: "100" and "100.0" are different keys,
the number 1 and the string "1" are the same key. Before any row is written,
a key repeated within the call, or (without --upsert-on) a key a stored row
already holds, is rejected with 409 DUPLICATE_UNIQUE_VALUE; a key value that is
an object or array, or longer than 1024 bytes, is 400 INVALID_COLUMN_VALUE.
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
  .option('--before <rowId>', 'Cursor: show rows before this row ID (not with --after)')
  .option('--sort-by <column>', 'Sort by column name, or createdAt / updatedAt / id')
  .option('--sort-order <order>', 'Sort direction: asc or desc (default: asc)')
  .option('--filter <key=value...>', 'Filter rows (repeatable). The key may carry an operator: revenue[gte]=75')
  .option('--fields <columns>', 'Comma-separated columns to return, e.g. slug,title')
  .option('--include-total', 'Also return the total row count matching the filters')
  .description('List rows in a table')
  .addHelpText('after', `
FILTER OPERATORS:
  eq (default)  lt  lte  gt  gte  ne  in (comma-separated)  contains  starts

  Comparisons use the column's declared type, so a number column compares
  numerically and a date column chronologically. A filter or sort naming a
  column the table doesn't have is an error, not a silently ignored filter.

EXAMPLES:
  $ rip table rows 550e8400-...
  $ rip table rows 550e8400-... --limit 50
  $ rip table rows 550e8400-... --sort-by discovered_at --sort-order desc
  $ rip table rows 550e8400-... --filter ignored=false --filter action=engage
  $ rip table rows 550e8400-... --filter 'revenue[gte]=75' --filter 'tier[in]=gold,silver'
  $ rip table rows 550e8400-... --fields slug,title,excerpt --include-total
`)
  .action(wrapCommand(async (uuid, options) => {
    const { tableRows } = await import('./commands/table.js');
    await tableRows(uuid, options);
  }));

withWhy(table
  .command('update'))
  .argument('<uuid>', 'Table artifact public ID')
  .argument('<rowId>', 'Row ID to update')
  .requiredOption('--data <json>', 'Fields to update as JSON (partial merge)')
  .option('--expected-revision <n>', 'Required live row revision for a workspace row')
  .option('--expected-workspace-revision <n>', 'Required live workspace artifact revision')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Update a single row in a table')
  .addHelpText('after', `
EXAMPLES:
  $ rip table update 550e8400-... 660f9500-... --data '{"relevance":"low"}'
`)
  .action(wrapCommand(async (uuid, rowId, options) => {
    const { tableUpdate } = await import('./commands/table.js');
    await tableUpdate(uuid, rowId, options);
  }));

withWhy(table
  .command('delete'))
  .argument('<uuid>', 'Table artifact public ID')
  .requiredOption('--rows <ids>', 'Comma-separated row IDs to delete')
  .option('--expected-revisions <json>', 'Map row IDs to live row revisions for workspace deletion')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Delete rows from a table')
  .addHelpText('after', `
EXAMPLES:
  $ rip table delete 550e8400-... --rows uuid1,uuid2
`)
  .action(wrapCommand(async (uuid, options) => {
    const { tableDelete } = await import('./commands/table.js');
    await tableDelete(uuid, options);
  }));

// ── bundle commands (multi-file static-site deployment) ──────────────
//
// A bundle is a versioned tree of files. `rip deploy <dir>` zips a directory
// and uploads it as one bundle; the live site is served at
// `https://bundles.tokenrip.com/<id>/`. `rip bundle …` manages the lifecycle.
const deployOptions = (cmd: import('commander').Command) =>
  cmd
    .option('--title <title>', 'Display title (default: directory name)')
    .option('--slug <slug>', 'Human-readable slug for the bundle')
    .option('--alias <slug>', 'Alias for --slug')
    .option('--description <text>', 'Optional description')
    .option('--bundle <idOrSlug>', 'Re-deploy a new version of an existing bundle')
    .option('--visibility <v>', 'private | link | public (default: link)')
    .option('--entrypoint <file>', 'Default file to serve (default: index.html)')
    .option('--spa', 'SPA fallback — serve the entrypoint for unknown paths')
    .option('--dry-run', 'Zip and inspect locally without uploading');

const runDeploy = (dir: string, options: Record<string, unknown>) =>
  bundleDeploy(dir, { ...options, slug: (options.slug as string) ?? (options.alias as string) });

// Top-level convenience: `rip deploy <dir>`
deployOptions(
  program
    .command('deploy')
    .argument('<dir>', 'Directory to deploy as a static-site bundle')
    .description('Deploy a directory as a multi-file static site bundle')
    .addHelpText('after', `
EXAMPLES:
  $ rip deploy ./site --title "Intro to Agents" --slug intro-course
  $ rip deploy ./dist --spa
  $ rip deploy ./site --bundle intro-course   # publish a new version
`),
).action(wrapCommand(runDeploy));

const bundle = program
  .command('bundle')
  .description('Deploy and manage multi-file static site bundles');

deployOptions(bundle.command('deploy').argument('<dir>', 'Directory to deploy').description('Deploy a directory as a bundle')).action(
  wrapCommand(runDeploy),
);

bundle
  .command('list')
  .description('List your bundles')
  .action(wrapCommand(bundleList));

bundle
  .command('get')
  .argument('<idOrSlug>', 'Bundle public ID or slug')
  .description('Show a bundle: metadata, live URL, and file manifest')
  .action(wrapCommand(bundleGet));

bundle
  .command('versions')
  .argument('<idOrSlug>', 'Bundle public ID or slug')
  .description('List a bundle\'s versions, newest first')
  .action(wrapCommand(bundleVersions));

bundle
  .command('rollback')
  .argument('<idOrSlug>', 'Bundle public ID or slug')
  .argument('<version>', 'Version number to roll back to')
  .description('Flip the live site back to an earlier version')
  .action(wrapCommand(bundleRollback));

bundle
  .command('open')
  .argument('<idOrSlug>', 'Bundle public ID or slug')
  .option('--browser', 'Launch the live URL in the OS default browser (best-effort)')
  .description('Print (or open) the bundle\'s live URL')
  .action(wrapCommand(bundleOpen));

bundle
  .command('delete')
  .argument('<idOrSlug>', 'Bundle public ID or slug')
  .option('--yes', 'Confirm deletion (required)')
  .description('Move a bundle to the trash')
  .action(wrapCommand(bundleDelete));

// ── auth commands ───────────────────────────────────────────────────
const auth = program.command('auth').description('Sign in, hand off to another agent, and manage keys');

auth
  .command('login')
  .description("Sign in with the person's email and a six-digit code")
  .requiredOption('--email <email>', "The person's email address")
  .option('--code <code>', 'The six-digit code (emailed, or from a connected agent or the dashboard)')
  .option('--name <name>', 'Name for this agent\'s key (default: "Claude Code" under Claude Code, else "CLI")')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth login --email ana@example.com                # emails a six-digit code
  $ rip auth login --email ana@example.com --code 123456  # signs in with it
  $ rip auth login --email ana@example.com --code 123456 --name "laptop"

  Step 1 emails a code (it lasts 10 minutes; check spam if it does not arrive).
  Step 2 takes that code, or one a connected agent made with \`rip auth code\`,
  and gives this agent its own key on the person's account. The key is saved
  and this account becomes the current one. No other agent is disconnected.
  Signing in again replaces (and revokes) only this machine's previous key.

  A code from the key sign-in page gives a run key instead: it acts as the
  agent's saved key for this run, ends after 12 hours without use (24 hours
  at most), and cannot manage keys. A run-key sign-in revokes no key.
`)
  .action(wrapCommand(async (options) => {
    const { authLogin } = await import('./commands/auth-login.js');
    await authLogin(options);
  }));

auth
  .command('code')
  .description("Make a sign-in code for the person's next agent")
  .addHelpText('after', `
EXAMPLES:
  $ rip auth code

  Prints a line for the person to paste into their next agent: the setup
  guide, their email, and a six-digit code (valid 10 minutes, once). That
  agent signs in with it and joins the same account; no email is sent.
`)
  .action(wrapCommand(async () => {
    const { authCode } = await import('./commands/auth-keys.js');
    await authCode();
  }));

auth
  .command('link')
  .description("Make a one-time sign-in link for the person's browser")
  .option('--to <page>', 'Tokenrip page to open after sign-in: a URL or a path')
  // The retired password form's options: accepted so an old script gets the pointer, not a usage error.
  .addOption(new Option('--alias <alias>').hideHelp())
  .addOption(new Option('--password <password>').hideHelp())
  .addOption(new Option('--force').hideHelp())
  .addHelpText('after', `
EXAMPLES:
  $ rip auth link
  $ rip auth link --to https://tokenrip.com/operator/agents

  Prints a sign-in link for the person who owns this account. Give it whole,
  only to the person in this conversation; never post or store it. It signs
  their browser in once, within 10 minutes, after one click on a page that
  names the account, and the person is emailed when it is used. Never open
  it yourself: it signs a browser in as the person. Revoking this agent's
  key signs that browser out.

  A sign-in link is for the person's browser; a code for the person's next
  agent is \`rip auth code\`.
`)
  .action(wrapCommand(async (options) => {
    if (options.alias !== undefined || options.password !== undefined || options.force !== undefined) {
      const { retiredLinkForm } = await import('./commands/auth.js');
      retiredLinkForm();
    }
    const { authLink } = await import('./commands/auth-keys.js');
    await authLink({ to: options.to });
  }));

const keys = auth.command('keys').description('List, create, and revoke the keys on this account');

keys
  .command('list', { isDefault: true })
  .description('List every key: connected agents, keys made for hosts, connectors')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth keys
  $ rip auth keys list --json
`)
  .action(wrapCommand(async () => {
    const { authKeysList } = await import('./commands/auth-keys.js');
    await authKeysList();
  }));

keys
  .command('create')
  .description('Create a key for a host that takes a pasted key (a vault or settings field)')
  .requiredOption('--name <name>', 'What the key is for, e.g. "Hermes"')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth keys create --name "Hermes"

  The key is shown once. Paste it into the host's key vault or settings,
  not into a chat. It has full access to the account; revoke it any time.
`)
  .action(wrapCommand(async (options) => {
    const { authKeysCreate } = await import('./commands/auth-keys.js');
    await authKeysCreate(options);
  }));

keys
  .command('revoke')
  .argument('<id>', 'Key id from `rip auth keys`')
  .description('Revoke a key and disconnect the agent using it')
  .addHelpText('after', `
EXAMPLES:
  $ rip auth keys revoke 11111111-1111-4111-8111-111111111111

  Revoking the key this CLI uses (marked "(this agent)" in \`rip auth keys\`)
  disconnects this CLI too; sign in again afterwards.
`)
  .action(wrapCommand(async (id: string) => {
    const { authKeysRevoke } = await import('./commands/auth-keys.js');
    await authKeysRevoke(id);
  }));

auth
  .command('rotate-key')
  .alias('create-key')
  .description("Replace this agent's key (other agents keep theirs)")
  .addHelpText('after', `
EXAMPLES:
  $ rip auth rotate-key

  Revokes the key this agent uses and saves a new one. Every other key on
  the account (other agents, connectors) keeps working. Browsers this key's
  sign-in links signed in are signed out.

  Refused (ENV_KEY_ROTATION) while TOKENRIP_API_KEY is set: unset it to rotate
  a stored key; for a key kept in a host's vault, make a new one with
  \`rip auth keys create --name <name>\` and revoke the old one.
`)
  .action(wrapCommand(async () => {
    const { authRotateKey } = await import('./commands/auth.js');
    await authRotateKey();
  }));

auth
  .command('register')
  .description('Retired: use `rip auth login`')
  .option('--alias <alias>', 'Ignored')
  .option('--force', 'Ignored')
  .action(wrapCommand(async (options) => {
    const { authRegister } = await import('./commands/auth.js');
    await authRegister(options);
  }));

auth
  .command('claim')
  .argument('[code]', 'Ignored')
  .option('--label <label>', 'Ignored')
  .description('Retired: use `rip auth login`')
  .action(wrapCommand(async (code, options) => {
    const { authClaim } = await import('./commands/auth-claim.js');
    await authClaim(code, options);
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

// ── agent commands ──────────────────────────────────────────────────
const agent = program.command('account').description('Manage account identities');

agent
  .command('create')
  .description('Create a keypair identity (advanced; most agents sign in with `rip auth login`)')
  .option('--alias <name>', 'Human-readable alias')
  .addHelpText('after', `
  Generates an Ed25519 keypair and registers a new, separate account for it.
  It does not join any person's account; link it with \`rip operator-link\`.
  To work in a person's workspaces, sign in instead: rip auth login --email <email>.
`)
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
  .command('recover-key')
  .description("Get a new key for a keypair identity that lost its key")
  .addHelpText('after', `
EXAMPLES:
  $ rip account recover-key
  $ rip --agent research-bot account recover-key

  Signs a recovery request with the identity's local keypair and saves the
  new key. Other keys on the account keep working. An identity that signed
  in by email has no keypair: sign in again with \`rip auth login\`.
`)
  .action(wrapCommand(async () => {
    const { accountRecoverKey } = await import('./commands/account.js');
    await accountRecoverKey();
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

// ── activity command ───────────────────────────────────────────────
program
  .command('activity')
  .description('What happened in a team or your own scope — connections, team shares, team changes')
  .option('--team <slug>', "A team's feed (default: your own scope)")
  .option('--type <list>', 'Comma list of event types, e.g. connection.created,credential.rotated,team.member_removed')
  .option('--actor <who>', "Account id or alias, or the literal 'system'")
  .option('--subject <ref>', "'<type>:<id>' — e.g. connection:<uuid> for one subject's history")
  .option('--since <iso>', 'ISO timestamp, or a number of days back')
  .option('--limit <n>', 'Page size (max 200)')
  .option('--cursor <cursor>', 'Continue from a previous page')
  .addHelpText('after', `
EXAMPLES:
  $ rip activity --team quintel
  $ rip activity --team quintel --type connection.created --since 7
  $ rip activity --team quintel --type credential.created,credential.rotated

NOTES:
  Read-only: poll it freely. Each row's sentence is rendered server-side, so
  \`--json\` and human output tell the same story.

  Task events belong to their workspace: read them with
  \`rip workspace changes <workspace>\`.
`)
  .action(wrapCommand(async (options) => {
    const { activity } = await import('./commands/activity.js');
    await activity(options);
  }));

// ── search command ────────────────────────────────────────────────
program
  .command('search')
  .argument('<query>', 'Search text')
  .description('Search artifacts: by keyword, and by meaning inside a workspace')
  .option('--since <when>', 'ISO 8601 timestamp or integer days back (e.g. 7 = last week)')
  .option('--limit <n>', 'Max results (default: 50, max: 200)')
  .option('--offset <n>', 'Pagination offset')
  .option('--artifact-type <type>', 'Artifact type: markdown, html, code, json, text, file, chart, table')
  .option('--workspace-id <uuid>', 'Search one workspace (its UUID): ranks by keywords and meaning, returns passages')
  .option('--artifact <id>', 'Scope to one artifact (publicId or alias) — its passages, best first, up to --limit')
  .addHelpText('after', `
Inside a workspace (--workspace-id, or --artifact of a workspace document) the
search ranks by keywords and meaning together ("mode: hybrid") and prints each
result's best passages. "pending: N" counts chunks not yet searchable by
meaning. Everywhere else the ranking is by keyword.

EXAMPLES:
  $ rip search "quarterly report"
  $ rip search "chart" --artifact-type chart --since 7
  $ rip search "proposal" --limit 10
  $ rip search "how do we handle auth failures" --workspace-id <workspace-uuid>
  $ rip search "termination clause" --artifact contract-2026 --limit 5
`)
  .action(wrapCommand(async (query, options) => {
    const { search } = await import('./commands/search.js');
    await search(query, options);
  }));

// ── operator commands ───────────────────────────────────────────────
program
  .command('operator-link')
  .description('Generate a signed link and short code to link this agent to an operator account')
  .option('--expires <duration>', 'Link expiry (default: 5m). E.g. 5m, 1h, 1d')
  .addHelpText('after', `
EXAMPLES:
  $ rip operator-link
  $ rip operator-link --expires 1h

Generates a signed URL and a 6-digit code for linking this agent to a signed-in
operator account. The URL is signed locally with your Ed25519 key. The code is
generated via the server and can be entered at tokenrip.com/operator/agents.
Needs a local keypair identity. An identity that signed in with
\`rip auth login\` is already on the person's account.
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
  .description('Save a key for public reads (not used by authenticated commands)')
  .addHelpText('after', `
NOTE:
  This does not sign in. Authenticated commands use the current identity's key
  (or TOKENRIP_API_KEY), never the key saved here.
  To use a key from elsewhere, set TOKENRIP_API_KEY. To get a key of your own,
  sign in: \`rip auth login --email <your email>\`.
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

// ── connection commands ──────────────────────────────────────────────
// Repeatable `--header k=v` / `--query k=v` collector.
const collectKv = (v: string, prev: string[] = []): string[] => prev.concat(v);

const connection = program
  .command('connection')
  .description('Manage connections — where agents call an outside API with a credential the server holds (personal or team)');

connection
  .command('create')
  .requiredOption('--name <name>', 'Connection name (unique per owner)')
  .requiredOption('--base-url <url>', 'Base URL of the upstream API')
  .option('--credential <name|id>', 'Use an existing credential of the same owner (see `rip credential`); --auth-type then defaults to bearer')
  .option('--auth-type <type>', 'bearer | header | basic (required without --credential)')
  .option('--auth-header-name <name>', 'Header name when --auth-type=header (e.g. x-api-key)')
  .option('--secret <value>', 'Without --credential: the key, kept as a new credential named after the connection (prefer --secret-env / --secret-stdin)')
  .option('--secret-env <VAR>', 'Read the secret from an environment variable')
  .option('--secret-stdin', 'Read the secret from stdin')
  .option('--allowed-paths <csv>', 'Comma-separated rules "[METHOD|METHOD ]/path": * matches one path segment, ** any number (e.g. "GET|POST /v1/**")')
  .option('--header <kv>', 'Static default header key=value (repeatable)', collectKv, [])
  .option('--query <kv>', 'Static default query key=value (repeatable)', collectKv, [])
  .option('--rate-limit-per-min <n>', 'Per-minute rate limit')
  .option('--daily-quota <n>', 'Daily request quota')
  .option('--team <slug>', 'Create a team-owned connection (any current team member)')
  .description('Create a connection')
  .addHelpText('after', `
EXAMPLES:
  $ MINIMAX_KEY=sk-... rip connection create --team quintel --name minimax \\
      --base-url https://api.minimax.io/anthropic --auth-type header \\
      --auth-header-name x-api-key --secret-env MINIMAX_KEY \\
      --allowed-paths 'POST /v1/messages' --header anthropic-version=2023-06-01
  $ rip connection create --team quintel --name ga4 --credential google \\
      --base-url https://analyticsdata.googleapis.com \\
      --allowed-paths 'POST /v1beta/properties/*:runReport'

NOTES:
  Without --credential, the secret becomes a new credential named after the
  connection. Rotate a key with \`rip credential rotate <credential-id>\`: every
  connection using it sends the new key from the next call.
`)
  .action(wrapCommand(async (options) => {
    const { connectionCreate } = await import('./commands/connection.js');
    await connectionCreate(options);
  }));

connection
  .command('list')
  .option('--team <slug>', "List a team's connections")
  .option('--include-disabled', 'Include disabled connections')
  .description('List connections (secrets are never shown)')
  .action(wrapCommand(async (options) => {
    const { connectionList } = await import('./commands/connection.js');
    await connectionList(options);
  }));

connection
  .command('get')
  .argument('<id>', 'Connection id')
  .option('--team <slug>', 'Team-owned connection')
  .description('Show one connection')
  .action(wrapCommand(async (id, options) => {
    const { connectionGet } = await import('./commands/connection.js');
    await connectionGet(id, options);
  }));

connection
  .command('rotate-secret')
  .argument('<id>', 'Connection id')
  .option('--secret <value>', 'New secret (prefer --secret-env / --secret-stdin)')
  .option('--secret-env <VAR>', 'Read the new secret from an environment variable')
  .option('--secret-stdin', 'Read the new secret from stdin')
  .option('--team <slug>', 'Team-owned connection (its creator or the team owner)')
  .description('Deprecated: use `rip credential rotate`. Rotates the key of the credential this connection uses')
  .action(wrapCommand(async (id, options) => {
    const { connectionRotate } = await import('./commands/connection.js');
    await connectionRotate(id, options);
  }));

connection
  .command('disable')
  .argument('<id>', 'Connection id')
  .option('--team <slug>', 'Team-owned connection (its creator or the team owner)')
  .description('Disable a connection (frees the name)')
  .action(wrapCommand(async (id, options) => {
    const { connectionDisable } = await import('./commands/connection.js');
    await connectionDisable(id, options);
  }));

connection
  .command('rm')
  .argument('<id>', 'Connection id')
  .option('--team <slug>', 'Team-owned connection (its creator or the team owner)')
  .description('Delete a connection')
  .action(wrapCommand(async (id, options) => {
    const { connectionRemove } = await import('./commands/connection.js');
    await connectionRemove(id, options);
  }));

connection
  .command('call')
  .requiredOption('--connection <name>', 'Connection name (personal, or of --team)')
  .requiredOption('--method <M>', 'HTTP method (GET/POST/PUT/PATCH/DELETE)')
  .requiredOption('--path <path>', "Path under the connection's base URL")
  .option('--team <slug>', 'Call a team connection (you must be a current member)')
  .option('--body <json>', 'JSON request body')
  .option('--query <json>', 'JSON object of query params')
  .option('--header <kv>', 'Extra request header key=value (repeatable)', collectKv, [])
  .description('Invoke an external API through a connection you own or your team owns (auth injected server-side)')
  .addHelpText('after', `
EXAMPLES:
  $ rip connection call --team quintel --connection minimax \\
      --method POST --path /v1/messages \\
      --body '{"model":"MiniMax-M2.5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
  $ rip connection call --connection my-posthog --method GET --path /api/projects
`)
  .action(wrapCommand(async (options) => {
    const { connectionCall } = await import('./commands/connection.js');
    await connectionCall(options);
  }));

// ── credential commands ──────────────────────────────────────────────
// Repeatable `--scope <url>` / `--user <alias|id>` collector.
const collectList = (v: string, prev: string[] = []): string[] => prev.concat(v);

const credential = program
  .command('credential')
  .description('Manage credentials — keys for outside services kept encrypted on the server and used by connections (personal or team)');

credential
  .command('create')
  .requiredOption('--name <name>', 'Credential name (lowercase, unique per owner)')
  .option('--kind <kind>', 'secret | google_service_account', 'secret')
  .option('--secret <value>', 'The key (prefer --secret-env / --secret-stdin)')
  .option('--secret-env <VAR>', 'Read the key from an environment variable')
  .option('--secret-stdin', 'Read the key from stdin')
  .option('--key-file <path>', 'Read the key from a file (a Google service-account key JSON)')
  .option('--scope <url>', 'Google scope URL for a google_service_account credential (repeatable)', collectList, [])
  .option('--team <slug>', 'Create a team credential (any current team member)')
  .description('Create a credential (its key is never shown again)')
  .addHelpText('after', `
EXAMPLES:
  $ POSTHOG_KEY=phx_... rip credential create --team quintel --name posthog --secret-env POSTHOG_KEY
  $ rip credential create --team quintel --name google --kind google_service_account \\
      --key-file ./service-account.json \\
      --scope https://www.googleapis.com/auth/analytics.readonly \\
      --scope https://www.googleapis.com/auth/webmasters.readonly

NOTES:
  Then attach it: \`rip connection create --credential <name> ...\`. A Google
  credential mints short-lived tokens itself; its connections use bearer and
  an https *.googleapis.com base URL.
`)
  .action(wrapCommand(async (options) => {
    const { credentialCreate } = await import('./commands/credential.js');
    await credentialCreate(options);
  }));

credential
  .command('list')
  .option('--team <slug>', "List a team's credentials")
  .description('List credentials and the connections using each (keys are never shown)')
  .action(wrapCommand(async (options) => {
    const { credentialList } = await import('./commands/credential.js');
    await credentialList(options);
  }));

credential
  .command('get')
  .argument('<id>', 'Credential id')
  .option('--team <slug>', 'Team credential')
  .description('Show one credential')
  .action(wrapCommand(async (id, options) => {
    const { credentialGet } = await import('./commands/credential.js');
    await credentialGet(id, options);
  }));

credential
  .command('update')
  .argument('<id>', 'Credential id')
  .option('--name <name>', 'New name')
  .option('--scope <url>', 'Replace the Google scopes (repeatable; google_service_account only)', collectList, [])
  .option('--restrict', 'Only the named users may call through it (team credential)')
  .option('--unrestrict', 'Every team member may call through it again (clears the named users)')
  .option('--user <alias|id>', 'A team member who may use it once restricted (repeatable; replaces the list)', collectList, [])
  .option('--team <slug>', "Team credential (its creator or the team owner)")
  .description('Rename a credential, change its Google scopes, or name who may use it')
  .addHelpText('after', `
EXAMPLES:
  $ rip credential update <id> --team quintel --restrict --user simon --user alek
  $ rip credential update <id> --team quintel --unrestrict

NOTES:
  A restricted credential with no named users refuses everyone, the team owner
  included. It never changes the key: use \`rip credential rotate\`.
`)
  .action(wrapCommand(async (id, options) => {
    const { credentialUpdate } = await import('./commands/credential.js');
    await credentialUpdate(id, options);
  }));

credential
  .command('rotate')
  .argument('<id>', 'Credential id')
  .option('--secret <value>', 'The new key (prefer --secret-env / --secret-stdin)')
  .option('--secret-env <VAR>', 'Read the new key from an environment variable')
  .option('--secret-stdin', 'Read the new key from stdin')
  .option('--key-file <path>', 'Read the new key from a file (a Google service-account key JSON)')
  .option('--team <slug>', "Team credential (its creator or the team owner)")
  .description('Replace a credential\'s key; every connection using it sends the new key from the next call')
  .action(wrapCommand(async (id, options) => {
    const { credentialRotate } = await import('./commands/credential.js');
    await credentialRotate(id, options);
  }));

credential
  .command('rm')
  .argument('<id>', 'Credential id')
  .option('--team <slug>', "Team credential (its creator or the team owner)")
  .description('Delete a credential (refused while a connection uses it)')
  .action(wrapCommand(async (id, options) => {
    const { credentialRemove } = await import('./commands/credential.js');
    await credentialRemove(id, options);
  }));

// ── skill commands ───────────────────────────────────────────────────
const skill = program
  .command('skill')
  .description('Skills — versioned folders of agent instructions (SKILL.md) owned by your operator or a team');

skill
  .command('list')
  .option('--team <slug>', "Only this team's skills")
  .description('List the skills in reach: your operator\'s personal skills and your teams\' skills')
  .addHelpText('after', `
EXAMPLES:
  $ rip skill list
  $ rip skill list --team quintel
`)
  .action(wrapCommand(async (options) => {
    const { skillList } = await import('./commands/skill.js');
    await skillList(options);
  }));

skill
  .command('get')
  .argument('<skill>', 'Skill name, id, or link (…/skills/<id>)')
  .option('--team <slug>', "The team's skill of that name (without it, a name means a personal skill)")
  .option('--file <path>', 'Write one file of the skill to stdout (raw bytes)')
  .option('--dir <folder>', 'Write every file into a new or empty folder')
  .description('Print a skill\'s instructions and file list, or fetch its files')
  .addHelpText('after', `
EXAMPLES:
  $ rip skill get blog-post
  $ rip skill get blog-post --team quintel --file references/style.md
  $ rip skill get https://tokenrip.com/skills/<id>          # link-shared: no identity needed
  $ rip skill get blog-post --dir ./blog-post                # edit locally, then publish
`)
  .action(wrapCommand(async (ref, options) => {
    const { skillGet } = await import('./commands/skill.js');
    await skillGet(ref, options);
  }));

skill
  .command('publish')
  .argument('<folder>', 'Folder with SKILL.md (frontmatter name and description) and any supporting files')
  .option('--team <slug>', 'Publish as a team skill (any current member)')
  .option('--expected-version <n>', 'Compare the folder with version <n> and refuse if the skill is no longer at it (0: must not exist)')
  .description('Publish a folder as the next version of the skill its SKILL.md names (creates it on first publish)')
  .addHelpText('after', `
The folder is compared with its base version: the version \`rip skill get --dir\` fetched it
at (or this folder last published), else the current version, unless --expected-version is
given. Changed and new files are sent; files of the base version missing from the folder are
removed. If anyone published since the base version, nothing is published and the server
answers CONFLICT: fetch the current version with \`rip skill get <name> --dir <new-folder>\`,
merge your changes into it, and publish that folder.

EXAMPLES:
  $ rip skill publish ./blog-post
  $ rip skill publish ./blog-post --team quintel
  $ rip skill publish ./blog-post --expected-version 4
`)
  .action(wrapCommand(async (folder, options) => {
    const { skillPublish } = await import('./commands/skill.js');
    await skillPublish(folder, options);
  }));

skill
  .command('share')
  .argument('<skill>', 'Skill name or id')
  .option('--team <slug>', "The team's skill of that name (owner or admin)")
  .option('--link', 'Anyone with the link can read and install it')
  .option('--private', 'Stop link sharing')
  .description('Share a skill by link, or stop sharing it')
  .addHelpText('after', `
EXAMPLES:
  $ rip skill share blog-post --link
  $ rip skill share blog-post --team quintel --private
`)
  .action(wrapCommand(async (ref, options) => {
    const { skillShare } = await import('./commands/skill.js');
    await skillShare(ref, options);
  }));

skill
  .command('delete')
  .argument('<skill>', 'Skill name or id')
  .option('--team <slug>', "The team's skill of that name (owner or admin)")
  .description('Delete a skill and every version (cannot be undone)')
  .addHelpText('after', `
EXAMPLES:
  $ rip skill delete old-procedure
  $ rip skill delete old-procedure --team quintel
`)
  .action(wrapCommand(async (ref, options) => {
    const { skillDelete } = await import('./commands/skill.js');
    await skillDelete(ref, options);
  }));

skill
  .command('install')
  .option('--target <target>', 'claude (~/.claude/skills) or agents (~/.agents/skills); default claude inside Claude Code, else agents')
  .description('Write a stub for every skill in reach into your skills folder, so the host triggers them natively')
  .addHelpText('after', `
Each stub is a folder with the skill's name and description and a body that runs
rip skill get <skill-id> as this agent. Re-running refreshes changed stubs and
removes stubs whose skill is gone, deleting only files it wrote. Only folders the
CLI wrote for this agent (marked with .tokenrip-skill.json) are touched; a local
skill or another agent's stub with the same name is left alone and reported.

Run it again after skills are published, renamed or deleted. Install into one
target per host: Cursor and Copilot read both folders.

EXAMPLES:
  $ rip skill install
  $ rip skill install --target agents     # hosts that read ~/.agents/skills
  $ rip skill install --target claude     # Claude Code
`)
  .action(wrapCommand(async (options) => {
    const { skillInstall } = await import('./commands/skill.js');
    await skillInstall(options);
  }));

// ── task commands ────────────────────────────────────────────────────
const collectResult = (v: string, prev: string[] = []): string[] => prev.concat(v);

const task = program
  .command('task')
  .description('Work in a workspace: propose before acting outside it, report what you did, decide reviews addressed to you, and start and complete tasks');

task
  .command('list')
  .requiredOption('--workspace-id <id>', 'The workspace whose tasks to list')
  .option('--status <list>', "Comma list of todo,doing,review,done,cancelled or 'all' (default todo,doing)")
  .option('--kind <kind>', 'Only tasks of this kind')
  .option('--mine', 'Only tasks for you (your person, or you as an agent) or held by you')
  .option('--reviewer <me>', "Only 'me': reviews In review addressed to you (rip task decide them)")
  .option('--parent <id>', "Only this task's children")
  .option('--since <iso>', 'Only tasks created after this ISO timestamp')
  .option('--order <order>', "created (default, newest first) or finished (newest finish first; only with --status done and/or cancelled)")
  .option('--limit <n>', 'Page size (max 200)')
  .option('--cursor <cursor>', 'Continue from a previous page (same filters and order)')
  .description('List tasks')
  .action(wrapCommand(async (options) => {
    const { taskList } = await import('./commands/task.js');
    await taskList(options);
  }));

task
  .command('show')
  .argument('<id>', 'Task id')
  .description('Show one task: who it is for and who reviews it, the draft and the approved text to carry out, the decision, the result and links, children and recent history')
  .action(wrapCommand(async (id) => {
    const { taskShow } = await import('./commands/task.js');
    await taskShow(id);
  }));

withWhy(task
  .command('update'))
  .argument('<id>', 'Task id')
  .requiredOption('--expected-revision <n>', 'Current task revision')
  .option('--title <title>', 'Replace the title')
  .option('--body <markdown>', 'Replace the body')
  .option('--assignee <who>', 'Who it is for: a person (account id or alias) or agent:<handle> from rip workspace load')
  .option('--reviewer <who>', 'Who decides its proposal: a person or agent:<handle>; never the assignee')
  .option('--audience <audience>', 'Visibility: internal or shared')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Update task metadata')
  .action(wrapCommand(async (id, options) => {
    const { taskUpdate } = await import('./commands/task.js');
    await taskUpdate(id, options);
  }));

withWhy(task
  .command('add'))
  .argument('<title>', 'Task title')
  .requiredOption('--workspace-id <id>', 'The workspace to file the task in')
  .option('--audience <audience>', 'Workspace audience: internal | shared (requires --workspace-id)')
  .addOption(retired('--workspace-session-id <id>'))
  .option('--assignee <who>', 'Who it is for: a person (account id or alias) or agent:<handle> from rip workspace load')
  .option('--reviewer <who>', 'Who decides its proposal: a person or agent:<handle>; never the assignee')
  .option('--parent <id>', 'A task in the same workspace this one belongs under')
  .option('--kind <kind>', 'Task kind (lowercase slug, e.g. process-call)')
  .option('--body <markdown>', 'Details')
  .option('--due <iso>', 'Due date (informational)')
  .option('--payload <json>', 'Kind-specific JSON payload')
  .description('File a task')
  .addHelpText('after', `
EXAMPLES:
  $ rip task add "Review pricing page copy" --workspace-id 4f2c1b90-... --assignee alek
  $ rip task add "Draft the launch post" --workspace-id 4f2c1b90-... --assignee agent:9b1d0e2a-... --reviewer alek
  $ rip task add "Renew domain" --workspace-id 4f2c1b90-... --due 2026-10-01
`)
  .action(wrapCommand(async (title, options) => {
    const { taskAdd } = await import('./commands/task.js');
    await taskAdd(title, options);
  }));

withWhy(task
  .command('start'))
  .argument('<id>', 'Task id')
  .option('--lease-hours <n>', 'Lease length in hours (0.25–72, default 2)')
  .description('Start a task: it becomes yours under a lease; starting your own again renews it')
  .action(wrapCommand(async (id, options) => {
    const { taskStart } = await import('./commands/task.js');
    await taskStart(id, options);
  }));

withWhy(task
  .command('stop'))
  .argument('<id>', 'Task id')
  .description('Stop a task you hold; it goes back to To do (workspace admins may stop anyone\'s)')
  .action(wrapCommand(async (id, options) => {
    const { taskStop } = await import('./commands/task.js');
    await taskStop(id, options);
  }));

withWhy(task
  .command('done'))
  .argument('<id>', 'Task id')
  .option('--result <type:id>', 'Attach a result: artifact:<publicId>[@version] or url:<https://…> (repeatable)', collectResult, [])
  .option('--result-text <text>', 'What came of it, at most 280 characters (e.g. "4 likes")')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Complete a task: one that is free (To do) or yours. An approved proposal: carry out exactly its approved text first')
  .action(wrapCommand(async (id, options) => {
    const { taskDone } = await import('./commands/task.js');
    await taskDone(id, options);
  }));

withWhy(task
  .command('cancel'))
  .argument('<id>', 'Task id')
  .option('--reason <text>', 'Why it will not be done')
  .description('Cancel a task that will not be done (reopenable)')
  .action(wrapCommand(async (id, options) => {
    const { taskCancel } = await import('./commands/task.js');
    await taskCancel(id, options);
  }));

withWhy(task
  .command('reopen'))
  .argument('<id>', 'Task id')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Reopen a done or cancelled task')
  .action(wrapCommand(async (id, options) => {
    const { taskReopen } = await import('./commands/task.js');
    await taskReopen(id, options);
  }));

withWhy(task
  .command('propose'))
  .argument('[id]', 'A task that is free or yours, or your own proposal (omit for a new proposal)')
  .option('--workspace-id <id>', 'A new proposal: the workspace')
  .option('--title <title>', 'A new proposal: what you would do')
  .option('--draft <text>', 'The exact text the action uses (the post, the email)')
  .option('--draft-file <path>', 'Read the draft from a file, verbatim')
  .option('--verb <verb>', 'The approve button\'s word, e.g. Post or Send (default Approve)')
  .option('--kind <kind>', 'The kind of work (lowercase slug, e.g. x-reply); your instructions may let some kinds run on their own')
  .option('--reviewer <who>', 'Who decides: a person or agent:<handle> (default your own person; never you)')
  .option('--parent <id>', 'A new proposal: a task in the same workspace it belongs under')
  .option('--body <markdown>', 'A new proposal: context for the reviewer')
  .option('--audience <audience>', 'A new proposal: internal | shared')
  .option('--link <type:id>', 'Attach a link: artifact:<publicId>[@version] or url:<https://…> (repeatable)', collectResult, [])
  .description('Propose an action before it leaves the workspace; it waits In review, or comes back doing and approved when your instructions allow its kind')
  .addHelpText('after', `
EXAMPLES:
  $ rip task propose --workspace-id 4f2c1b90-... --title "Reply to @jen" --draft-file reply.txt --verb Post --kind x-reply
  $ rip task propose 7a1c2d1e-... --draft "Thanks Jen, we ship Thursday!"     # a task you are doing, or your own proposal

In review: stop; on a later run, rip workspace load lists it under Waiting on you once it is approved.
Doing and approved: carry out exactly its approved text now, then rip task done <id> --result-text "…".
`)
  .action(wrapCommand(async (id, options) => {
    const { taskPropose } = await import('./commands/task.js');
    await taskPropose(id, options);
  }));

withWhy(task
  .command('report'))
  .argument('[id]', 'A Done task to add a later result to (omit for a new report)')
  .option('--workspace-id <id>', 'A new report: the workspace')
  .option('--title <title>', 'A new report: what you did')
  .option('--result-text <text>', 'What came of it, at most 280 characters; a later result replaces it')
  .option('--link <type:id>', 'Attach a link: artifact:<publicId>[@version] or url:<https://…> (repeatable)', collectResult, [])
  .option('--kind <kind>', 'A new report: the kind of work')
  .option('--parent <id>', 'A new report: a task in the same workspace it belongs under')
  .option('--body <markdown>', 'A new report: details')
  .option('--audience <audience>', 'A new report: internal | shared')
  .description('Report work you already did that needed no approval (born Done), or add a later result to a Done task')
  .addHelpText('after', `
EXAMPLES:
  $ rip task report --workspace-id 4f2c1b90-... --title "Sent the weekly digest" --result-text "38% opened" --link url:https://...
  $ rip task report 7a1c2d1e-... --result-text "12 likes"
`)
  .action(wrapCommand(async (id, options) => {
    const { taskReport } = await import('./commands/task.js');
    await taskReport(id, options);
  }));

withWhy(task
  .command('decide'))
  .argument('<id>', 'A task In review whose reviewer is you (rip task list --reviewer me)')
  .option('--approve', 'Approve it')
  .option('--skip', 'Skip it: it is cancelled')
  .requiredOption('--expected-revision <n>', 'The revision you read; a draft replaced since is refused CONFLICT')
  .option('--edited-draft <text>', 'With --approve: the text to carry out instead of the draft')
  .option('--edited-draft-file <path>', 'With --approve: read the edited draft from a file, verbatim')
  .option('--note <text>', 'With --skip: why not')
  .description('Decide a review addressed to you: approve (optionally with an edited draft) or skip')
  .addHelpText('after', `
EXAMPLES:
  $ rip task decide 7a1c2d1e-... --approve --expected-revision 3
  $ rip task decide 7a1c2d1e-... --approve --expected-revision 3 --edited-draft-file edited.txt
  $ rip task decide 7a1c2d1e-... --skip --expected-revision 3 --note "Not this week"
`)
  .action(wrapCommand(async (id, options) => {
    const { taskDecide } = await import('./commands/task.js');
    await taskDecide(id, options);
  }));

/**
 * The old task words, hidden until the task vocabulary window closes (workspace tasks plan M4).
 * Each prints one note on stderr and runs the new command, which posts the new route: a 2.5.1 CLI
 * never posts an old one, so the window query counts only older clients. touch runs start, so it
 * needs a why as start does.
 */
const TASK_ALIASES = [
  { name: 'claim', note: 'Deprecated: use rip task start', lease: true, reason: false, run: 'taskStart' },
  { name: 'touch', note: 'Deprecated: use rip task start, which renews your hold and, like start, needs a why (--why or TOKENRIP_WHY)', lease: true, reason: false, run: 'taskStart' },
  { name: 'release', note: 'Deprecated: use rip task stop', lease: false, reason: false, run: 'taskStop' },
  { name: 'dismiss', note: 'Deprecated: use rip task cancel', lease: false, reason: true, run: 'taskCancel' },
] as const;
for (const alias of TASK_ALIASES) {
  const command = withWhy(task.command(alias.name, { hidden: true }))
    .argument('<id>', 'Task id')
    .addOption(retired('--workspace-session-id <id>'))
    .description(alias.note);
  if (alias.lease) command.option('--lease-hours <n>', 'Lease length in hours (0.25–72, default 2)');
  if (alias.reason) command.option('--reason <text>', 'Why it will not be done');
  command.action(wrapCommand(async (id, options) => {
    console.error(alias.note);
    const commands = await import('./commands/task.js');
    await commands[alias.run](id, options);
  }));
}

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

  An agent under your operator is added directly. An agent under another
  operator is not: you get a one-time invite token (valid 7 days) to send it,
  and it joins with: rip team accept-invite <token>
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
  .description('Generate a one-time invite token for the team (7 days; the recipient runs rip team accept-invite <token>)')
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

// ── workspace commands ──────────────────────────────────────────────
const workspace = program
  .command('workspace')
  .alias('ws')
  .description('Workspaces — internal/shared collaboration over artifacts, folders, and tasks');

withWhy(workspace
  .command('create'))
  .argument('<slug>', 'Workspace slug (unique within your account or team)')
  .option('--name <name>', 'Display name (defaults to slug)')
  .option('--description <text>', 'Workspace description')
  .option('--team-id <uuid>', 'Make this a team-owned workspace (the team id from `rip team list`; team owners and admins only)')
  .description('Create a workspace')
  .addHelpText('after', `
EXAMPLES:
  $ rip workspace create research --name "Research"
  $ rip workspace create roadmap --team-id 7c9e6679-7425-40de-944b-e07fc1f90ae7
`)
  .action(wrapCommand(async (slug, options) => {
    const { workspaceCreate } = await import('./commands/workspace.js');
    await workspaceCreate(slug, options);
  }));

workspace
  .command('list')
  .description('List the workspaces you can access')
  .action(wrapCommand(async () => {
    const { workspaceList } = await import('./commands/workspace.js');
    await workspaceList();
  }));

workspace
  .command('show')
  .argument('<workspace>', 'Workspace id (UUID)')
  .description('Show workspace identity and capabilities')
  .addOption(retired('--session-cursor <cursor>'))
  .action(wrapCommand(async (ws) => {
    const { workspaceShow } = await import('./commands/workspace.js');
    await workspaceShow(ws);
  }));

withWhy(workspace
  .command('update'))
  .argument('<workspace>', 'Workspace UUID')
  .option('--name <name>', 'New display name')
  .option('--description <text>', 'New description')
  .description('Update workspace metadata')
  .action(wrapCommand(async (ws, options) => { const { workspaceUpdate } = await import('./commands/workspace.js'); await workspaceUpdate(ws, options); }));

withWhy(workspace
  .command('delete'))
  .argument('<workspace>', 'Workspace id (UUID)')
  .description('Move a workspace and everything in it to the trash (restorable for 30 days)')
  .action(wrapCommand(async (ws, options) => {
    const { workspaceDelete } = await import('./commands/workspace.js');
    await workspaceDelete(ws, options);
  }));

// workspace member subgroup
const workspaceMember = workspace.command('member').description('Invite people to a workspace and manage their access');
const memberTargetHelp = 'Member row id (from `member list`), account id, or email address (its person\'s primary-account row, or the row an add or invite by it made)';
withWhy(workspaceMember
  .command('set-role'))
  .argument('<workspace>', 'Workspace UUID')
  .argument('<member>', memberTargetHelp)
  .requiredOption('--role <role>', 'viewer | editor')
  .option('--membership <membership>', 'internal (sees everything) | external (shared items only); kept when omitted')
  .description('Change a member\'s or invite\'s access (workspace admins only)')
  .action(wrapCommand(async (ws, member, options) => { const { workspaceMemberSetRole } = await import('./commands/workspace.js'); await workspaceMemberSetRole(ws, member, options.role, options); }));
withWhy(workspaceMember
  .command('add'))
  .argument('<workspace>', 'Workspace id (UUID)')
  .argument('<account>', 'Email, alias or account id. An email with no Tokenrip account becomes an invite')
  .option('--membership <membership>', 'internal (sees everything) | external (shared items only) (default internal)')
  .option('--role <role>', 'viewer | editor (default editor)')
  .option('--note <text>', 'A short note for the invite email (at most 280 characters)')
  .description('Add or invite someone (internal admins and editors). Tokenrip emails invites and adds by address, naming your verified address; an add by alias or id is emailed only when both accounts have one verified person')
  .action(wrapCommand(async (ws, account, options) => {
    const { workspaceMemberAdd } = await import('./commands/workspace.js');
    await workspaceMemberAdd(ws, account, options);
  }));
withWhy(workspaceMember
  .command('remove'))
  .argument('<workspace>', 'Workspace id (UUID)')
  .argument('<member>', memberTargetHelp)
  .description('Remove a member or cancel an invite (workspace admins only)')
  .action(wrapCommand(async (ws, member, options) => {
    const { workspaceMemberRemove } = await import('./commands/workspace.js');
    await workspaceMemberRemove(ws, member, options);
  }));
workspaceMember
  .command('list')
  .argument('<workspace>', 'Workspace id (UUID)')
  .description('List members and pending invites (each invite has a shareable inviteUrl)')
  .action(wrapCommand(async (ws) => {
    const { workspaceMemberList } = await import('./commands/workspace.js');
    await workspaceMemberList(ws);
  }));

withWhy(workspace
  .command('adopt'))
  .argument('<workspace>', 'Workspace UUID')
  .argument('<item>', 'Artifact identifier or folder UUID')
  .requiredOption('--audience <audience>', 'internal | shared')
  .option('--kind <kind>', 'artifact | folder', 'artifact')
  .option('--destination-folder-id <uuid>', 'Destination workspace folder UUID')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Move standalone content into workspace authority; sharing exposes full artifact history')
  .action(wrapCommand(async (ws, item, options) => { const { workspaceAdopt } = await import('./commands/workspace.js'); await workspaceAdopt(ws, item, options); }));

const workspacePinGroup = workspace.command('pin').description('Manage ordered markdown context pins');
workspacePinGroup.command('add').argument('<workspace>').argument('<artifact-id>').option('--position <n>').action(wrapCommand(async (ws, artifactId, options) => { const { workspacePin } = await import('./commands/workspace.js'); await workspacePin(ws, artifactId, options); }));
workspacePinGroup.command('remove').argument('<workspace>').argument('<artifact-id>').action(wrapCommand(async (ws, artifactId) => { const { workspaceUnpin } = await import('./commands/workspace.js'); await workspaceUnpin(ws, artifactId); }));

workspace.command('load').argument('<workspace>').addOption(retired('--operation-id <id>')).addOption(retired('--session-id <id>')).option('--artifact-offset <n>').option('--task-cursor <cursor>').option('--activity-cursor <cursor>').option('--handoff-offset <n>').description('Load bounded context: pins, artifacts, open tasks, recent changes, recent sessions (steps: each goal with the changes made for it), handoff notes, and your browser link').action(wrapCommand(async (ws, options) => { const { workspaceLoad } = await import('./commands/workspace.js'); await workspaceLoad(ws, { artifactOffset: options.artifactOffset, taskCursor: options.taskCursor, activityCursor: options.activityCursor, handoffOffset: options.handoffOffset }); }));
const workspaceSession = workspace.command('session').description('Retired: sessions record themselves; read them with `rip workspace sessions`');
workspaceSession.command('end').argument('<workspace>').argument('<session-id>').option('--summary <text>').option('--handoff-artifact-id <id>').description('Retired: sessions record themselves; prints the server refusal. Leave a note with `rip artifact publish --handoff`').action(wrapCommand(async (ws, sessionId, options) => { const { workspaceSessionEnd } = await import('./commands/workspace.js'); await workspaceSessionEnd(ws, sessionId, options); }));
const workspaceView = workspace.command('view').description('Inspect or explicitly navigate a paired browser view');
// Addressed by workspace: the view follows the caller's key. An old invocation's session id (plan D7) is an excess positional, ignored with one notice.
workspaceView.command('context').argument('<workspace>').allowExcessArguments(true).description("Read the browser tab paired to this agent's key").action(wrapCommand(async (ws, _options, command) => { const { workspaceViewContext } = await import('./commands/workspace.js'); await workspaceViewContext(ws, command.args[1]); }));
workspaceView.command('open').argument('<workspace>').argument('<artifact-id>').allowExcessArguments(true).requiredOption('--operation-id <id>').requiredOption('--expected-context-generation <n>').description("Ask the browser tab paired to this agent's key to open an artifact").action(wrapCommand(async (ws, artifactId, options, command) => { const { workspaceViewOpen } = await import('./commands/workspace.js'); const legacy = command.args.length > 2; await workspaceViewOpen(ws, legacy ? command.args[2] : artifactId, options.operationId, options.expectedContextGeneration, legacy ? artifactId : undefined); }));
workspace.command('sessions').argument('<workspace>').option('--cursor <cursor>', 'Continue from a previous page').description('Recent sessions, newest first: who worked (you or someone else, their agent or the browser), from which harness, and steps: each goal with the changes made for it').action(wrapCommand(async (ws, options) => { const { workspaceSessions } = await import('./commands/workspace.js'); await workspaceSessions(ws, options); }));
workspace.command('changes').argument('<workspace>').option('--limit <n>').option('--delivery-token <token>').description('Read bounded workspace changes without acknowledging them: who made each, why, and the item by title and id').action(wrapCommand(async (ws, options) => { const { workspaceChanges } = await import('./commands/workspace.js'); await workspaceChanges(ws, options); }));
workspace.command('ack').argument('<workspace>').requiredOption('--delivery-token <token>').description('Acknowledge one delivered workspace change page').action(wrapCommand(async (ws, options) => { const { workspaceChangesAck } = await import('./commands/workspace.js'); await workspaceChangesAck(ws, options.deliveryToken); }));

// ── folder commands ─────────────────────────────────────────────────
const folder = program
  .command('folder')
  .description('Manage folders');

withWhy(folder
  .command('create'))
  .argument('<slug>', 'Folder slug (lowercase, alphanumeric, hyphens)')
  .option('--team <slug>', 'Create as a team folder')
  .option('--workspace <workspace-id>', 'Create inside a workspace; no expected revision required')
  .option('--audience <audience>', 'Workspace audience: internal | shared (requires --workspace)')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Create a new folder')
  .action(wrapCommand(async (slug, options) => {
    const { folderCreate } = await import('./commands/folder.js');
    await folderCreate(slug, options);
  }));

folder
  .command('list')
  .option('--team <slug>', 'List team folders')
  .option('--workspace <workspace-id>', 'List visible folders in a workspace')
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
  .description('Move a folder and the artifacts in it to the trash (restorable for 30 days)')
  .addHelpText('after', `
EXAMPLES:
  $ rip folder delete drafts
  $ rip folder delete research --team my-team

NOTE:
  The folder and every artifact in it leave listings; reads of those
  artifacts answer 410 through the folder. Restoring the folder brings them
  back filed as they were. The slug stays held while it is in the trash.
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
  .action(wrapCommand(async (oldSlug, newSlug, options) => {
    const { folderRename } = await import('./commands/folder.js');
    await folderRename(oldSlug, newSlug, options);
  }));

withWhy(folder
  .command('update'))
  .argument('<folder-id>', 'Workspace folder UUID')
  .requiredOption('--workspace <workspace-id>', 'Workspace UUID')
  .requiredOption('--audience <audience>', 'internal | shared')
  .requiredOption('--expected-workspace-revision <n>', 'Live folder workspace revision')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Change a workspace folder audience')
  .action(wrapCommand(async (folderId, options) => {
    const { folderUpdate } = await import('./commands/folder.js');
    await folderUpdate(folderId, options);
  }));

withWhy(folder
  .command('share-contents'))
  .argument('<folder-id>', 'Workspace folder UUID')
  .requiredOption('--workspace <workspace-id>', 'Workspace UUID')
  .requiredOption('--expected-workspace-revision <n>', 'Live folder workspace revision')
  .addOption(retired('--workspace-session-id <id>'))
  .description('Atomically share a workspace folder and all current child artifacts')
  .action(wrapCommand(async (folderId, options) => {
    const { folderShareContents } = await import('./commands/folder.js');
    await folderShareContents(folderId, options);
  }));

// ── trash commands ──────────────────────────────────────────────────
const trash = program
  .command('trash')
  .description('List what is in the trash and bring items back (restorable for 30 days after deletion)');

trash
  .command('list')
  .option('--workspace <workspace-id>', "A workspace's trash: the artifacts and folders deleted in it")
  .option('--team <slug>', "A team's trash: its folders and workspaces")
  .option('--limit <n>', 'Page size (max 100, default 50)')
  .option('--offset <n>', 'Skip this many entries (the nextOffset of the previous page)')
  .description('List the trash, newest first (default: your own)')
  .addHelpText('after', `
EXAMPLES:
  $ rip trash list
  $ rip trash list --team acme
  $ rip trash list --workspace 3f1a2b4c-5d6e-4f70-8901-23456789abcd

NOTES:
  Your own trash holds your standalone artifacts, bundles, personal folders and
  personal workspaces. A deleted folder or workspace is one entry: restoring it
  brings back everything that went with it. Each entry says when it purges.
`)
  .action(wrapCommand(async (options) => {
    const { trashList } = await import('./commands/trash.js');
    await trashList(options);
  }));

withWhy(trash
  .command('restore'))
  .argument('<type>', 'artifact | bundle | folder | workspace (from `rip trash list`)')
  .argument('<id>', 'The entry id from `rip trash list`')
  .option('--expected-workspace-revision <n>', "Required for a workspace artifact or folder: the entry's workspace revision")
  .addOption(retired('--workspace-session-id <id>'))
  .description('Bring an item back from the trash')
  .addHelpText('after', `
EXAMPLES:
  $ rip trash restore artifact 550e8400-e29b-41d4-a716-446655440000
  $ rip trash restore folder 3f1a2b4c-5d6e-4f70-8901-23456789abcd --expected-workspace-revision 4

NOTES:
  Restoring needs the same authority as deleting. The item returns to its folder,
  workspace and name. A file whose folder is still in the trash comes back
  unfiled; one whose workspace is in the trash is refused until the workspace is
  restored. Restoring a live item does nothing.
`)
  .action(wrapCommand(async (type, id, options) => {
    const { trashRestore } = await import('./commands/trash.js');
    await trashRestore(type, id, options);
  }));

runMigrations();

const _cfg = loadConfig();
if (_cfg.preferences?.outputFormat === 'human') setConfigHuman(true);

checkForUpdate().catch(() => {});

program.parse();
