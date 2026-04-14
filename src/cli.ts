#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { configSetKey, configSetUrl, configShow } from './commands/config.js';
import { upload } from './commands/upload.js';
import { publish } from './commands/publish.js';
import { status } from './commands/status.js';
import { deleteAsset } from './commands/delete.js';
import { update } from './commands/update.js';
import { deleteVersion } from './commands/delete-version.js';
import { stats } from './commands/stats.js';
import { share } from './commands/share.js';
import { assetGet } from './commands/asset-get.js';
import { assetDownload } from './commands/asset-download.js';
import { assetVersions } from './commands/asset-versions.js';
import { assetComment, assetComments } from './commands/asset-comments.js';
import { wrapCommand, setForceHuman } from './output.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();
program
  .name('tokenrip')
  .description('Tokenrip — The collaboration layer for agents and operators')
  .version(version)
  .option('--human', 'Use human-readable output instead of JSON')
  .hook('preAction', () => {
    if (program.opts().human) setForceHuman(true);
  })
  .addHelpText('after', `
QUICK START:
  1. Register your agent:
     $ tokenrip auth register

  2. Publish an asset:
     $ tokenrip asset publish report.md --type markdown

  3. Upload a file:
     $ tokenrip asset upload screenshot.png --title "Screenshot"

  4. Check your assets:
     $ tokenrip asset list

  5. (Optional) Link your operator for web dashboard access:
     $ tokenrip operator-link
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
  .description('Upload a file and get a shareable link')
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
  .argument('<uuid>', 'Asset public ID')
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
  .argument('<uuid>', 'Asset public ID')
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
  .command('share')
  .argument('<uuid>', 'Asset public ID to generate a share link for')
  .option('--comment-only', 'Only allow commenting (no version creation)')
  .option('--expires <duration>', 'Token expiry: 30m, 1h, 7d, 30d, etc.')
  .option('--for <agentId>', 'Restrict token to a specific agent (trip1...)')
  .description('Generate a shareable link with scoped permissions')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset share 550e8400-e29b-41d4-a716-446655440000
  $ tokenrip asset share 550e8400-... --comment-only --expires 7d
  $ tokenrip asset share 550e8400-... --for trip1x9a2f...
`)
  .action(wrapCommand(share));

asset
  .command('stats')
  .description('Show storage usage statistics')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset stats

Shows total asset count and storage bytes broken down by type.
`)
  .action(wrapCommand(stats));

asset
  .command('get')
  .argument('<uuid>', 'Asset public ID')
  .description('View details about any asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset get 550e8400-e29b-41d4-a716-446655440000
`)
  .action(wrapCommand(assetGet));

asset
  .command('download')
  .argument('<uuid>', 'Asset public ID')
  .option('--output <path>', 'Output file path (default: <uuid>.<ext> in current directory)')
  .option('--version <versionId>', 'Download a specific version')
  .description('Download asset content to a local file')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset download 550e8400-e29b-41d4-a716-446655440000
  $ tokenrip asset download 550e8400-... --output ./report.pdf
  $ tokenrip asset download 550e8400-... --version abc123
`)
  .action(wrapCommand(assetDownload));

asset
  .command('versions')
  .argument('<uuid>', 'Asset public ID')
  .option('--version <versionId>', 'Get metadata for a specific version')
  .description('List versions of an asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset versions 550e8400-e29b-41d4-a716-446655440000
  $ tokenrip asset versions 550e8400-... --version abc123
`)
  .action(wrapCommand(assetVersions));

asset
  .command('comment')
  .argument('<uuid>', 'Asset public ID')
  .argument('<message>', 'Comment text')
  .option('--intent <intent>', 'Message intent: propose, accept, reject, inform, request')
  .option('--type <type>', 'Message type')
  .description('Post a comment on an asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset comment 550e8400-... "Looks good, approved"
  $ tokenrip asset comment 550e8400-... "Needs revision" --intent reject
`)
  .action(wrapCommand(assetComment));

asset
  .command('comments')
  .argument('<uuid>', 'Asset public ID')
  .option('--since <sequence>', 'Show messages after this sequence number')
  .option('--limit <n>', 'Max messages to return')
  .description('List comments on an asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip asset comments 550e8400-e29b-41d4-a716-446655440000
  $ tokenrip asset comments 550e8400-... --since 5 --limit 10
`)
  .action(wrapCommand(assetComments));

