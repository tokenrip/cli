import { assertWorkspaceCreationScope } from '../input.js';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatArtifactCreated } from '../formatters.js';
import { parseJsonOption, parseJsonObjectOption } from '../json.js';
import { getFrontendUrl } from '../config.js';
import { resolveTeam, resolveTeams } from '../teams.js';

const VALID_TYPES = ['markdown', 'html', 'chart', 'code', 'text', 'json', 'table', 'csv'] as const;
type ContentType = (typeof VALID_TYPES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the new artifact is filed and who it is shared with: `--team` lists the teams to share it
 * with (`teams`); its first team also scopes a `--folder` slug (`team`), and is sent only then (a
 * folder id stands alone, and with no folder the server has nothing to scope).
 */
export function addHomeFields(body: Record<string, unknown>, options: { team?: string; folder?: string }): void {
  if (options.team) body.teams = resolveTeams(options.team.split(',').map((t) => t.trim()));
  if (options.folder) {
    body.folder = options.folder;
    if (options.team && !UUID.test(options.folder)) body.team = resolveTeam(options.team.split(',')[0]!.trim());
  }
}

function addWorkspaceFields(body: Record<string, unknown>, options: { workspaceId?: string; audience?: string; why?: string }): void {
  if (options.workspaceId) body.workspaceId = options.workspaceId;
  if (options.audience) body.audience = options.audience;
  if (options.why !== undefined) body.why = options.why;
}

/**
 * Standard create-response payload. Echoes both `id` and `publicId` (same
 * value — the rest of the platform keys on `publicId`) and the `alias` the
 * caller set, so scripts don't print `None` looking for a field publish never
 * returned (Moa debrief §3.6). `aliasFallback` is the `--alias` we sent, used
 * when the backend response doesn't echo it.
 */
function artifactCreatedPayload(
  data: { id: string; url?: string; title?: string; type?: string; currentVersionId?: string; publicId?: string; alias?: string; rawUrl?: string | null; publicUrl?: string; workspaceId?: string; audience?: string; workspaceRevision?: number },
  url: string,
  aliasFallback: string | undefined,
): Record<string, unknown> {
  const alias = data.alias ?? aliasFallback ?? null;
  return {
    id: data.id,
    publicId: data.publicId ?? data.id,
    ...(alias ? { alias } : {}),
    url,
    rawUrl: data.rawUrl ?? null,
    title: data.title,
    type: data.type,
    currentVersionId: data.currentVersionId,
    publicUrl: data.publicUrl ?? null,
    ...(data.workspaceId ? { workspaceId: data.workspaceId, audience: data.audience, workspaceRevision: data.workspaceRevision } : {}),
  };
}

export async function publish(
  filePath: string | undefined,
  options: {
    type: string;
    title?: string;
    content?: string;
    parent?: string;
    context?: string;
    refs?: string;
    schema?: string;
    alias?: string;
    headers?: boolean;
    fromCsv?: boolean;
    dryRun?: boolean;
    team?: string;
    folder?: string;
    metadata?: string;
    publicAsset?: boolean;
    visibility?: string;
    strict?: boolean;
    workspaceId?: string;
    audience?: 'internal' | 'shared';
    why?: string;
  },
): Promise<void> {
  assertWorkspaceCreationScope(options);
  if (!VALID_TYPES.includes(options.type as ContentType)) {
    throw new CliError('INVALID_TYPE', `Type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  if (options.type === 'table') {
    // What a table does not store is refused here rather than sent (the server refuses it too).
    if (options.metadata) throw new CliError('INVALID_ARGS', 'A table keeps its schema in metadata: use --schema (and --strict) instead of --metadata.');
    if (options.publicAsset) throw new CliError('INVALID_ARGS', 'A table cannot be a public asset.');
    if (options.fromCsv && options.strict) throw new CliError('INVALID_ARGS', 'A table imported from CSV is not strict: --strict applies to a table created from --schema.');
  }
  if (options.headers && !(options.type === 'table' && options.fromCsv)) {
    throw new CliError('INVALID_ARGS', '--headers applies to CSV imported into a table (--type table --from-csv).');
  }

  let parsedMetadata: Record<string, unknown> | undefined;
  if (options.metadata) {
    parsedMetadata = parseJsonObjectOption(options.metadata, '--metadata');
  }

  // Validate: exactly one of {filePath, --content}. We treat empty string the
  // same as missing so `publish('', ...)` behaves like the no-arg case.
  const hasFile = filePath !== undefined && filePath !== '';
  const hasContent = options.content !== undefined;
  if (hasFile && hasContent) {
    throw new CliError('INVALID_ARGS', 'Provide either a file or --content, not both.');
  }
  const isSchemaOnlyTable = options.type === 'table' && options.schema && !options.fromCsv;
  if (!hasFile && !hasContent && !isSchemaOnlyTable) {
    throw new CliError('INVALID_ARGS', 'Provide either a file or --content.');
  }

  // Inline content path: skip all filesystem reads and send the string directly.
  // Tables / CSV import still need a file, so this branch is text-like types only.
  if (hasContent) {
    if (options.dryRun) {
      outputSuccess(
        {
          dryRun: true,
          action: 'would publish inline',
          title: options.title,
          type: options.type,
          size: options.content!.length,
        },
        formatArtifactCreated,
      );
      return;
    }

    const { client, config } = requireAuthClient();
    const body: Record<string, unknown> = {
      type: options.type,
      content: options.content,
    };
    if (options.title) body.title = options.title;
    if (options.alias) body.alias = options.alias;
    if (options.parent) body.parentArtifactId = options.parent;
    if (options.context) body.creatorContext = options.context;
    if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());
    addHomeFields(body, options);
    if (parsedMetadata) body.metadata = parsedMetadata;
    if (options.publicAsset) body.publicAsset = true;
    if (options.visibility) body.visibility = options.visibility;
    addWorkspaceFields(body, options);

    const { data } = await client.post('/v0/artifacts', body);
    const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
    outputSuccess(
      artifactCreatedPayload(data.data, url, options.alias),
      formatArtifactCreated,
    );
    return;
  }

  // Table → CSV import path: single-command creation of a table from a CSV file
  if (options.type === 'table' && options.fromCsv) {
    const absPath = path.resolve(filePath!);
    if (!fs.existsSync(absPath)) {
      throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8');
    const title = options.title || path.basename(absPath, path.extname(absPath));

    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create table from csv', title, rows: content.split('\n').length }, formatArtifactCreated);
      return;
    }

    // A table with CSV content imports its rows (the server's one selector for CSV import).
    const body: Record<string, unknown> = {
      type: 'table',
      content,
      title,
    };
    if (options.headers) body.headers = true;
    if (options.schema) body.schema = parseJsonOption(options.schema, '--schema');
    if (options.alias) body.alias = options.alias;
    if (options.parent) body.parentArtifactId = options.parent;
    if (options.context) body.creatorContext = options.context;
    if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());
    addHomeFields(body, options);
    // No publicAsset, metadata or strict here: a table is never a public asset, keeps its schema
    // in metadata, and a table imported from CSV is not strict (all refused above).
    if (options.visibility) body.visibility = options.visibility;
    addWorkspaceFields(body, options);

    const { client, config } = requireAuthClient();
    const { data } = await client.post('/v0/artifacts', body);
    const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
    outputSuccess(artifactCreatedPayload(data.data, url, options.alias), formatArtifactCreated);
    return;
  }

  // Table schema-only path
  if (options.type === 'table') {
    let schema: unknown;
    if (options.schema) {
      schema = parseJsonOption(options.schema, '--schema');
    } else {
      const absPath = path.resolve(filePath!);
      if (!fs.existsSync(absPath)) {
        throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
      }
      schema = parseJsonOption(fs.readFileSync(absPath, 'utf-8'), filePath!);
    }

    const title = options.title || 'Untitled Table';

    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create table', title, schema }, formatArtifactCreated);
      return;
    }

    const { client, config } = requireAuthClient();
    const body: Record<string, unknown> = { type: 'table', title, schema };
    if (options.alias) body.alias = options.alias;
    if (options.parent) body.parentArtifactId = options.parent;
    if (options.context) body.creatorContext = options.context;
    if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());
    addHomeFields(body, options);
    // Same as the CSV table path above — public assets are not valid on tables.
    if (options.visibility) body.visibility = options.visibility;
    if (options.strict) body.strict = true;
    addWorkspaceFields(body, options);

    const { data } = await client.post('/v0/artifacts', body);
    const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
    outputSuccess(artifactCreatedPayload(data.data, url, options.alias), formatArtifactCreated);
    return;
  }

  const absPath = path.resolve(filePath!);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  const title = options.title || path.basename(absPath);
  const size = fs.statSync(absPath).size;

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would publish', file: absPath, title, type: options.type, size }, formatArtifactCreated);
    return;
  }

  const { client, config } = requireAuthClient();
  const content = fs.readFileSync(absPath, 'utf-8');

  const body: Record<string, unknown> = {
    type: options.type,
    content,
    title,
  };
  if (options.alias) body.alias = options.alias;
  if (options.parent) body.parentArtifactId = options.parent;
  if (options.context) body.creatorContext = options.context;
  if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());
  addHomeFields(body, options);
  if (parsedMetadata) body.metadata = parsedMetadata;
  if (options.publicAsset) body.publicAsset = true;
  if (options.visibility) body.visibility = options.visibility;
  addWorkspaceFields(body, options);

  const { data } = await client.post('/v0/artifacts', body);

  const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
  outputSuccess(artifactCreatedPayload(data.data, url, options.alias), formatArtifactCreated);
}
