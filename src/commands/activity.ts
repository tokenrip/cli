import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';
import { formatActivity } from '../formatters.js';

export interface ActivityOptions {
  team?: string;
  type?: string;
  actor?: string;
  subject?: string;
  since?: string;
  limit?: string;
  cursor?: string;
}

/** `GET /v0/activity` query from the `rip activity` flags. */
export function activityQuery(options: ActivityOptions): string {
  const q = new URLSearchParams();
  if (options.team) q.set('team', resolveTeam(options.team));
  if (options.type) q.set('type', options.type);
  if (options.actor) q.set('actor', options.actor);
  if (options.subject) q.set('subject', options.subject);
  if (options.since) q.set('since', options.since);
  if (options.limit) q.set('limit', options.limit);
  if (options.cursor) q.set('cursor', options.cursor);
  const qs = q.toString();
  return `/v0/activity${qs ? `?${qs}` : ''}`;
}

export async function activity(options: ActivityOptions): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(activityQuery(options));
  outputSuccess(data.data, formatActivity);
}
