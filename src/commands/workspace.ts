import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';

function ref(workspace: string): string {
  return encodeURIComponent(workspace);
}

// ---- container ----

export async function workspaceCreate(
  slug: string,
  options: { name?: string; description?: string; team?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/workspaces', {
    slug,
    name: options.name ?? slug,
    description: options.description,
    team: options.team,
  });
  outputSuccess(data.data);
}

export async function workspaceList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/workspaces');
  outputSuccess(data.data);
}

export async function workspaceShow(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}`);
  outputSuccess(data.data);
}

export async function workspaceDelete(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${ref(workspace)}`);
  outputSuccess({ ok: true });
}

export async function workspaceArchive(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/archive`);
  outputSuccess(data.data);
}

// ---- members ----

export async function workspaceMemberAdd(
  workspace: string,
  account: string,
  options: { role?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/members`, { account, role: options.role });
  outputSuccess(data.data);
}

export async function workspaceMemberRemove(workspace: string, account: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${ref(workspace)}/members/${encodeURIComponent(account)}`);
  outputSuccess({ ok: true });
}

export async function workspaceMemberList(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/members`);
  outputSuccess(data.data);
}

// ---- items ----

export async function workspaceItemAdd(
  workspace: string,
  item: string,
  options: { ownership?: string; kind?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/items`, {
    kind: options.kind ?? 'artifact',
    item,
    ownership: options.ownership ?? 'linked',
  });
  outputSuccess(data.data);
}

export async function workspaceItemList(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/items`);
  outputSuccess(data.data);
}

export async function workspaceItemRemove(
  workspace: string,
  item: string,
  options: { kind?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${ref(workspace)}/items/${encodeURIComponent(options.kind ?? 'artifact')}/${encodeURIComponent(item)}`);
  outputSuccess({ ok: true });
}

// ---- notes ----

export async function workspaceCapture(workspace: string, text: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/capture`, { text });
  outputSuccess(data.data);
}

export async function workspaceNoteSet(
  workspace: string,
  options: { title?: string; body?: string; slug?: string; maturity?: string; sourceArtifact?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  if (options.slug) {
    const { data } = await client.patch(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(options.slug)}`, {
      title: options.title,
      body: options.body,
      maturity: options.maturity,
    });
    outputSuccess(data.data);
  } else {
    const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/notes`, {
      title: options.title,
      body: options.body,
      maturity: options.maturity,
      sourceArtifact: options.sourceArtifact,
    });
    outputSuccess(data.data);
  }
}

export async function workspaceNoteArchive(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}/archive`, {});
  outputSuccess(data.data);
}

export async function workspaceNoteUnarchive(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}/unarchive`, {});
  outputSuccess(data.data);
}

export async function workspaceNoteDelete(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}`);
  outputSuccess({ ok: true });
}

export async function workspaceNoteGet(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}`);
  outputSuccess(data.data);
}

export async function workspaceNoteList(
  workspace: string,
  options: { archived?: boolean; includeArchived?: boolean } = {},
): Promise<void> {
  const { client } = requireAuthClient();
  const params = new URLSearchParams();
  if (options.archived) params.set('archived', 'true');
  if (options.includeArchived) params.set('include_archived', 'true');
  const qs = params.toString();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/notes${qs ? `?${qs}` : ''}`);
  outputSuccess(data.data);
}

export async function workspaceSearch(workspace: string, query: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/notes`, { params: { q: query } });
  outputSuccess(data.data);
}

// ---- maturity + consolidation (Slice 1) ----

export async function workspaceNotePromote(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}/promote`, {});
  outputSuccess(data.data);
}

export async function workspaceWorklist(
  workspace: string,
  options: { staleCaptureDays?: string; staleTopTierDays?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const params = new URLSearchParams();
  if (options.staleCaptureDays) params.set('staleCaptureDays', options.staleCaptureDays);
  if (options.staleTopTierDays) params.set('staleTopTierDays', options.staleTopTierDays);
  const qs = params.toString();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/worklist${qs ? `?${qs}` : ''}`);
  outputSuccess(data.data);
}

// ---- links ----

export async function workspaceLink(
  workspace: string,
  fromSlug: string,
  toSlug: string,
  options: { relation?: string },
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(fromSlug)}/links`, {
    to: toSlug,
    relation: options.relation,
  });
  outputSuccess(data.data);
}

export async function workspaceUnlink(workspace: string, fromSlug: string, toSlug: string): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(fromSlug)}/links/${encodeURIComponent(toSlug)}`);
  outputSuccess({ ok: true });
}

export async function workspaceLinks(workspace: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/workspaces/${ref(workspace)}/notes/${encodeURIComponent(slug)}/links`);
  outputSuccess(data.data);
}
