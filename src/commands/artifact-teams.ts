// `rip artifact team add/remove` — share or un-share an EXISTING artifact with
// teams. Wraps the backend `POST /v0/artifacts/:uuid/teams` and
// `DELETE /v0/artifacts/:uuid/teams/:teamSlug` endpoints.
//
// Why this exists (Moa debrief §3.4): previously the only way to set an
// artifact's team was at publish time (`publish --team`). An already-published
// artifact with `teams: []` could not be team-scoped — `artifact patch` has no
// `--team`, and `artifact share` only mints capability links. The sole route
// was delete + republish-with-`--team`. These verbs close that gap.

import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { resolveTeams, resolveTeam } from '../teams.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactTeamAdd(
  identifier: string,
  teams: string[],
): Promise<void> {
  if (!teams || teams.length === 0) {
    throw new CliError('INVALID_ARGS', 'Provide at least one team slug to share with.');
  }
  const id = parseArtifactId(identifier);
  const slugs = resolveTeams(teams.map((t) => t.trim()).filter(Boolean));
  const { client } = requireAuthClient();
  // The endpoint returns `{ ok: true, warning? }` (no nested `data`).
  const { data } = await client.post(
    `/v0/artifacts/${encodeURIComponent(id)}/teams`,
    { teams: slugs },
  );
  const warning = typeof data?.warning === 'string' ? data.warning : undefined;
  outputSuccess({ id, teams: slugs, ...(warning ? { warning } : {}) }, (raw) => {
    const w = (raw as { warning?: string }).warning;
    return `Shared ${id} with team(s): ${slugs.join(', ')}` + (w ? `\nWarning: ${w}` : '');
  });
}

export async function artifactTeamRemove(
  identifier: string,
  team: string,
): Promise<void> {
  const id = parseArtifactId(identifier);
  const slug = resolveTeam(team.trim());
  const { client } = requireAuthClient();
  // 204 No Content on success.
  await client.delete(
    `/v0/artifacts/${encodeURIComponent(id)}/teams/${encodeURIComponent(slug)}`,
  );
  outputSuccess({ id, team: slug }, () => `Un-shared ${id} from team: ${slug}`);
}