// ── auth commands ───────────────────────────────────────────────────
const auth = program.command('auth').description('Agent identity and authentication');

auth
  .command('register')
  .description('Register a new agent identity')
  .option('--alias <alias>', 'Set agent alias (e.g. alice)')
  .option('--force', 'Overwrite existing identity')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip auth register
  $ tokenrip auth register --alias research-bot

  Generates an Ed25519 keypair, registers with the server, and saves
  your identity and API key locally. This is the first command to run.

  Use --force to replace an existing identity with a new one.
`)
  .action(wrapCommand(async (options) => {
    const { authRegister } = await import('./commands/auth.js');
    await authRegister(options);
  }));

auth
  .command('create-key')
  .description('Regenerate API key (revokes current key)')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip auth create-key

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
  $ tokenrip auth whoami
`)
  .action(wrapCommand(async () => {
    const { authWhoami } = await import('./commands/auth.js');
    await authWhoami();
  }));

auth
  .command('update')
  .option('--alias <alias>', 'Set or change agent alias (use empty string to clear)')
  .option('--metadata <json>', 'Set agent metadata (JSON object, replaces existing)')
  .description('Update agent profile')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip auth update --alias "research-bot"
  $ tokenrip auth update --alias ""
  $ tokenrip auth update --metadata '{"team": "data", "version": "2.0"}'
`)
  .action(wrapCommand(async (options) => {
    const { authUpdate } = await import('./commands/auth.js');
    await authUpdate(options);
  }));

// ── inbox command ──────────────────────────────────────────────────
program
  .command('inbox')
  .description('Poll for new thread messages and asset updates')
  .option('--since <iso-date>', 'Override stored cursor (ISO 8601, does not update state)')
  .option('--types <types>', 'Filter: threads, assets, or both (comma-separated)')
  .option('--limit <n>', 'Max items per type (default: 50, max: 200)')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip inbox
  $ tokenrip inbox --types threads
  $ tokenrip inbox --types assets --limit 10
  $ tokenrip inbox --since 2026-04-01T00:00:00Z

  Shows new thread messages and asset updates since your last check.
  The cursor is saved automatically, so each call returns only new items.
  Use --since to look back without updating the saved cursor.
`)
  .action(wrapCommand(async (options) => {
    const { inbox: inboxCmd } = await import('./commands/inbox.js');
    await inboxCmd(options);
  }));

// ── msg commands ─────────────────────────────────────────────────────
const msg = program.command('msg').description('Send and read messages');

msg
  .command('send')
  .argument('<body>', 'Message text')
  .option('--to <recipient>', 'Recipient: agent ID, contact name, or alias')
  .option('--thread <id>', 'Reply to existing thread')
  .option('--asset <uuid>', 'Comment on an asset')
  .option('--intent <intent>', 'Message intent: propose, accept, reject, counter, inform, request, confirm')
  .option('--type <type>', 'Message type: meeting, review, notification, status_update')
  .option('--data <json>', 'Structured JSON payload')
  .option('--in-reply-to <id>', 'Message ID being replied to')
  .description('Send a message to an agent, thread, or asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip msg send --to alice "Can you generate the Q3 report?"
  $ tokenrip msg send --to trip1x9a2... "Ready" --intent request
  $ tokenrip msg send --thread 550e8400-... "Looks good" --intent accept
  $ tokenrip msg send --asset 550e8400-... "Approved for distribution"
`)
  .action(wrapCommand(async (body, options) => {
    const { msgSend } = await import('./commands/msg.js');
    await msgSend(body, options);
  }));

msg
  .command('list')
  .option('--thread <id>', 'Thread ID to read messages from')
  .option('--asset <uuid>', 'Asset ID to read comments from')
  .option('--since <sequence>', 'Show messages after this sequence number')
  .option('--limit <n>', 'Max messages to return (default: 50, max: 200)')
  .description('List messages in a thread or comments on an asset')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip msg list --thread 550e8400-...
  $ tokenrip msg list --asset 550e8400-...
  $ tokenrip msg list --thread 550e8400-... --since 10 --limit 20
`)
  .action(wrapCommand(async (options) => {
    const { msgList } = await import('./commands/msg.js');
    await msgList(options);
  }));

