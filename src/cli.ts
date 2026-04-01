#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { configSetKey, configSetUrl, configShow } from './commands/config.js';
import { authCreateKey } from './commands/auth.js';
import { upload } from './commands/upload.js';
import { publish } from './commands/publish.js';
import { status } from './commands/status.js';
import { deleteAsset } from './commands/delete.js';
import { update } from './commands/update.js';
import { deleteVersion } from './commands/delete-version.js';
import { stats } from './commands/stats.js';
import { wrapCommand, setForceJson } from './output.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();
program
  .name('tokenrip')
  .description('Tokenrip — Asset coordination for AI agents')
  .version(version)
  .option('--json', 'Force JSON output even in interactive terminal')
  .hook('preAction', () => {
    if (program.opts().json) setForceJson(true);
  })
  .addHelpText('after', `
QUICK START:
  1. Create an API key (auto-saved):
     $ tokenrip auth create-key

  2. Start sharing assets:
     $ tokenrip asset publish examples/report.md --type markdown
     $ tokenrip asset upload image.png --title "Screenshot"

  3. Check your assets:
     $ tokenrip asset list
`);

// ── asset commands ──────────────────────────────────────────────────
const asset = program
  .command('asset')
  .description('Create, manage, and inspect assets');

asset
  .command('upload')
  .argument('<file>', 'File path to upload (PDF, image, document, etc.)')
  .option('--title <title>', 'Display title for the asset')
  .option('--parent <uuid>', 'Parent asset ID for lineage tracking')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--refs <urls>', 'Comma-separated input reference URLs')
  .option('--dry-run', 'Validate inputs without uploading')
  .description('Upload a file and get a shareable UUID link')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset upload report.pdf --title "Agent Analysis"
  $ tokenrip asset upload chart.png --context "Claude Agent 1" \\
    --refs "https://source.example.com,https://another.com"
`)
  .action(wrapCommand(upload));

asset
  .command('publish')
  .argument('<file>', 'File containing the content to publish')
  .requiredOption('--type <type>', 'Content type: markdown, html, chart, code, text, or json')
  .option('--title <title>', 'Display title for the asset')
  .option('--parent <uuid>', 'Parent asset ID for lineage tracking')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--refs <urls>', 'Comma-separated input reference URLs')
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

EXAMPLES:
  $ tokenrip asset publish analysis.md --type markdown --title "Summary"
  $ tokenrip asset publish data.json --type chart \\
    --context "Data viz agent" --refs "https://api.example.com"
`)
  .action(wrapCommand(publish));

asset
  .command('list')
  .option('--since <iso-date>', 'Only show assets modified after this timestamp (ISO 8601)')
  .option('--limit <n>', 'Maximum number of assets to return (default: 20)', '20')
  .option('--type <type>', 'Filter by asset type (markdown, html, chart, code, text, file)')
  .description('List your published assets and their metadata')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset list
  $ tokenrip asset list --since 2026-03-30T00:00:00Z
  $ tokenrip asset list --type markdown --limit 5
`)
  .action(wrapCommand(status));

asset
  .command('delete')
  .argument('<uuid>', 'Asset ID to delete')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .description('Permanently delete an asset and its shareable link')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset delete 550e8400-e29b-41d4-a716-446655440000

CAUTION:
  This permanently removes the asset and its shareable link.
  This action cannot be undone.
`)
  .action(wrapCommand(deleteAsset));

asset
  .command('update')
  .argument('<uuid>', 'Asset ID to update with a new version')
  .argument('<file>', 'File containing the new version content')
  .option('--type <type>', 'Content type (markdown, html, chart, code, text) — omit for binary file upload')
  .option('--label <text>', 'Human-readable label for this version')
  .option('--context <text>', 'Creator context (your agent name, task, etc.)')
  .option('--dry-run', 'Validate without publishing')
  .description('Publish a new version of an existing asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset update 550e8400-... report-v2.md --type markdown
  $ tokenrip asset update 550e8400-... chart.png --label "with axes fixed"
`)
  .action(wrapCommand(update));

asset
  .command('delete-version')
  .argument('<uuid>', 'Asset ID')
  .argument('<versionId>', 'Version ID to delete')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .description('Delete a specific version of an asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset delete-version 550e8400-... 660f9500-...

CAUTION:
  This permanently removes the version content.
  Cannot delete the last remaining version — delete the asset instead.
`)
  .action(wrapCommand(deleteVersion));

asset
  .command('stats')
  .description('Show storage usage statistics')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset stats

Shows total asset count and storage bytes broken down by type.
`)
  .action(wrapCommand(stats));

// ── auth commands ───────────────────────────────────────────────────
const auth = program.command('auth').description('Manage API keys and authentication');

auth
  .command('create-key')
  .option('--name <name>', 'Friendly name for this key (default: tokenrip-<hostname>)')
  .option('--no-save', 'Create key but do not auto-save to config')
  .description('Create a new API key')
  .addHelpText('after', `
EXAMPLES:
  Create a key with a default name (auto-saved):
    $ tokenrip auth create-key

  Create a key with a custom name:
    $ tokenrip auth create-key --name "My Agent"

  Create a key without auto-saving:
    $ tokenrip auth create-key --no-save

The API key is sensitive — treat it like a password.
`)
  .action(wrapCommand(authCreateKey));

// ── config commands ─────────────────────────────────────────────────
const config = program.command('config').description('Manage CLI configuration');

config
  .command('set-key')
  .argument('<key>', 'API key from /v0/auth/keys')
  .description('Save your API key for authentication')
  .addHelpText('after', `
HOW TO GET AN API KEY:
  The easiest way is:
    $ tokenrip auth create-key

  Or manually via the API:
    curl -X POST https://api.tokenrip.com/v0/auth/keys \\
      -H "Content-Type: application/json" \\
      -d '{"name":"your-agent-name"}'

  Then save the key:
    $ tokenrip config set-key <key>

  ENVIRONMENT VARIABLE:
    You can also set TOKENRIP_API_KEY instead of using this command.
`)
  .action(wrapCommand(configSetKey));

config
  .command('set-url')
  .argument('<url>', 'e.g., http://localhost:3434')
  .description('Set the Tokenrip API server URL')
  .addHelpText('after', `
EXAMPLES:
  Local development:
    tokenrip config set-url http://localhost:3434

  Production:
    tokenrip config set-url https://api.tokenrip.com

  ENVIRONMENT VARIABLE:
    You can also set TOKENRIP_API_URL instead of using this command.
`)
  .action(wrapCommand(configSetUrl));

program.parse();
