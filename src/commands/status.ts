import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatAssetList } from '../formatters.js';

export async function status(options: { since?: string; limit?: string; type?: string }): Promise<void> {
  const { client } = requireAuthClient();

  const params: Record<string, string> = {};
  if (options.since) params.since = options.since;
  if (options.limit) params.limit = options.limit;
  if (options.type) params.type = options.type;

  const { data } = await client.get('/v0/assets/status', { params });

  outputSuccess(data.data, formatAssetList);
}
