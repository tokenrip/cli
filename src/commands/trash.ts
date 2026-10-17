import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';
import { parseNonNegativeInteger } from '../input.js';
import { formatRestored, formatTrashList, formatTrashPurged } from '../formatters.js';
import { CliError, toCliError } from '../errors.js';

export interface TrashListOptions {
  workspace?: string;
  team?: string;
  /** Another account's own trash, by id or alias (platform admins only). */
  account?: string;
  limit?: string;
  offset?: string;
}

/** `GET /v0/trash` query from the `rip trash list` flags: personal by default, or one team, workspace or account. */
export function trashListQuery(options: TrashListOptions): string {
  const q = new URLSearchParams();
  if (options.workspace) q.set('workspaceId', options.workspace);
  if (options.team) q.set('team', resolveTeam(options.team));
  if (options.account) q.set('account', options.account);
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

export interface TrashPurgeOptions {
  /** Empty a whole trash instead of one entry. */
  all?: boolean;
  team?: string;
  workspace?: string;
  /** Another account's own trash, by id or alias (platform admins only). */
  account?: string;
  why?: string;
}

type PurgeBody = {
  type?: string; id?: string; all?: true; workspaceId?: string; team?: string; account?: string; cursor?: string; why?: string;
};

interface PurgeReply {
  purged: Array<{ type: string; id: string }>;
  skipped: Array<{ type: string; id: string; reason: string }>;
  nextCursor: string | null;
}

/** The `POST /v0/trash/purge` body from `rip trash purge`: one entry, or `--all` with at most one scope. */
export function trashPurgeBody(type: string | undefined, id: string | undefined, options: TrashPurgeOptions): PurgeBody {
  const invalid = (message: string) => new CliError('INVALID_ARGS', message);
  const scopes = [options.team, options.workspace, options.account].filter((value) => value !== undefined);
  const entry = type !== undefined || id !== undefined;
  if (entry && options.all) throw invalid('Pass an entry (<type> <id>) or --all, not both.');
  if (!options.all && scopes.length) throw invalid('--team, --workspace and --account go with --all.');
  if (!entry && !options.all) throw invalid('Pass an entry (<type> <id>) or --all.');
  const why = options.why !== undefined ? { why: options.why } : {};
  if (entry) {
    if (type === undefined || id === undefined) throw invalid('An entry needs both <type> and <id>, as `rip trash list` shows them.');
    return { type, id, ...why };
  }
  if (scopes.length > 1) throw invalid('Pass at most one of --team, --workspace and --account.');
  return {
    all: true,
    ...(options.workspace !== undefined ? { workspaceId: options.workspace } : {}),
    ...(options.team !== undefined ? { team: resolveTeam(options.team) } : {}),
    ...(options.account !== undefined ? { account: options.account } : {}),
    ...why,
  };
}

/**
 * One purge call's client timeout: headroom only. A page holds at most `TRASH_PURGE_PER_CALL`
 * entries (100 by default), and a folder or workspace entry takes everything in it within that
 * call. The edge in front of the API gives up sooner (nginx 60 s, Cloudflare 100 s), so a slow
 * page can fail here while the server finishes it. Rerunning is safe: a rerun starts a new
 * cutoff, and what is already gone is not in the trash to examine.
 */
export const PURGE_CALL_TIMEOUT_MS = 5 * 60_000;

const RERUN_SAFE = 'Rerunning is safe: a rerun starts a new cutoff and skips what is already gone.';

/**
 * A transport failure (a timeout, or an edge reply such as a 504 with no API body): the page may
 * have finished on the server anyway, so what it purged is unknown. An API refusal changed nothing.
 */
const OUTCOME_UNKNOWN = new Set(['TIMEOUT', 'NETWORK_ERROR']);

/**
 * A failed `--all` call. After at least one page, the pages before it purged for good, so the
 * error carries their totals (in its message, and as `partial` in `--json`); when the failing
 * page's outcome is unknown, those totals are a floor ("at least"). Either way, and on a first
 * page whose outcome is unknown, it says a rerun is safe. A first-page refusal is the error alone.
 */
function partialPurgeError(err: unknown, total: PurgeReply, pages: number): CliError {
  const error = toCliError(err);
  const unknown = OUTCOME_UNKNOWN.has(error.code);
  if (pages === 0 && !unknown) return error;
  const lines = [error.message];
  if (pages > 0) {
    const done = `${pages} page${pages === 1 ? '' : 's'} finished before it`;
    const summary = total.purged.length || total.skipped.length
      ? formatTrashPurged(total as unknown as Record<string, unknown>)
      : 'Nothing was purged.';
    lines.push(`The purge stopped; ${done}. ${unknown ? summary.replace(/^Purged /, 'Purged at least ') : summary}`);
    error.partial = { purged: total.purged, skipped: total.skipped };
  }
  if (unknown) lines.push(`The page that failed may have finished on the server, so ${pages > 0 ? 'more' : 'some items'} may be gone.`);
  lines.push(RERUN_SAFE);
  error.message = lines.join('\n');
  return error;
}

/**
 * Purge from the trash, for good: one entry, or with `--all` a whole trash. The server examines
 * at most `TRASH_PURGE_PER_CALL` entries per call and answers `nextCursor` while more remain;
 * this repeats until it is null and prints the totals. A failed call reports what earlier pages
 * purged with the error (`partialPurgeError`); a cursor the server repeats stops the loop.
 */
export async function trashPurge(type: string | undefined, id: string | undefined, options: TrashPurgeOptions = {}): Promise<void> {
  const body = trashPurgeBody(type, id, options);
  const { client } = requireAuthClient();
  const total: PurgeReply = { purged: [], skipped: [], nextCursor: null };
  let cursor: string | null = null;
  let pages = 0;
  do {
    try {
      const { data } = await client.post('/v0/trash/purge', cursor === null ? body : { ...body, cursor }, { timeout: PURGE_CALL_TIMEOUT_MS });
      const page = data.data as Partial<PurgeReply>;
      total.purged.push(...(page.purged ?? []));
      total.skipped.push(...(page.skipped ?? []));
      pages += 1;
      const next = typeof page.nextCursor === 'string' ? page.nextCursor : null;
      if (next !== null && next === cursor) {
        throw new CliError('PURGE_CURSOR_REPEATED', 'The server answered the cursor it was given, so the purge stopped instead of repeating that page.');
      }
      cursor = next;
    } catch (err) {
      if (!body.all) throw err;
      throw partialPurgeError(err, total, pages);
    }
  } while (cursor !== null);
  outputSuccess(total as unknown as Record<string, unknown>, formatTrashPurged);
}
