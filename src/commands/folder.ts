import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTrashed } from '../formatters.js';
import { assertWorkspaceCreationScope, historyField, parseNonNegativeInteger } from '../input.js';
import { CliError } from '../errors.js';
import { resolveTeam } from '../teams.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/**
 * Where a folder slug lives: `--team` (a local alias or a slug) or `--workspace-id`; neither means a
 * personal folder. A folder id stands alone, so it takes neither (the server refuses `team` beside
 * one). Plan M8: one set of routes, `/v0/folders`, for every kind.
 */
type FolderScope = { team?: string; workspaceId?: string };

function scopeOf(options: FolderScope): FolderScope {
  return {
    ...(options.team !== undefined ? { team: resolveTeam(options.team) } : {}),
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
  };
}

/** The folder's revision when the caller sent one; it is opt-in (refused only when stale). */
function optionalRevision(value: string | undefined): { expectedWorkspaceRevision?: number } {
  return value === undefined ? {} : { expectedWorkspaceRevision: parseNonNegativeInteger(value, '--expected-workspace-revision') };
}

function optionalWhy(why: string | undefined): { why?: string } {
  return why === undefined ? {} : { why };
}

const folderPath = (folder: string) => `/v0/folders/${encodeURIComponent(folder)}`;

/** `rip folder create`: a personal folder, a team's (`--team`) or a workspace's (`--workspace-id`). */
export async function folderCreate(slug: string, options: FolderScope & { audience?: 'internal' | 'shared'; why?: string }): Promise<void> {
  assertWorkspaceCreationScope(options);
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/folders', {
    slug, ...scopeOf(options),
    ...(options.audience !== undefined ? { audience: options.audience } : {}),
    ...optionalWhy(options.why),
  });
  outputSuccess(data.data);
}

/** `rip folder list`: your personal folders, a team's, or the ones you can see in a workspace. */
export async function folderList(options: FolderScope): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/folders', { params: scopeOf(options) });
  outputSuccess(data.data);
}

/** `rip folder show <folder>`: by id (any kind), or by slug in its scope. */
export async function folderShow(folder: string, options: FolderScope): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(folderPath(folder), { params: scopeOf(options) });
  outputSuccess(data.data);
}

/** Move a folder, and the artifacts in it, to the trash; restorable for 30 days. Inputs go in the body. */
export async function folderDelete(
  folder: string,
  options: FolderScope & { expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const body = { ...scopeOf(options), ...optionalRevision(options.expectedWorkspaceRevision), ...optionalWhy(options.why) };
  const { data } = await client.delete(folderPath(folder), Object.keys(body).length ? { data: body } : {});
  outputSuccess(data.data, formatTrashed);
}

/** `rip folder rename <folder> <new-slug>`: any kind (`PATCH { newSlug }`). */
export async function folderRename(
  folder: string,
  newSlug: string,
  options: FolderScope & { expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.patch(folderPath(folder), {
    newSlug, ...scopeOf(options), ...optionalRevision(options.expectedWorkspaceRevision), ...optionalWhy(options.why),
  });
  outputSuccess(data.data);
}

/**
 * `rip folder update <folder> --audience | --history`: a workspace folder's audience, or any folder's
 * history setting (`inherit` clears it); one per call, as the server takes them.
 */
export async function folderUpdate(
  folder: string,
  options: FolderScope & { audience?: 'internal' | 'shared'; history?: string; expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const body = {
    ...historyField(options.history),
    ...(options.audience !== undefined ? { audience: options.audience } : {}),
    ...scopeOf(options), ...optionalRevision(options.expectedWorkspaceRevision), ...optionalWhy(options.why),
  };
  if (options.audience === undefined && options.history === undefined) {
    throw new CliError('INVALID_ARGS', 'Provide --audience or --history.');
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(folderPath(folder), body);
  outputSuccess(data.data);
}

/** `rip folder share-contents <folder>`: a workspace folder and every artifact in it become shared. */
export async function folderShareContents(
  folder: string,
  options: { workspaceId?: string; expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`${folderPath(folder)}/share-contents`, {
    ...scopeOf(options), ...optionalRevision(options.expectedWorkspaceRevision), ...optionalWhy(options.why),
  });
  outputSuccess(data.data);
}

/**
 * `rip artifact move`: file the artifact into `--folder` (an id, or a slug: in its workspace, else
 * in `--team`, else your personal folders) or unfile it (`--unfiled`, `folder: null`). The server
 * resolves the folder; a move always names its destination.
 */
export async function artifactMove(identifier: string, options: { folder?: string; team?: string; unfiled?: boolean; expectedWorkspaceRevision?: string; why?: string }): Promise<void> {
  if (options.unfiled && options.folder) throw new CliError('INVALID_ARGS', 'Provide --folder or --unfiled, not both');
  if (!options.unfiled && !options.folder) throw new CliError('MISSING_FIELD', 'Provide --folder <id-or-slug> or --unfiled');
  if (options.unfiled && options.team) throw new CliError('INVALID_ARGS', '--team scopes a folder slug: leave it out with --unfiled');
  const id = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  const body = {
    folder: options.unfiled ? null : options.folder!,
    ...(options.team ? { team: resolveTeam(options.team) } : {}),
    ...optionalRevision(options.expectedWorkspaceRevision),
    ...(options.why !== undefined ? { why: options.why } : {}),
  };
  const { data } = await client.patch(`/v0/artifacts/${id}`, body);
  outputSuccess(options.unfiled ? { id: data.data.id ?? id, folder_id: null } : data.data);
}
