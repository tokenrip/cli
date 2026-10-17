import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';
import { formatStorageUsage } from '../formatters.js';

export interface StorageOptions {
  team?: string;
}

/** `GET /v0/storage` query from the `rip storage` flags: your account by default, or one team. */
export function storageQuery(options: StorageOptions): string {
  return options.team ? `/v0/storage?team=${encodeURIComponent(resolveTeam(options.team))}` : '/v0/storage';
}

/** Show how much storage your account (or a team) uses against its plan, and what uses it. */
export async function storage(options: StorageOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(storageQuery(options));
  outputSuccess(data.data, formatStorageUsage);
}
