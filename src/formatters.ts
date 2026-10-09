import { loadTeams } from './teams.js';

export type Formatter = (data: Record<string, unknown>) => string;

// Null-safe wrapper over the (hoisted) numeric formatBytes below.
function fmtSize(n: unknown): string {
  const bytes = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(bytes) ? formatBytes(bytes) : '?';
}

export const formatBundleCreated: Formatter = (data) => {
  const verb = data.dryRun ? 'Would deploy' : data.version && Number(data.version) > 1 ? 'Re-deployed' : 'Deployed';
  const lines = [`${verb}: ${data.title || '(untitled)'}`];
  if (data.id) lines.push(`  ID:        ${data.id}`);
  if (data.slug) lines.push(`  Slug:      ${data.slug}`);
  // Live + page URLs printed in full on their own lines — agents pipe these.
  if (data.liveUrl) lines.push(`  Live site: ${data.liveUrl}`);
  if (data.pageUrl) lines.push(`  Page:      ${data.pageUrl}`);
  if (data.entrypoint) lines.push(`  Entry:     ${data.entrypoint}`);
  if (data.fileCount !== undefined) lines.push(`  Files:     ${data.fileCount}`);
  if (data.sizeBytes !== undefined) lines.push(`  Size:      ${fmtSize(data.sizeBytes)}`);
  if (data.versionCount !== undefined) lines.push(`  Versions:  ${data.versionCount}`);
  if (data.currentVersionId) lines.push(`  Version:   ${data.currentVersionId}`);
  return lines.join('\n');
};

