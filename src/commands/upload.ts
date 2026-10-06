import { assertWorkspaceCreationScope } from '../input.js';
import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import mime from 'mime-types';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatArtifactCreated } from '../formatters.js';
import { getFrontendUrl } from '../config.js';
import { resolveTeam, resolveTeams } from '../teams.js';

export async function upload(filePath: string, options: { title?: string; parent?: string; context?: string; refs?: string; dryRun?: boolean; team?: string; folder?: string; publicAsset?: boolean; visibility?: string; workspaceId?: string; audience?: 'internal' | 'shared'; workspaceSessionId?: string }): Promise<void> {
  assertWorkspaceCreationScope(options);
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  }

  const mimeType = mime.lookup(absPath) || 'application/octet-stream';
  const title = options.title || path.basename(absPath);
  const size = fs.statSync(absPath).size;

  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would upload', file: absPath, title, mimeType, size }, formatArtifactCreated);
    return;
  }

  const { client, config } = requireAuthClient();

  const form = new FormData();
  form.append('file', fs.createReadStream(absPath));
  form.append('type', 'file');
  form.append('mimeType', mimeType);
  form.append('title', title);

  if (options.parent) form.append('parentArtifactId', options.parent);
  if (options.context) form.append('creatorContext', options.context);
  if (options.refs) form.append('inputReferences', JSON.stringify(options.refs.split(',').map((r) => r.trim())));
  if (options.team) {
    const teamSlugs = options.team.split(',').map((t) => t.trim());
    form.append('teams', JSON.stringify(resolveTeams(teamSlugs)));
    form.append('team', resolveTeam(teamSlugs[0]));
  }
  if (options.folder) form.append('folder', options.folder);
  if (options.workspaceId) form.append('workspaceId', options.workspaceId);
  if (options.audience) form.append('audience', options.audience);
  if (options.workspaceSessionId) form.append('workspaceSessionId', options.workspaceSessionId);
  // Public-asset uploads land in a public bucket and get a direct CDN URL
  // (data.publicUrl). A public asset can't be private, so pass a non-private
  // visibility (defaults to `public` when --public-asset is set without one).
  if (options.publicAsset) {
    form.append('publicAsset', 'true');
    form.append('visibility', options.visibility ?? 'public');
  } else if (options.visibility) {
    form.append('visibility', options.visibility);
  }

  const { data } = await client.post('/v0/artifacts', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
  outputSuccess({
    id: data.data.id,
    url,
    title: data.data.title,
    type: data.data.type,
    mimeType: data.data.mimeType,
    currentVersionId: data.data.currentVersionId,
    ...(data.data.workspaceId ? { workspaceId: data.data.workspaceId, audience: data.data.audience, workspaceRevision: data.data.workspaceRevision } : {}),
    ...(data.data.publicUrl ? { publicUrl: data.data.publicUrl } : {}),
  }, formatArtifactCreated);
}
