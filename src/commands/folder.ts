import type { AxiosInstance } from 'axios';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';

/**
 * Resolve a folder slug to its ID. Personal folders by default; pass a team
 * slug to resolve a team folder. Used by `artifact move` and `artifact bulk`.
 */
export async function resolveFolderId(
  client: AxiosInstance,
  folderSlug: string,
  teamSlug?: string,
): Promise<string> {
  if (teamSlug) {
    const team = resolveTeam(teamSlug);
    const { data } = await client.get(
      `/v0/teams/${encodeURIComponent(team)}/folders/${encodeURIComponent(folderSlug)}`,
    );
    return data.data.id;
  }
  const { data } = await client.get(`/v0/folders/${encodeURIComponent(folderSlug)}`);
  return data.data.id;
}

export async function folderCreate(slug: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  if (options.team) {
    const teamSlug = resolveTeam(options.team);
    const { data } = await client.post(`/v0/teams/${encodeURIComponent(teamSlug)}/folders`, { slug });
    outputSuccess(data.data);
  } else {
    const { data } = await client.post('/v0/folders', { slug });
    outputSuccess(data.data);
  }
}

export async function folderList(options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  if (options.team) {
    const teamSlug = resolveTeam(options.team);
    const { data } = await client.get(`/v0/teams/${encodeURIComponent(teamSlug)}/folders`);
    outputSuccess(data.data);
  } else {
    const { data } = await client.get('/v0/folders');
    outputSuccess(data.data);
  }
}

export async function folderShow(slug: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  if (options.team) {
    const teamSlug = resolveTeam(options.team);
    const { data } = await client.get(`/v0/teams/${encodeURIComponent(teamSlug)}/folders/${encodeURIComponent(slug)}`);
    outputSuccess(data.data);
  } else {
    const { data } = await client.get(`/v0/folders/${encodeURIComponent(slug)}`);
    outputSuccess(data.data);
  }
}

export async function folderDelete(
  slug: string,
  options: { team?: string; deleteContents?: boolean },
): Promise<void> {
  const { client } = requireAuthClient();
  const config = options.deleteContents ? { params: { mode: 'delete' } } : undefined;
  if (options.team) {
    const teamSlug = resolveTeam(options.team);
    await client.delete(`/v0/teams/${encodeURIComponent(teamSlug)}/folders/${encodeURIComponent(slug)}`, config);
  } else {
    await client.delete(`/v0/folders/${encodeURIComponent(slug)}`, config);
  }
  outputSuccess({ deleted: true, slug, contents: options.deleteContents ? 'deleted' : 'archived' });
}

export async function folderRename(oldSlug: string, newSlug: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  if (options.team) {
    const teamSlug = resolveTeam(options.team);
    const { data } = await client.patch(`/v0/teams/${encodeURIComponent(teamSlug)}/folders/${encodeURIComponent(oldSlug)}`, { slug: newSlug });
    outputSuccess(data.data);
  } else {
    const { data } = await client.patch(`/v0/folders/${encodeURIComponent(oldSlug)}`, { slug: newSlug });
    outputSuccess(data.data);
  }
}

export async function artifactMove(uuid: string, options: { folder?: string; team?: string; unfiled?: boolean }): Promise<void> {
  const { client } = requireAuthClient();

  if (options.unfiled) {
    await client.patch(`/v0/artifacts/${uuid}`, { folderId: null });
    outputSuccess({ id: uuid, folder_id: null });
    return;
  }

  if (!options.folder) {
    throw new Error('Provide --folder <slug> or --unfiled');
  }

  const folderId = await resolveFolderId(client, options.folder, options.team);

  const { data } = await client.patch(`/v0/artifacts/${uuid}`, { folderId });
  outputSuccess(data.data);
}
