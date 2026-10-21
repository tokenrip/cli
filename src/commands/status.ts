import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactList } from '../formatters.js';

export async function status(options: { since?: string; limit?: string; type?: string; folder?: string; unfiled?: boolean; team?: string; workspaceId?: string }): Promise<void> {
  const { client } = requireAuthClient();

  const params: Record<string, string> = {};
  if (options.since) params.since = options.since;
  if (options.limit) params.limit = options.limit;
  if (options.type) params.type = options.type;
  if (options.folder) params.folder = options.folder;
  if (options.unfiled) params.unfiled = 'true';
  if (options.team) params.team = options.team;
  if (options.workspaceId) params.workspaceId = options.workspaceId;

  const { data } = await client.get('/v0/artifacts/status', { params });

  outputSuccess(data.data, formatArtifactList);
}
