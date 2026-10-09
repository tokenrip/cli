import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatSearchResults } from '../formatters.js';

export async function search(
  query: string,
  options: {
    since?: string;
    limit?: string;
    offset?: string;
    artifactType?: string;
    mode?: string;
    artifact?: string;
  },
): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = { q: query };
  if (options.since) params.since = options.since;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;
  if (options.artifactType) params.artifact_type = options.artifactType;
  if (options.mode) params.mode = options.mode;
  if (options.artifact) params.artifact = options.artifact;

  const { data } = await client.get('/v0/search', { params });
  outputSuccess(data.data, formatSearchResults);
}
