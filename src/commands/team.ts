import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTeamCreated, formatTeamList, formatTeamDetails, formatTeamMemberAdded } from '../formatters.js';
import { loadTeams, saveTeams, resolveTeam, syncTeamsFromResponse, setAlias, removeAlias } from '../teams.js';

export async function teamCreate(slug: string, options: { name?: string; description?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/teams', {
    slug,
    name: options.name ?? slug,
    description: options.description,
  });
  const team = data.data;
  const teams = loadTeams();
  teams[team.slug] = {
    id: team.id,
    name: team.name,
    slug: team.slug,
    role: 'owner',
    syncedAt: new Date().toISOString(),
  };
  saveTeams(teams);
  outputSuccess(team, formatTeamCreated);
}

export async function teamList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/teams');
  syncTeamsFromResponse(data.data);
  outputSuccess(data.data, formatTeamList);
}

export async function teamShow(slugOrId: string): Promise<void> {
  const resolved = resolveTeam(slugOrId);
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/teams/${encodeURIComponent(resolved)}`);
  outputSuccess(data.data, formatTeamDetails);
}

/**
 * `rip team add <team> <member>` — an email address, an alias or an account id. Another account of
 * the caller's own person is added at once (`{ status: 'member' }`); anyone else gets an invite
 * (`{ status: 'invited', inviteUrl }`).
 */
export async function teamAdd(slugOrId: string, member: string): Promise<void> {
  const resolved = resolveTeam(slugOrId);
  const { client } = requireAuthClient();
  const { data } = await client.post(`/v0/teams/${encodeURIComponent(resolved)}/members`, { member });
  outputSuccess(data.data, formatTeamMemberAdded(member));
}

/** `rip team remove <team> <member>` — a member (alias or account id), or a pending invite (its id or email address). */
export async function teamRemove(slugOrId: string, member: string): Promise<void> {
  const resolved = resolveTeam(slugOrId);
  const { client } = requireAuthClient();
  await client.delete(`/v0/teams/${encodeURIComponent(resolved)}/members/${encodeURIComponent(member)}`);
  outputSuccess({ ok: true });
}

export async function teamLeave(slugOrId: string): Promise<void> {
  const resolved = resolveTeam(slugOrId);
  const { client } = requireAuthClient();
  await client.post(`/v0/teams/${encodeURIComponent(resolved)}/leave`);
  const teams = loadTeams();
  delete teams[resolved];
  saveTeams(teams);
  outputSuccess({ ok: true });
}

export async function teamDelete(slugOrId: string): Promise<void> {
  const resolved = resolveTeam(slugOrId);
  const { client } = requireAuthClient();
  await client.delete(`/v0/teams/${encodeURIComponent(resolved)}`);
  const teams = loadTeams();
  delete teams[resolved];
  saveTeams(teams);
  outputSuccess({ ok: true });
}

export async function teamAlias(slug: string, alias: string): Promise<void> {
  setAlias(slug, alias);
  outputSuccess({ slug, alias });
}

export async function teamUnalias(slug: string): Promise<void> {
  removeAlias(slug);
  outputSuccess({ slug, alias: null });
}

export async function teamSync(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/teams');
  syncTeamsFromResponse(data.data);
  outputSuccess(data.data, formatTeamList);
}