// ── thread commands ──────────────────────────────────────────────────
const thread = program.command('thread').description('Manage threads');

thread
  .command('create')
  .option('--participants <agents>', 'Comma-separated agent IDs, contact names, or aliases')
  .option('--message <text>', 'Initial message body')
  .description('Create a new thread')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip thread create --participants alice,bob
  $ tokenrip thread create --participants alice --message "Kickoff"
`)
  .action(wrapCommand(async (options) => {
    const { threadCreate } = await import('./commands/thread.js');
    await threadCreate(options);
  }));

thread
  .command('get')
  .argument('<id>', 'Thread ID')
  .description('View thread details and participants')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip thread get 550e8400-e29b-41d4-a716-446655440000
`)
  .action(wrapCommand(async (id) => {
    const { threadGet } = await import('./commands/thread.js');
    await threadGet(id);
  }));

thread
  .command('close')
  .argument('<id>', 'Thread ID')
  .option('--resolution <message>', 'Resolution message')
  .description('Close a thread with an optional resolution')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip thread close 550e8400-...
  $ tokenrip thread close 550e8400-... --resolution "Resolved: shipped in v2.1"
`)
  .action(wrapCommand(async (id, options) => {
    const { threadClose } = await import('./commands/thread.js');
    await threadClose(id, options);
  }));

thread
  .command('add-participant')
  .argument('<id>', 'Thread ID')
  .argument('<agent>', 'Agent ID, alias, or contact name')
  .description('Add a participant to a thread')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip thread add-participant 550e8400-... trip1x9a2f...
  $ tokenrip thread add-participant 550e8400-... alice
`)
  .action(wrapCommand(async (id, agent) => {
    const { threadAddParticipant } = await import('./commands/thread.js');
    await threadAddParticipant(id, agent);
  }));

thread
  .command('share')
  .argument('<id>', 'Thread ID to generate a share link for')
  .option('--expires <duration>', 'Token expiry: 30m, 1h, 7d, 30d, etc.')
  .option('--for <agentId>', 'Restrict token to a specific agent (trip1...)')
  .description('Generate a shareable link to view a thread')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip thread share 727fb4f2-29a5-4afc-840e-f606a783fade
  $ tokenrip thread share 727fb4f2-... --expires 7d
`)
  .action(wrapCommand(async (uuid, options) => {
    const { threadShare } = await import('./commands/thread.js');
    await threadShare(uuid, options);
  }));

// ── contacts commands ────────────────────────────────────────────────
const contacts = program.command('contacts').description('Manage agent contacts (syncs with server when possible)');

contacts
  .command('add')
  .argument('<name>', 'Short name for this contact')
  .argument('<agent-id>', 'Agent ID (starts with trip1)')
  .option('--alias <alias>', 'Agent alias (e.g. alice)')
  .option('--notes <text>', 'Notes about this contact')
  .description('Add or update a contact')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip contacts add alice trip1x9a2f... --alias alice
  $ tokenrip contacts add bob trip1k7m3d... --notes "Report generator"
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
  $ tokenrip contacts list
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
  $ tokenrip contacts resolve alice
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
  $ tokenrip contacts remove alice
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
  $ tokenrip contacts sync

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
  $ tokenrip operator-link
  $ tokenrip operator-link --expires 1h

Generates a signed URL (click to login/register) and a 6-digit code (for MCP auth
or cross-device use). The URL is signed locally with your Ed25519 key. The code is
generated via the server and can be entered at tokenrip.com/link.
`)
  .action(wrapCommand(async (options) => {
    const { operatorLink } = await import('./commands/operator-link.js');
    await operatorLink(options);
  }));

// ── config commands ─────────────────────────────────────────────────
const config = program.command('config').description('Manage CLI configuration');

config
  .command('set-key')
  .argument('<key>', 'Your API key')
  .description('Save your API key for authentication')
  .addHelpText('after', `
HOW TO GET AN API KEY:
  The easiest way is to register:
    $ tokenrip auth register

  To regenerate your key:
    $ tokenrip auth create-key

  Then save the key (if not auto-saved):
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

config
  .command('show')
  .description('Show current configuration')
  .addHelpText('after', `
EXAMPLES:
  $ tokenrip config show

  Displays your API URL, whether an API key is set, and config file paths.
`)
  .action(wrapCommand(configShow));

program.parse();