export const formatBundleList: Formatter = (data) => {
  const bundles = data as unknown as Record<string, unknown>[];
  if (!Array.isArray(bundles) || bundles.length === 0) return 'No bundles found.';
  const lines = [`${bundles.length} bundle(s):\n`];
  for (const b of bundles) {
    lines.push(`${b.title || '(untitled)'}  [${b.visibility}]`);
    lines.push(`  ID:        ${b.id}`);
    if (b.slug) lines.push(`  Slug:      ${b.slug}`);
    lines.push(`  Live site: ${b.liveUrl}`);
    lines.push(`  Files:     ${b.fileCount ?? '?'}   Versions: ${b.versionCount ?? '?'}`);
    if (b.updatedAt) lines.push(`  Updated:   ${b.updatedAt}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
};

export const formatBundleDetail: Formatter = (data) => {
  const lines = [`Bundle: ${data.title || '(untitled)'}  [${data.visibility}]`];
  lines.push(`  ID:        ${data.id}`);
  if (data.slug) lines.push(`  Slug:      ${data.slug}`);
  lines.push(`  Live site: ${data.liveUrl}`);
  lines.push(`  Page:      ${data.pageUrl}`);
  lines.push(`  API:       ${data.apiUrl}`);
  lines.push(`  Kind:      ${data.kind}   Entry: ${data.entrypoint}${data.spaFallback ? '   (SPA fallback)' : ''}`);
  lines.push(`  Versions:  ${data.versionCount}   Files: ${data.fileCount ?? '?'}   Size: ${fmtSize(data.sizeBytes)}`);
  const manifest = data.manifest as { files?: { path: string; sizeBytes: number }[] } | null;
  if (manifest && Array.isArray(manifest.files) && manifest.files.length > 0) {
    lines.push('  Files:');
    for (const f of manifest.files) lines.push(`    ${f.path}  (${fmtSize(f.sizeBytes)})`);
  }
  return lines.join('\n');
};

export const formatBundleVersions: Formatter = (data) => {
  const versions = data as unknown as Record<string, unknown>[];
  if (!Array.isArray(versions) || versions.length === 0) return 'No versions found.';
  const lines = [`${versions.length} version(s):\n`];
  for (const v of versions) {
    lines.push(`v${v.version}${v.isCurrent ? '  (current)' : ''}`);
    if (v.description) lines.push(`  ${v.description}`);
    lines.push(`  Entry: ${v.entrypoint}   Files: ${v.fileCount ?? '?'}   Size: ${fmtSize(v.sizeBytes)}   ${v.createdAt}`);
  }
  return lines.join('\n');
};

export const formatArtifactCreated: Formatter = (data) => {
  const lines = [`Created: ${data.title || '(untitled)'}`];
  // `id` and `publicId` carry the same value; the rest of the platform
  // (agent responses) keys on `publicId`. We echo the alias too so
  // a caller that just set one can confirm it. See packages/cli/CLAUDE.md.
  if (data.id) lines.push(`  ID:      ${data.id}`);
  if (data.alias) lines.push(`  Alias:   ${data.alias}`);
  if (data.url) lines.push(`  URL:     ${data.url}`);
  if (data.publicUrl) lines.push(`  Public:  ${data.publicUrl}`);
  if (data.type) lines.push(`  Type:    ${data.type}`);
  if (data.mimeType) lines.push(`  MIME:    ${data.mimeType}`);
  if (data.currentVersionId) lines.push(`  Version: ${data.currentVersionId}`);
  if (data.workspaceId) {
    lines.push(`  Workspace: ${data.workspaceId}`);
    if (data.audience) lines.push(`  Audience: ${data.audience}`);
    if (data.workspaceRevision) lines.push(`  Revision: ${data.workspaceRevision}`);
  }
  return lines.join('\n');
};

export const formatArtifactPatched: Formatter = (data) => {
  const lines = [`Patched: ${data.id}`];
  if (data.title) lines.push(`  Title:    ${data.title}`);
  if (data.description) lines.push(`  Desc:     ${data.description}`);
  if (data.alias) lines.push(`  Alias:    ${data.alias}`);
  if (data.url) lines.push(`  URL:      ${data.url}`);
  if (data.metadata) lines.push(`  Metadata: ${JSON.stringify(data.metadata)}`);
  if (data.updatedAt) lines.push(`  Updated:  ${data.updatedAt}`);
  return lines.join('\n');
};

export const formatArtifactList: Formatter = (data) => {
  const artifacts = data as unknown as Record<string, unknown>[];
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return 'No artifacts found.';
  }
  const lines = [`${artifacts.length} artifact(s):\n`];
  for (const a of artifacts) {
    const title = a.title || '(untitled)';
    const type = a.type || '';
    const id = a.id || '';
    const aliasLabel = a.alias ? `  alias: ${a.alias}` : '';
    lines.push(`  ${type.toString().padEnd(10)} ${title}  (${id})${aliasLabel}`);
    if (a.url) lines.push(`             ${a.url}`);
  }
  return lines.join('\n');
};

export const formatStats: Formatter = (data) => {
  const lines: string[] = [];
  if (data.artifactCount !== undefined) lines.push(`Total artifacts: ${data.artifactCount}`);
  if (data.totalBytes !== undefined) lines.push(`Total size:   ${formatBytes(data.totalBytes as number)}`);

  const countsByType = data.countsByType as Record<string, number> | undefined;
  const bytesByType = data.bytesByType as Record<string, number> | undefined;
  const byType = countsByType
    ? Object.keys(countsByType)
        .sort()
        .map((type) => ({
          type,
          count: countsByType[type],
          totalBytes: bytesByType?.[type] ?? 0,
        }))
    : undefined;

  if (Array.isArray(byType) && byType.length > 0) {
    lines.push('');
    lines.push('By type:');
    for (const t of byType) {
      const name = (t.type || 'unknown') as string;
      const count = t.count ?? 0;
      const bytes = t.totalBytes ?? 0;
      lines.push(`  ${name.padEnd(10)} ${String(count).padStart(4)} artifacts  ${formatBytes(bytes as number)}`);
    }
  }
  return lines.join('\n');
};

export const formatVersionCreated: Formatter = (data) => {
  const lines = [`Version ${data.version || '?'} published`];
  if (data.url) lines.push(`  URL:         ${data.url}`);
  if (data.id) lines.push(`  Version ID:  ${data.id}`);
  if (data.artifactId) lines.push(`  Artifact ID: ${data.artifactId}`);
  if (data.description) lines.push(`  Description: ${data.description}`);
  return lines.join('\n');
};

export const formatVersionDeleted: Formatter = (data) => {
  return `Deleted version ${data.versionId} from artifact ${data.artifactId}`;
};

export const formatConfigSaved: Formatter = (data) => {
  return data.message as string || 'Configuration saved.';
};

export const formatAuthKey: Formatter = (data) => {
  const lines = [data.message as string || 'API key created.'];
  if (data.keyName) lines.push(`  Name: ${data.keyName}`);
  if (data.apiKey) lines.push(`  Key:  ${data.apiKey}`);
  if (data.note) lines.push(`  ${data.note}`);
  return lines.join('\n');
};

/**
 * `rip activity` — the server already rendered each row's sentence, so this only
 * groups them under day headers. Grouping is what makes a long feed scannable;
 * re-deriving the sentence client-side would mean two vocabularies to keep in
 * step, so `text` is printed verbatim.
 */
export const formatActivity: Formatter = (data) => {
  const events = ((data as any).events ?? []) as Array<{
    createdAt: string;
    text: string;
    subject?: { type?: string; id?: string };
  }>;
  if (events.length === 0) return 'No activity.';

  const lines: string[] = [];
  let day: string | null = null;
  for (const e of events) {
    // Rows arrive newest-first, so a change of day is always a new header.
    const d = e.createdAt.slice(0, 10);
    if (d !== day) {
      if (day !== null) lines.push('');
      lines.push(d);
      day = d;
    }
    // The sentence names the thing; the ref is what you paste into the next command
    // (e.g. `--subject connection:<id>`). Whole, never a prefix — see
    // CLAUDE.md §Output correctness.
    const ref = e.subject?.type && e.subject?.id ? `  ${e.subject.type}:${e.subject.id}` : '';
    lines.push(`  ${e.text}${ref}`);
  }

  const next = (data as any).nextCursor;
  if (next) {
    lines.push('');
    lines.push(`More: rerun with --cursor ${next}`);
  }
  return lines.join('\n');
};

export const formatConfigShow: Formatter = (data) => {
  const lines = ['Configuration:'];
  if (data.apiUrl) lines.push(`  API URL:       ${data.apiUrl}`);
  if (data.frontendUrl) lines.push(`  Frontend:      ${data.frontendUrl}`);
  if (data.apiKey) lines.push(`  API Key:       ${data.apiKey}`);
  if (data.outputFormat) lines.push(`  Output format: ${data.outputFormat}`);
  if (data.configFile) lines.push(`  Config file:   ${data.configFile}`);
  return lines.join('\n');
};

export const formatArtifactDownloaded: Formatter = (data) => {
  const lines = [`Downloaded: ${data.file}`];
  if (data.sizeBytes) lines.push(`  Size: ${formatBytes(data.sizeBytes as number)}`);
  if (data.mimeType) lines.push(`  MIME: ${data.mimeType}`);
  return lines.join('\n');
};

export const formatArtifactMetadata: Formatter = (data) => {
  const lines = [data.title || '(untitled)'];
  if (data.id) lines.push(`  ID:          ${data.id}`);
  if (data.url) lines.push(`  URL:         ${data.url}`);
  if (data.type) lines.push(`  Type:        ${data.type}`);
  if (data.mimeType) lines.push(`  MIME:        ${data.mimeType}`);
  if (data.description) lines.push(`  Description: ${data.description}`);
  if (data.versionCount !== undefined) lines.push(`  Versions:    ${data.versionCount}`);
  if (data.creatorContext) lines.push(`  Context:     ${data.creatorContext}`);
  if (data.isPublic !== undefined) lines.push(`  Public:      ${data.isPublic ? 'yes' : 'no'}`);

  const folder = data.folder as { slug: string; teamSlug?: string } | null | undefined;
  if (folder) {
    const folderLabel = folder.teamSlug ? `${folder.slug} (team: ${folder.teamSlug})` : folder.slug;
    lines.push(`  Folder:      ${folderLabel}`);
  }

  const teams = data.teams as string[] | undefined;
  if (Array.isArray(teams) && teams.length > 0) {
    lines.push(`  Teams:       ${teams.join(', ')}`);
    lines.push(`  Modifiable:  all team members`);
  } else {
    lines.push(`  Modifiable:  owner only`);
  }

  if (data.createdAt) lines.push(`  Created:     ${data.createdAt}`);
  return lines.join('\n');
};

export const formatVersionList: Formatter = (data) => {
  const versions = data as unknown as Record<string, unknown>[];
  if (!Array.isArray(versions) || versions.length === 0) {
    return 'No versions found.';
  }
  const lines = [`${versions.length} version(s):\n`];
  for (const v of versions) {
    const label = v.description ? ` "${v.description}"` : '';
    const size = v.sizeBytes ? ` ${formatBytes(v.sizeBytes as number)}` : '';
    const creator = v.createdByAlias ? ` @${v.createdByAlias}` : '';
    const tag = v.createdByTag ? ` [${v.createdByTag}]` : '';
    lines.push(`  v${v.version}  ${v.id}${creator}${tag}${label}${size}  ${v.createdAt}`);
  }
  return lines.join('\n');
};

export const formatVersionMetadata: Formatter = (data) => {
  const lines = [`Version ${data.version}`];
  if (data.id) lines.push(`  ID:       ${data.id}`);
  if (data.description) lines.push(`  Description: ${data.description}`);
  if (data.mimeType) lines.push(`  MIME:     ${data.mimeType}`);
  if (data.sizeBytes) lines.push(`  Size:     ${formatBytes(data.sizeBytes as number)}`);
  if (data.createdAt) lines.push(`  Created:  ${data.createdAt}`);
  return lines.join('\n');
};

export const formatWhoami: Formatter = (data) => {
  const lines = [String(data.agent_id)];
  if (data.alias) lines.push(`  Alias:       ${data.alias}`);
  if (data.tag) lines.push(`  Tag:         ${data.tag}`);
  if (data.description) lines.push(`  Description: ${data.description}`);
  if (data.website) lines.push(`  Website:     ${data.website}`);
  if (data.email) lines.push(`  Email:       ${data.email}`);
  if (data.is_public !== undefined) lines.push(`  Public:      ${data.is_public}`);
  if (data.registered_at) lines.push(`  Registered:  ${data.registered_at}`);
  return lines.join('\n');
};

export const formatProfileUpdated: Formatter = (data) => {
  const lines = ['Profile updated'];
  if (data.agent_id) lines.push(`  Agent:       ${data.agent_id}`);
  if (data.alias !== undefined) lines.push(`  Alias:       ${data.alias ?? '(none)'}`);
  if (data.tag !== undefined) lines.push(`  Tag:         ${data.tag ?? '(none)'}`);
  if (data.description !== undefined) lines.push(`  Description: ${data.description ?? '(none)'}`);
  if (data.website !== undefined) lines.push(`  Website:     ${data.website ?? '(none)'}`);
  if (data.email !== undefined) lines.push(`  Email:       ${data.email ?? '(none)'}`);
  if (data.is_public !== undefined) lines.push(`  Public:      ${data.is_public}`);
  if (data.metadata) lines.push(`  Metadata:    ${JSON.stringify(data.metadata)}`);
  return lines.join('\n');
};

/** `rip auth login` step 1 — the code is on its way; what to run with it. */
export const formatSignInRequested: Formatter = (data) =>
  [
    `Sent a six-digit code to ${data.email}. It lasts 10 minutes; if it is not in the inbox, check the spam folder.`,
    `Next: ${data.next}`,
  ].join('\n');

/** `rip auth login` step 2 — signed in on the person's account. */
export const formatSignedIn: Formatter = (data) => {
  const lines = [`Connected to ${data.email}'s Tokenrip. Next: rip workspace list`];
  lines.push(`  Account: ${data.account_id}`);
  if (data.name) lines.push(`  Key:     ${data.name}`);
  if (data.previous_key === 'not_revoked') lines.push(`  The key this one replaced could not be revoked; remove it with \`rip auth keys revoke ${data.previous_key_id ?? '<id>'}\`.`);
  if (data.overridden_by === 'TOKENRIP_API_KEY') lines.push('  Warning: TOKENRIP_API_KEY is set, so commands will keep using that key; unset it to use this sign-in.');
  if (data.overridden_by === 'TOKENRIP_AGENT') lines.push('  Warning: TOKENRIP_AGENT is set, so commands will keep using that agent; unset it to use this sign-in.');
  return lines.join('\n');
};

/** `rip auth code` — the line for the person to give their next agent. */
export const formatSignInCode: Formatter = (data) =>
  [
    'Give this line to your next agent:',
    '',
    `  ${data.paste}`,
    '',
    `Valid until ${data.expires_at}, once.`,
  ].join('\n');

/** `rip auth keys` — every key on the account; ids in full for `rip auth keys revoke <id>`. */
export const formatKeyList: Formatter = (data) => {
  const keys = ((data as any).keys ?? []) as Array<{
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    current: boolean;
    connector: { client_id: string; label: string } | null;
  }>;
  if (keys.length === 0) return 'No keys.';
  const lines: string[] = [];
  for (const k of keys) {
    lines.push(`${k.name}${k.current ? '  (this agent)' : ''}${k.connector ? `  connector: ${k.connector.label}` : ''}`);
    lines.push(`  id:        ${k.id}`);
    lines.push(`  connected: ${k.created_at}`);
    lines.push(`  last used: ${k.last_used_at ?? 'never'}`);
  }
  return lines.join('\n');
};

/** `rip auth keys create` — the key, shown once. */
export const formatKeyCreated: Formatter = (data) =>
  [
    `Created key "${data.name}" (id ${data.id}). It is shown only once:`,
    '',
    `  ${data.api_key}`,
    '',
    "Paste this into your host's key vault or settings, not into a chat.",
  ].join('\n');

/** `rip auth keys revoke` */
export const formatKeyRevoked: Formatter = (data) => {
  const lines = [`Revoked key ${data.id}. The agent using it is disconnected.`];
  if (data.own_key) {
    lines.push(process.env.TOKENRIP_API_KEY
      ? 'That was the key in TOKENRIP_API_KEY; it no longer works. Replace or unset it.'
      : "That was this CLI's key; it no longer works. Sign in again: rip auth login --email <your email>");
  }
  return lines.join('\n');
};

export const formatTableRows: Formatter = (data) => {
  const rows = (data as any).rows ?? [];
  const nextCursor = (data as any).nextCursor;
  if (!Array.isArray(rows) || rows.length === 0) return 'No rows.';
  const lines = [`${rows.length} row(s):\n`];
  for (const r of rows) {
    const dataStr = JSON.stringify(r.data);
    const ago = formatTimeAgo(new Date(r.createdAt));
    lines.push(`  ${r.id}  ${ago}  ${dataStr}`);
  }
  if (nextCursor) lines.push(`\n  More rows available. Use --after ${nextCursor}`);
  return lines.join('\n');
};

export const formatRowsAppended: Formatter = (data) => {
  const count = (data as any).count ?? 0;
  const rows = (data as any).rows ?? [];
  const lines = [`Appended ${count} row(s)`];
  for (const r of rows) {
    if (r.id) lines.push(`  ${r.id}`);
  }
  return lines.join('\n');
};

export const formatRowUpdated: Formatter = (data) => {
  return `Updated row ${data.id}`;
};

export const formatRowsDeleted: Formatter = (data) => {
  return `Deleted ${data.deleted} row(s)`;
};

export const formatSearchResults: Formatter = (data) => {
  const results = (data as any).results ?? [];
  const total = (data as any).total ?? results.length;
  if (results.length === 0) return 'No results.';

  const lines: string[] = [`${total} result(s):\n`];
  const mode = (data as any).mode;
  if (mode && mode !== 'keyword') lines.push(`  mode: ${mode}\n`);
  for (const r of results) {
    const title = r.title || '(untitled)';
    const ago = formatTimeAgo(new Date(r.updated_at));
    const artifactType = (r.artifact?.artifact_type ?? '').padEnd(10);
    const versions = r.artifact?.version_count ? `v${r.artifact.version_count}` : '';
    lines.push(`  artifact   ${artifactType}  ${r.id}  ${title}  ${versions}  ${ago}`);
    if (r.url) lines.push(`          ${r.url}`);
    if (r.match_section) lines.push(`          § ${r.match_section}`);
    if (r.snippet) lines.push(`          ${formatSnippet(r.snippet)}`);
  }
  if (results.length < total) {
    lines.push(`\n  Showing ${results.length} of ${total}. Use --offset ${results.length} for more.`);
  }
  return lines.join('\n');
};

export const formatTeamCreated: Formatter = (data) => {
  const lines = [`Team created: @${data.slug}`];
  if (data.name && data.name !== data.slug) lines.push(`  Name: ${data.name}`);
  if (data.id) lines.push(`  ID:   ${data.id}`);
  return lines.join('\n');
};

export const formatTeamList: Formatter = (data) => {
  const teams = data as unknown as Array<{ slug: string; name: string; member_count: number; id: string }>;
  if (!Array.isArray(teams) || teams.length === 0) return 'No teams found.';
  const localTeams = loadTeams();
  const lines = [`${teams.length} team(s):\n`];
  for (const t of teams) {
    const alias = localTeams[t.slug]?.alias;
    const aliasSuffix = alias ? `  (alias: ${alias})` : '';
    lines.push(`  @${t.slug.padEnd(24)} ${String(t.member_count).padStart(3)} member(s)  ${t.id}${aliasSuffix}`);
  }
  return lines.join('\n');
};

export const formatTeamDetails: Formatter = (data) => {
  const lines = [`@${data.slug}  —  ${data.name}`];
  if (data.description) lines.push(`  ${data.description}`);
  lines.push(`  ID:    ${data.id}`);
  lines.push(`  Owner: ${data.owner_id}`);
  const members = data.members as Array<{ agent_id: string; alias?: string | null; joined_at: string }> | undefined;
  if (Array.isArray(members) && members.length > 0) {
    lines.push(`  Members (${members.length}):`);
    for (const m of members) {
      const label = m.alias ? `${m.alias} (${m.agent_id})` : m.agent_id;
      lines.push(`    ${label}`);
    }
  }
  return lines.join('\n');
};

export const formatTeamInvite: Formatter = (data) => {
  const lines = ['Invite token generated (pass it on; the recipient runs rip team accept-invite <token>)'];
  if (data.token) lines.push(`  Token:   ${data.token}`);
  if (data.expires_in) lines.push(`  Expires: ${data.expires_in}`);
  return lines.join('\n');
};

export const formatTeamMemberAdded: Formatter = (data) => {
  if (!data.invited) return 'Agent added to the team.';
  const lines = ['Invite created (the agent belongs to another operator, so it was not added directly).'];
  if (data.inviteToken) {
    lines.push(`  Token:   ${data.inviteToken}`);
    lines.push('  Expires: 7 days');
    lines.push('');
    lines.push('Send the token to the agent. It joins with:');
    lines.push(`  rip team accept-invite ${data.inviteToken}`);
  }
  return lines.join('\n');
};

export const formatSelfUpdate: Formatter = (data) => {
  if (data.status === 'failed') {
    return data.message as string;
  }

  if (data.status === 'current') {
    const lines = [`@tokenrip/cli ${data.version} is already current`];
    if (data.skill_file_path) lines.push(`Skill file: ${data.skill_file_path}`);
    return lines.join('\n');
  }

  // updated
  const lines = [`Updated @tokenrip/cli ${data.from} → ${data.to}`];

  if (data.skill_file_path) {
    const label = data.skill_changed ? 'Skill file refreshed' : 'Skill file current';
    lines.push(`${label} → ${data.skill_file_path}`);
    lines.push('');
    lines.push(`Reload in Claude Code:  npx skills add tokenrip/cli`);
    lines.push(`Load manually:          ${data.skill_file_path}`);
  } else {
    lines.push('');
    lines.push('Reload your agent skill:');
    lines.push('  Claude Code:  npx skills add tokenrip/cli');
    if (data.skill_url) lines.push(`  Load from:    ${data.skill_url}`);
  }

  if (data.message) {
    lines.push('');
    lines.push(data.message as string);
  }

  return lines.join('\n');
};

export const formatAccountList: Formatter = (data) => {
  const accounts = (data as any).accounts as Array<{
    accountId: string;
    alias?: string;
    current: boolean;
  }>;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return 'No accounts configured. Sign in with your email: `rip auth login --email <your email>`.';
  }
  return accounts
    .map(
      (a) =>
        `${a.current ? '*' : ' '} ${(a.alias || '—').padEnd(20)} ${a.accountId}${a.current ? '  (current)' : ''}`,
    )
    .join('\n');
};

function formatSnippet(snippet: string): string {
  return snippet.replace(/\*\*([^*]+)\*\*/g, '$1');
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const ANSI = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' };

export const formatVersionDiff: Formatter = (data) => {
  const payload = data.payload as
    | { strategy: 'text'; segments: { op: string; value: string }[]; stats: { added: number; removed: number } }
    | { strategy: 'rows'; rows: { op: string; value: string }[]; stats: { added: number; removed: number } }
    | null;

  if (!payload) {
    return 'No diff — earliest version or non-diffable artifact type.';
  }

  const header = `Changes vs v${data.baseVersion}  ` +
    `${ANSI.green}+${payload.stats.added}${ANSI.reset} ${ANSI.red}-${payload.stats.removed}${ANSI.reset}\n`;

  if (payload.strategy === 'text') {
    let body = '';
    for (const s of payload.segments) {
      if (s.op === 'insert') body += `${ANSI.green}${s.value}${ANSI.reset}`;
      else if (s.op === 'delete') body += `${ANSI.red}${s.value}${ANSI.reset}`;
      else body += `${ANSI.dim}${s.value}${ANSI.reset}`;
    }
    return header + '\n' + body;
  }

  const lines = payload.rows.map((r) => {
    if (r.op === 'insert') return `${ANSI.green}+ ${r.value}${ANSI.reset}`;
    if (r.op === 'delete') return `${ANSI.red}- ${r.value}${ANSI.reset}`;
    return `  ${ANSI.dim}${r.value}${ANSI.reset}`;
  });
  return header + '\n' + lines.join('\n');
};

/** `rip connection get/create/rotate/disable` — one connection (secret never shown). */
export const formatConnection: Formatter = (data) => {
  const c = data as Record<string, any>;
  const scope = c.ownerType === 'team' ? `team (${c.teamId})` : 'personal';
  const lines = [
    `${c.name}  [${c.id}]`,
    `  scope:    ${scope}`,
    `  base_url: ${c.baseUrl}`,
    `  auth:     ${c.authType}${c.authHeaderName ? ` (${c.authHeaderName})` : ''}`,
  ];
  if (Array.isArray(c.allowedPaths) && c.allowedPaths.length) lines.push(`  allowed:  ${c.allowedPaths.join(', ')}`);
  if (c.defaultHeaders && Object.keys(c.defaultHeaders).length) {
    lines.push(`  headers:  ${Object.keys(c.defaultHeaders).join(', ')}`);
  }
  lines.push(`  limits:   ${c.rateLimitPerMin}/min, ${c.dailyQuota}/day`);
  if (c.disabledAt) lines.push(`  disabled: ${c.disabledAt}`);
  return lines.join('\n');
};

/** `rip connection list` — one row per connection. */
export const formatConnectionList: Formatter = (data) => {
  const rows = data as unknown as Array<Record<string, any>>;
  if (!Array.isArray(rows) || rows.length === 0) return 'No connections.';
  return rows
    .map((c) => {
      const scope = c.ownerType === 'team' ? 'team' : 'personal';
      const dis = c.disabledAt ? '  (disabled)' : '';
      return `${String(c.name).padEnd(20)} ${scope.padEnd(8)} ${c.baseUrl}  [${c.id}]${dis}`;
    })
    .join('\n');
};

/** `rip task list` — one row per task. */
export const formatTaskList: Formatter = (data) => {
  const tasks = ((data as any).tasks ?? []) as Array<Record<string, any>>;
  const nextCursor = (data as any).nextCursor as string | null;
  if (tasks.length === 0) return 'No tasks.';
  const lines = tasks.map((t) => {
    const who = t.claimedById ? `→ ${t.claimedById}` : t.suggestedAssigneeId ? `? ${t.suggestedAssigneeId}` : '';
    const kind = t.kind ?? '-';
    return `${String(t.status).padEnd(9)} ${String(kind).padEnd(16)} ${String(t.title).slice(0, 60).padEnd(60)} ${who.padEnd(70)} [${t.id}]`;
  });
  // The cursor only encodes (createdAt, id), so it has to be replayed against the
  // same filters — printing a bare command would silently paginate a different query.
  if (nextCursor) lines.push(`\nMore: re-run with the same filters plus --cursor ${nextCursor}`);
  return lines.join('\n');
};

/** `rip task show` — one task with results. */
export const formatTask: Formatter = (data) => {
  const t = data as Record<string, any>;
  const lines = [
    `${t.title}`,
    `ID:         ${t.id}`,
    `Workspace:  ${t.workspaceId} (${t.audience})`,
    `Revision:   ${t.revision ?? '-'}`,
    `Status:     ${t.status}`,
    `Kind:       ${t.kind ?? '-'}`,
  ];
  if (t.suggestedAssigneeId) lines.push(`Suggested:  ${t.suggestedAssigneeId}`);
  if (t.claimedById) lines.push(`Claimed by: ${t.claimedById}${t.claimedVia ? ` (${t.claimedVia})` : ''}  lease until ${t.leaseExpiresAt}`);
  if (t.completedById) lines.push(`Completed:  ${t.completedById} at ${t.completedAt}`);
  if (t.dismissedById) lines.push(`Dismissed:  ${t.dismissedById}${t.dismissReason ? ` — ${t.dismissReason}` : ''}`);
  if (t.dueAt) lines.push(`Due:        ${t.dueAt}`);
  lines.push(`Created:    ${t.createdAt} by ${t.createdById}`);
  if (t.body) lines.push('', t.body);
  if (t.payload && Object.keys(t.payload).length) lines.push('', 'Payload:', JSON.stringify(t.payload, null, 2));
  const results = (t.results ?? []) as Array<Record<string, any>>;
  if (results.length) {
    lines.push('', 'Results:');
    for (const r of results) {
      lines.push(`  ${r.type} ${r.targetId}${r.version != null ? ` v${r.version}` : ''}${r.orphaned ? '  (orphaned)' : ''}`);
    }
  }
  return lines.join('\n');
};

/** The `true` capability names, so an agent sees what it may do without `--json`. */
function capabilityList(capabilities: unknown): string | null {
  if (!capabilities || typeof capabilities !== 'object') return null;
  const allowed = Object.entries(capabilities as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);
  return allowed.length ? allowed.join(', ') : 'none';
}

/** A delete reply: the item is in the trash, restorable until `purgeAt`, and the command that restores it. */
export const formatTrashed: Formatter = (data) => {
  const reply = data as Record<string, any>;
  return `Moved to trash. Restorable until ${reply.purgeAt}.\nRestore with: rip trash restore ${reply.type} ${reply.id}`;
};

/** `rip trash list`: one line per entry, newest first, with every id needed to restore it. */
export const formatTrashList: Formatter = (data) => {
  const d = data as { items?: Array<Record<string, any>>; nextOffset?: number | null };
  const items = d.items ?? [];
  if (items.length === 0) return 'The trash is empty.';
  const lines = [`Trash (${items.length} item${items.length === 1 ? '' : 's'}, newest first):`];
  for (const item of items) {
    const by = item.deletedBy ? (item.deletedBy.alias ?? item.deletedBy.id) : 'unknown';
    lines.push(`  ${item.type}  ${item.id}  ${item.title ?? '(untitled)'}`);
    lines.push(`    deleted ${item.deletedAt} by ${by}; purges ${item.purgeAt}`);
    if (item.workspaceId) lines.push(`    workspace ${item.workspaceId}, revision ${item.workspaceRevision}`);
  }
  if (d.nextOffset !== null && d.nextOffset !== undefined) lines.push('', `More: rip trash list --offset ${d.nextOffset}`);
  lines.push('', 'Restore with: rip trash restore <type> <id>');
  return lines.join('\n');
};

/** `rip trash restore`: the item is back; a file whose folder is still in the trash comes back unfiled. */
export const formatRestored: Formatter = (data) => {
  const reply = data as Record<string, any>;
  const line = `Restored ${reply.type} ${reply.id}.`;
  return reply.unfiled ? `${line} Its folder is still in the trash, so it is back unfiled.` : line;
};

/** `rip artifact bulk`: the counts, every item a delete moved to the trash with its purge date, then the failures. */
export const formatBulkResult: Formatter = (data) => {
  const d = data as Record<string, any>;
  const lines = [`Bulk ${d.action}: ${d.succeeded} succeeded, ${d.failed_count} failed`];
  const deleted = (d.deleted ?? []) as Array<{ id: string; purgeAt: string }>;
  if (deleted.length > 0) {
    lines.push('', 'Moved to trash:');
    for (const item of deleted) lines.push(`  ${item.id}  restorable until ${item.purgeAt}`);
  }
  const failed = (d.failed ?? []) as Array<{ publicId: string; error: string }>;
  if (failed.length > 0) {
    lines.push('', 'Failed:');
    for (const f of failed) lines.push(`  ${f.publicId}: ${f.error}`);
  }
  return lines.join('\n');
};

/** Workspace output keeps every durable handle copyable in human mode. */
export const formatWorkspace: Formatter = (data) => {
  const w = data as Record<string, any>;
  const can = capabilityList(w.capabilities);
  return [
    `${w.name} [${w.id}]`,
    `Slug:       ${w.slug}`,
    `Owner:      ${w.ownerAccountId ?? (w.teamId ? `team ${w.teamId}` : '-')}`,
    `Access:     ${w.membership}/${w.role}`,
    ...(can ? [`Can:        ${can}`] : []),
    `Audiences:  ${Array.isArray(w.audiences) ? w.audiences.join(', ') : '-'}`,
    `Sequence:   ${w.mutationSequence ?? '-'}`,
    `Generation: ${w.accessGeneration ?? '-'}`,
    ...(w.description ? ['', String(w.description)] : []),
  ].join('\n');
};

export const formatWorkspaceList: Formatter = (data) => {
  const rows = data as unknown as Array<Record<string, any>>;
  if (!rows.length) return 'No workspaces.';
  return rows.map(w => `${w.name}  ${w.membership}/${w.role}  [${w.id}]  slug=${w.slug}  home=${w.ownerAccountId ?? (w.teamId ? `team ${w.teamId}` : '-')}  can=${capabilityList(w.capabilities) || '-'}`).join('\n');
};

/**
 * A pinned or handoff document: inline markdown is printed whole; a large one
 * arrives as a content reference, so print the exact command that reads it.
 */
function loadDocumentLines(doc: Record<string, any>): string[] {
  const content = (doc.content ?? {}) as Record<string, any>;
  const head = `  ${doc.title ?? '(untitled)'}  [${doc.publicId}]`;
  if (typeof content.content === 'string') {
    return [head, ...content.content.split('\n').map((line: string) => `    ${line}`)];
  }
  const versionId = content.versionId ?? doc.currentVersionId;
  const size = content.totalBytes != null ? `${content.totalBytes} bytes, ` : '';
  const read = versionId
    ? `rip artifact cat ${doc.publicId} --version-id ${versionId}`
    : `rip artifact cat ${doc.publicId}`;
  return [head, `    (${size}not inline) read it with: ${read}`];
}

/** One `rip workspace load` section: a blank line, the heading, then its rows or `(none)`. */
function loadSection(heading: string, rows: string[]): string[] {
  return ['', heading, ...(rows.length ? rows : ['  (none)'])];
}

function workspaceShellArgument(value: unknown): string {
  const text = String(value);
  return /^[A-Za-z0-9_./:-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\"'\"'")}'`;
}

/** Who worked and from which harness: the agent's key name only reaches its own account. */
function sessionWho(session: Record<string, any>): string {
  const who = session.account?.alias ? `~${session.account.alias}` : (session.account?.id ?? '-');
  const tool = [session.agent?.name, session.surface].filter(Boolean).join(', ');
  return tool ? `${who} (${tool})` : who;
}

/** A computed session: who, when, the goals in order, what they touched, any handoff note. */
function sessionLines(session: Record<string, any>, indent = ''): string[] {
  const goals: string[] = Array.isArray(session.goals) ? session.goals : [];
  const items: Array<Record<string, any>> = Array.isArray(session.items) ? session.items : [];
  const handoffs: Array<Record<string, any>> = Array.isArray(session.handoffs) ? session.handoffs : [];
  const goalText = goals.length ? goals.join(' → ') : session.inBrowser ? 'in the browser' : 'no stated goal';
  const lines = [
    `${indent}${sessionWho(session)}  ${session.startedAt ?? '-'} → ${session.lastAt ?? '-'}  ${session.eventCount ?? 0} change${session.eventCount === 1 ? '' : 's'}`,
    `${indent}  Goals: ${session.goalsTruncated ? '… → ' : ''}${goalText}`,
  ];
  for (const item of items) {
    const version = item.versionId ? `  version ${item.versionId}` : '';
    lines.push(`${indent}  ${item.type ?? '-'}  ${item.title ?? '(gone)'}  [${item.id}]  ×${item.changes ?? 1}${version}`);
  }
  if (session.itemsTruncated) lines.push(`${indent}  … earlier items not shown`);
  for (const note of handoffs) lines.push(`${indent}  Handoff: ${note.title ?? '(untitled)'}  [${note.artifactId}]  rip artifact cat ${note.artifactId}`);
  if (session.handoffsTruncated) lines.push(`${indent}  … earlier handoffs not shown`);
  if (session.earlierActivityNotShown) lines.push(`${indent}  (earlier activity of this session not shown)`);
  return lines;
}

/** `rip workspace sessions`: recent computed sessions, newest first, with the next-page command. */
export const formatWorkspaceSessions = (data: unknown, workspace?: string): string => {
  const value = data as Record<string, any>;
  const items: Array<Record<string, any>> = Array.isArray(value.items) ? value.items : [];
  const continues = Boolean(value.hasMore && value.nextCursor && workspace);
  if (!items.length && !continues) return 'No sessions.';
  // A page can be empty and still continue (a stretch of activity that forms no session).
  const lines = items.length
    ? items.flatMap((session, index) => [...(index ? [''] : []), ...sessionLines(session)])
    : ['No sessions in this range.'];
  if (continues) {
    lines.push('', `More: rip workspace sessions ${workspaceShellArgument(workspace)} --cursor ${workspaceShellArgument(value.nextCursor)}`);
  }
  return lines.join('\n');
};

/**
 * `rip workspace load` in human mode is the first thing an agent reads, so it
 * carries everything the load returned: pins (inline or with the command that
 * reads them), the latest handoff, open tasks, recent changes, the artifact
 * index, and the exact flags that page each list further.
 */
export const formatWorkspaceLoad: Formatter = (data) => {
  const value = data as Record<string, any>;
  const workspace = (value.workspace ?? {}) as Record<string, any>;
  const workspaceId = workspace.id ?? value.workspaceId ?? '-';
  const lines = [
    `Workspace: ${workspace.name ?? '-'} [${workspaceId}]${workspace.role ? `  ${workspace.membership}/${workspace.role}` : ''}`,
  ];
  const can = capabilityList(workspace.capabilities);
  if (can) lines.push(`Can:       ${can}`);
  if (value.browserLink) lines.push(`Browser:   ${value.browserLink}`);
  if (workspace.description) lines.push('', String(workspace.description));

  const pins: Array<Record<string, any>> = Array.isArray(value.pins) ? value.pins : [];
  lines.push(...loadSection(`Pinned (${pins.length}):`, pins.flatMap((pin) => loadDocumentLines(pin))));

  const handoffs = value.handoffs ?? {};
  const handoffItems: Array<Record<string, any>> = Array.isArray(handoffs.items) ? handoffs.items : [];
  lines.push(...loadSection('Latest handoff:', handoffItems.length ? loadDocumentLines(handoffItems[0]) : []));
  if (handoffItems.length > 1) lines.push(`  ${handoffItems.length - 1} earlier: ${handoffItems.slice(1).map((h) => h.publicId).join(', ')}`);

  if (value.sessions) {
    const sessions = value.sessions;
    const sessionItems: Array<Record<string, any>> = Array.isArray(sessions.items) ? sessions.items : [];
    lines.push(...loadSection(`Recent sessions (${sessionItems.length}${sessions.hasMore ? '+' : ''}):`, sessionItems.flatMap((session) => sessionLines(session, '  '))));
    if (sessions.hasMore && sessions.nextCursor) lines.push(`  More: rip workspace sessions ${workspaceShellArgument(workspaceId)} --cursor ${workspaceShellArgument(sessions.nextCursor)}`);
  }

  const tasks = value.tasks ?? {};
  const taskItems: Array<Record<string, any>> = Array.isArray(tasks.items) ? tasks.items : [];
  lines.push(...loadSection(
    `Tasks (${taskItems.length}${tasks.hasMore ? '+' : ''}):`,
    taskItems.map((t) => `  ${t.status ?? '-'}  ${t.title ?? '(untitled)'}  [${t.id}]`),
  ));

  const activity = value.activity ?? {};
  const activityItems: Array<Record<string, any>> = Array.isArray(activity.items) ? activity.items : [];
  lines.push(...loadSection(
    `Recent changes (${activityItems.length}${activity.hasMore ? '+' : ''}):`,
    activityItems.map((e) => `  ${e.createdAt ?? '-'}  ${e.type ?? 'change'}  ${e.subject?.type ?? '-'}:${e.subject?.id ?? '-'}`),
  ));
  if (activity.refresh === 'required') lines.push('  Access changed: re-read before continuing.');
  if (activity.historyGap) lines.push('  History gap: older changes were pruned.');

  const artifacts = value.artifacts ?? {};
  const artifactItems: Array<Record<string, any>> = Array.isArray(artifacts.items) ? artifacts.items : [];
  lines.push(...loadSection(
    `Artifacts (${artifactItems.length}${artifacts.hasMore ? '+' : ''}):`,
    artifactItems.map((a) => `  ${a.title ?? '(untitled)'}  [${a.publicId ?? a.id}]  ${a.type ?? '-'} ${a.audience ?? ''}`.trimEnd()),
  ));

  const more: string[] = [];
  if (artifacts.nextOffset != null) more.push(`--artifact-offset ${artifacts.nextOffset}`);
  if (tasks.nextCursor != null) more.push(`--task-cursor ${workspaceShellArgument(tasks.nextCursor)}`);
  if (activity.nextCursor != null) more.push(`--activity-cursor ${workspaceShellArgument(activity.nextCursor)}`);
  if (handoffs.nextOffset != null) more.push(`--handoff-offset ${handoffs.nextOffset}`);
  if (more.length) {
    lines.push('', 'More:');
    for (const flag of more) lines.push(`  rip workspace load ${workspaceShellArgument(workspaceId)} ${flag}`);
  }
  return lines.join('\n');
};

/**
 * Consecutive changes made by one actor toward one goal print under one heading. A browser edit
 * states no goal by design. Change items carry no key, so the browser is read from its harness.
 */
function changeHeading(item: Record<string, any>): string {
  const actor = item.actor ?? {};
  const tool = [item.agent?.name, actor.surface].filter(Boolean).join(', ');
  const goal = item.why
    ?? (actor.type === 'system' ? 'system' : !item.agent && actor.surface === 'dashboard' ? 'in the browser' : 'no stated goal');
  return `${actor.id ?? '-'}${tool ? ` (${tool})` : ''}: ${goal}`;
}

export const formatWorkspaceChanges: Formatter = (data) => {
  const value = data as Record<string, any>;
  const items = Array.isArray(value.items) ? value.items : [];
  const lines: string[] = [];
  let heading: string | null = null;
  for (const item of items as Array<Record<string, any>>) {
    // A server from before session capture sends no why at all: print the line as it always was.
    if (!('why' in item)) {
      lines.push(`${item.sequence ?? '-'}  ${item.type ?? 'change'}  ${item.subject?.type ?? '-'}:${item.subject?.id ?? '-'}`);
      heading = null;
      continue;
    }
    const next = changeHeading(item);
    if (next !== heading) lines.push(next);
    heading = next;
    lines.push(`  ${item.createdAt ?? '-'}  ${item.type ?? 'change'}  ${item.subject?.type ?? '-'}:${item.subject?.id ?? '-'}`);
  }
  lines.push(`Delivery token: ${value.deliveryToken ?? '-'}`);
  if (value.nextCursor != null) lines.push(`Next cursor: ${value.nextCursor}`);
  return lines.join('\n');
};

export const formatWorkspaceViewReceipt: Formatter = (data) => {
  const value = data as Record<string, any>;
  return [
    `Status:     ${value.status ?? (value.connected ? 'connected' : 'disconnected')}`,
    `Workspace:  ${value.workspaceId ?? '-'}`,
    `Session:    ${value.sessionId ?? '-'}`,
    `Artifact:   ${value.artifactId ?? value.savedArtifactId ?? '-'}`,
    `Generation: ${value.contextGeneration ?? value.expectedContextGeneration ?? '-'}`,
  ].join('\n');
};


// ── skills ─────────────────────────────────────────────────────────────

/** `personal (~alias)` or `team <slug>`; the slug is what `--team` takes. */
function skillOwnerLabel(owner: any): string {
  if (owner?.kind === 'team') return `team ${owner.slug}`;
  return owner?.alias ? `personal (~${owner.alias})` : 'personal';
}

/** The `rip skill get` arguments that name this skill again (team skills need `--team`). */
function skillGetArgs(skill: any): string {
  return skill.owner?.kind === 'team' ? `${skill.name} --team ${skill.owner.slug}` : String(skill.name);
}

/** `rip skill list` — one block per skill: name, owner, version, sharing, id, then description and link. */
export const formatSkillList: Formatter = (data) => {
  const skills = ((data as any).skills ?? []) as Array<Record<string, any>>;
  if (skills.length === 0) return 'No skills in reach. Publish a folder with SKILL.md: rip skill publish <folder> [--team <slug>]';
  const lines: string[] = [];
  for (const s of skills) {
    lines.push(`${String(s.name).padEnd(28)} ${skillOwnerLabel(s.owner).padEnd(24)} v${s.version}  ${String(s.sharing).padEnd(7)}  [${s.id}]`);
    lines.push(`    ${s.description}`);
    if (s.link) lines.push(`    ${s.link}`);
  }
  lines.push('', 'Read one: rip skill get <name> [--team <slug>]');
  return lines.join('\n');
};

/** `rip skill get` — a short header, the SKILL.md instructions, then the files and how to read them. */
export const formatSkill: Formatter = (data) => {
  const s = data as Record<string, any>;
  const files = (s.files ?? []) as Array<{ path: string; size: number }>;
  const lines = [
    `Skill: ${s.name} — ${skillOwnerLabel(s.owner)}, version ${s.version?.number}, ${s.sharing}`,
    `ID:    ${s.id}`,
  ];
  if (s.link) lines.push(`Link:  ${s.link}`);
  lines.push('', String(s.entry?.text ?? '').trimEnd(), '', `Files (${files.length}):`);
  for (const f of files) lines.push(`  ${f.path.padEnd(40)} ${fmtSize(f.size)}`);
  lines.push('', `Read a file: rip skill get ${s.id} --file <path>`);
  return lines.join('\n');
};

/** `rip skill get --dir` — where the files went. */
export const formatSkillSaved: Formatter = (data) => {
  const files = ((data as any).files ?? []) as string[];
  return [
    `Saved ${data.name} version ${data.version} to ${data.dir} (${files.length} files):`,
    ...files.map((f) => `  ${f}`),
    `Edit the files, then: rip skill publish ${data.dir} (checked against version ${data.version})`,
  ].join('\n');
};

/** `rip skill publish` — the new version, its id, and what was removed. */
export const formatSkillPublished: Formatter = (data) => {
  const d = data as Record<string, any>;
  const skill = d.skill ?? {};
  const headline = d.unchanged
    ? `Unchanged: this folder matches version ${d.version} of ${skill.name}; nothing was published`
    : `${d.created ? 'Created' : 'Published'} ${skill.name} version ${d.version} — ${skillOwnerLabel(skill.owner)}`;
  const lines = [
    headline,
    `  ID:      ${skill.id}`,
    `  Sent:    ${d.sent} file${d.sent === 1 ? '' : 's'}`,
  ];
  // Which version the folder was compared with, and so sent as expectedVersion.
  const base = { checkout: 'the version this folder was fetched at or last published as', current: 'the current version', explicit: '--expected-version' }[d.basedOn as string];
  if (base && !d.created) lines.push(`  Based on: version ${d.baseVersion} (${base})`);
  const removed = (d.removed ?? []) as string[];
  if (removed.length) lines.push(`  Removed: ${removed.join(', ')}`);
  lines.push(`  Sharing: ${skill.sharing}${skill.link ? ` — ${skill.link}` : ''}`);
  lines.push(`  Read it: rip skill get ${skillGetArgs(skill)}`);
  return lines.join('\n');
};

/** `rip skill share` — the new sharing state and, when shared, the link to hand out. */
export const formatSkillShared: Formatter = (data) => {
  const s = data as Record<string, any>;
  const state = s.sharing === 'link' ? `shared by link: ${s.link}` : 'private (link sharing stopped)';
  return `${s.name} is now ${state}\n  ID: ${s.id}`;
};

/** `rip skill delete`. */
export const formatSkillDeleted: Formatter = (data) => `Deleted skill ${data.name ?? data.id} [${data.id}]`;

const STUB_SKIP_REASONS: Record<string, string> = {
  unmanaged: 'a folder not written by rip skill install has this name; it is left alone',
  name_taken: 'another skill in reach has this name and was installed instead',
  other_agent: 'a stub installed by another agent has this name; run install as that agent to change it',
  invalid_entry: 'the catalog entry has no valid name or id',
};

/** `rip skill install` — the folder, then each change and each skipped skill with its reason. */
export const formatSkillInstall: Formatter = (data) => {
  const d = data as Record<string, any>;
  const lines = [`Skill stubs in ${d.dir} (target ${d.target}${d.accountId ? `, agent ${d.accountId}` : ''})`];
  const row = (label: string, names: string[]) => {
    if (names?.length) lines.push(`  ${label.padEnd(10)} ${names.join(', ')}`);
  };
  row('Written:', d.written);
  row('Refreshed:', d.refreshed);
  row('Unchanged:', d.unchanged);
  row('Removed:', d.removed);
  if (d.kept?.length) lines.push(`  Kept:      ${d.kept.join(', ')} (skill gone; the stub was removed but the folder holds files rip did not write)`);
  for (const s of (d.skipped ?? []) as Array<{ name: string; team: string | null; reason: string }>) {
    lines.push(`  Skipped:   ${s.name}${s.team ? ` --team ${s.team}` : ''} (${s.reason}: ${STUB_SKIP_REASONS[s.reason] ?? s.reason})`);
  }
  for (const f of (d.failed ?? []) as Array<{ name: string; team: string | null; error: string }>) {
    lines.push(`  Failed:    ${f.name}${f.team ? ` --team ${f.team}` : ''} (${f.error})`);
  }
  if (lines.length === 1) lines.push('  No skills in reach; nothing to install.');
  lines.push('', `Run rip${d.accountId ? ` --agent ${d.accountId}` : ''} skill install --target ${d.target} again after skills are published, renamed or deleted.`);
  return lines.join('\n');
};
