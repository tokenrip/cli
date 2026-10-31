import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveTeam } from '../teams.js';
import { formatActionsUsage } from '../formatters.js';

export interface ActionsOptions {
  team?: string;
  /** Another account, by id or alias (platform admins only). */
  account?: string;
}

/** `GET /v0/actions` query from the `rip actions` flags: your account by default, or one team or account. */
export function actionsQuery(options: ActionsOptions): string {
  const params = [
    ...(options.team ? [`team=${encodeURIComponent(resolveTeam(options.team))}`] : []),
    ...(options.account ? [`account=${encodeURIComponent(options.account)}`] : []),
  ];
  return `/v0/actions${params.length ? `?${params.join('&')}` : ''}`;
}

/** Show this month's actions for your account (or a team) against its plan, and where they went. */
export async function actions(options: ActionsOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(actionsQuery(options));
  outputSuccess(data.data, formatActionsUsage);
}
