import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatSearchResults } from '../formatters.js';

/** `GET /v0/search`: the query is optional (no query lists by recency within the other filters). */
export async function search(
  query: string | undefined,
  options: {
    since?: string;
    limit?: string;
    offset?: string;
    type?: string;
    workspaceId?: string;
    artifactId?: string;
  },
): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (query !== undefined) params.q = query;
  if (options.since) params.since = options.since;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;
  if (options.type) params.type = options.type;
  if (options.workspaceId) params.workspaceId = options.workspaceId;
  if (options.artifactId) params.artifactId = options.artifactId;

  const { data } = await client.get('/v0/search', { params });
  outputSuccess(data.data, formatSearchResults);
}
