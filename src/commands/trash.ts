import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';
import { parseNonNegativeInteger } from '../input.js';
import { formatRestored, formatTrashList } from '../formatters.js';

export interface TrashListOptions {
  workspace?: string;
  team?: string;
  limit?: string;
  offset?: string;
}

/** `GET /v0/trash` query from the `rip trash list` flags: personal by default, or one team or workspace. */
export function trashListQuery(options: TrashListOptions): string {
  const q = new URLSearchParams();
  if (options.workspace) q.set('workspaceId', options.workspace);
  if (options.team) q.set('team', resolveTeam(options.team));
  if (options.limit !== undefined) q.set('limit', String(parseNonNegativeInteger(options.limit, '--limit')));
  if (options.offset !== undefined) q.set('offset', String(parseNonNegativeInteger(options.offset, '--offset')));
  const qs = q.toString();
  return `/v0/trash${qs ? `?${qs}` : ''}`;
}

/** List what is in the trash, newest first, with each item's purge date. */
export async function trashList(options: TrashListOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(trashListQuery(options));
  outputSuccess(data.data, formatTrashList);
}

export interface TrashRestoreOptions {
  expectedWorkspaceRevision?: string;
  why?: string;
}

/** Bring an item back from the trash: the type and id a `rip trash list` entry shows. */
export async function trashRestore(type: string, id: string, options: TrashRestoreOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const body: { type: string; id: string; expectedWorkspaceRevision?: number; why?: string } = { type, id };
  if (options.expectedWorkspaceRevision !== undefined) {
    body.expectedWorkspaceRevision = parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  }
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.post('/v0/trash/restore', body);
  outputSuccess(data.data, formatRestored);
}
