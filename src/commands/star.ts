import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function star(identifier: string): Promise<void> {
  const { client } = requireAuthClient();
  const id = parseArtifactId(identifier);
  const { data } = await client.post(`/v0/artifacts/${encodeURIComponent(id)}/star`);
  outputSuccess(data.data);
}

export async function unstar(identifier: string): Promise<void> {
  const { client } = requireAuthClient();
  const id = parseArtifactId(identifier);
  await client.delete(`/v0/artifacts/${encodeURIComponent(id)}/star`);
  outputSuccess({ starred: false, id });
}

export async function starred(options: { since?: string; limit?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, unknown> = {};
  if (options.since) params.since = options.since;
  if (options.limit) params.limit = parseInt(options.limit, 10);
  const { data } = await client.get('/v0/artifacts/starred', { params });
  outputSuccess(data.data);
}
