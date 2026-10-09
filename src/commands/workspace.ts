import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTrashed, formatWorkspace, formatWorkspaceList, formatWorkspaceChanges, formatWorkspaceLoad, formatWorkspaceSessions, formatWorkspaceViewReceipt } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';

export interface WorkspaceSummary {
  id: string; slug: string; name: string; description: string | null;
  ownerAccountId: string | null; teamId: string | null;
  role: string; membership: string; audiences: Array<'internal' | 'shared'>;
  mutationSequence: number; accessGeneration: number;
}

function ref(workspace: string): string { return encodeURIComponent(workspace); }
const workspacePath = (workspace: string) => `/v0/workspaces/${ref(workspace)}`;

/** `why`: one sentence on the person's goal, recorded on workspace writes (`--why` / `TOKENRIP_WHY`). */
interface WhyOption { why?: string }
/** A DELETE states why in its body, and sends no body when there is none. */
const deleteBody = (options: WhyOption) => (options.why !== undefined ? { data: { why: options.why } } : undefined);

export async function workspaceCreate(slug: string, options: { name?: string; description?: string; teamId?: string } & WhyOption): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/workspaces', { slug, name: options.name ?? slug, description: options.description, teamId: options.teamId, why: options.why });
  outputSuccess(data.data, formatWorkspace);
}
export async function workspaceList(): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get('/v0/workspaces'); outputSuccess(data.data, formatWorkspaceList); }
export async function workspaceShow(workspace: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(workspacePath(workspace)); outputSuccess(data.data, formatWorkspace); }
export async function workspaceUpdate(workspace: string, options: { name?: string; description?: string | null } & WhyOption): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.patch(workspacePath(workspace), { name: options.name, description: options.description, why: options.why }); outputSuccess(data.data, formatWorkspace); }
export async function workspaceDelete(workspace: string, options: WhyOption = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.delete(workspacePath(workspace), deleteBody(options)); outputSuccess(data.data, formatTrashed); }

export async function workspaceMemberAdd(workspace: string, account: string, options: { role?: string } & WhyOption): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/members`, { account, role: options.role, why: options.why }); outputSuccess(data.data); }
export async function workspaceMemberSetRole(workspace: string, accountId: string, role: string, options: WhyOption = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.patch(`${workspacePath(workspace)}/members/${encodeURIComponent(accountId)}`, { role, why: options.why }); outputSuccess(data.data); }
export async function workspaceMemberRemove(workspace: string, account: string, options: WhyOption = {}): Promise<void> { const { client } = requireAuthClient(); await client.delete(`${workspacePath(workspace)}/members/${encodeURIComponent(account)}`, deleteBody(options)); outputSuccess({ ok: true }); }
export async function workspaceMemberList(workspace: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/members`); outputSuccess(data.data); }

export async function workspaceAdopt(workspace: string, item: string, options: { kind?: 'artifact' | 'folder'; audience: 'internal' | 'shared'; destinationFolderId?: string } & WhyOption): Promise<void> { const { client } = requireAuthClient(); const kind = options.kind ?? 'artifact'; const { data } = await client.post(`${workspacePath(workspace)}/adopt`, { kind, ...(kind === 'artifact' ? { artifactId: item } : { folderId: item }), audience: options.audience, destinationFolderId: options.destinationFolderId, why: options.why }); outputSuccess(data.data); }
export async function workspacePin(workspace: string, artifactId: string, options: { position?: string }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/pins`, { artifactId, ...(options.position === undefined ? {} : { position: parseNonNegativeInteger(options.position, '--position') }) }); outputSuccess(data.data); }
export async function workspaceUnpin(workspace: string, artifactId: string): Promise<void> { const { client } = requireAuthClient(); await client.delete(`${workspacePath(workspace)}/pins/${encodeURIComponent(artifactId)}`); outputSuccess({ ok: true }); }
/** Bounded workspace context. Load takes no selector: sessions record themselves. */
export async function workspaceLoad(workspace: string, options: { artifactOffset?: string; taskCursor?: string; activityCursor?: string; handoffOffset?: string }): Promise<void> {
  const body = {
    ...(options.artifactOffset !== undefined ? { artifactOffset: parseNonNegativeInteger(options.artifactOffset, '--artifact-offset') } : {}),
    ...(options.taskCursor ? { taskCursor: options.taskCursor } : {}),
    ...(options.activityCursor ? { activityCursor: options.activityCursor } : {}),
    ...(options.handoffOffset !== undefined ? { handoffOffset: parseNonNegativeInteger(options.handoffOffset, '--handoff-offset') } : {}),
  };
  const { client } = requireAuthClient();
  const { data } = await client.post(`${workspacePath(workspace)}/load`, body);
  outputSuccess(data.data, formatWorkspaceLoad);
}
export async function workspaceSessionEnd(workspace: string, sessionId: string, options: { summary?: string; handoffArtifactId?: string }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/sessions/${encodeURIComponent(sessionId)}/end`, options); outputSuccess(data.data); }
/**
 * Printed once when an old invocation still passes a retired session flag (plan D7): `workspace load
 * --operation-id / --session-id`, `workspace show --session-cursor`, and every writer's
 * `--workspace-session-id`. The flags are hidden from help and nothing of them is sent.
 */
export function retiredFlagsNotice(flags: readonly string[]): string {
  return `Note: ${flags.join(' and ')} ${flags.length === 1 ? 'is' : 'are'} deprecated and ignored: sessions record themselves.`;
}
/** Printed once when an old invocation still passes a session id (plan D7): the view follows the caller's key. */
export const IGNORED_VIEW_SESSION_NOTICE = 'Note: the session id is deprecated and ignored; the browser view follows your agent key.';

/** The browser tab paired to this agent's key in the workspace. A leftover session id is ignored with one notice. */
export async function workspaceViewContext(workspace: string, legacySessionId?: string): Promise<void> {
  if (legacySessionId !== undefined) console.error(IGNORED_VIEW_SESSION_NOTICE);
  const { client } = requireAuthClient();
  const { data } = await client.get(`${workspacePath(workspace)}/view`);
  outputSuccess(data.data, formatWorkspaceViewReceipt);
}
/** Ask the tab paired to this agent's key to open an artifact. A leftover session id is ignored with one notice. */
export async function workspaceViewOpen(workspace: string, artifactId: string, operationId: string, expectedContextGeneration: string, legacySessionId?: string): Promise<void> {
  const generation = parseNonNegativeInteger(expectedContextGeneration, '--expected-context-generation');
  if (legacySessionId !== undefined) console.error(IGNORED_VIEW_SESSION_NOTICE);
  const { client } = requireAuthClient();
  const { data } = await client.post(`${workspacePath(workspace)}/view/open`, { artifactId, operationId, expectedContextGeneration: generation });
  outputSuccess(data.data, formatWorkspaceViewReceipt);
}
/** Recent computed sessions (`GET /v0/workspaces/:id/sessions`), newest first; `--cursor` continues. */
export async function workspaceSessions(workspace: string, options: { cursor?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/sessions`, { params: options.cursor ? { cursor: options.cursor } : {} }); outputSuccess(data.data, page => formatWorkspaceSessions(page, workspace)); }
export async function workspaceChanges(workspace: string, options: { limit?: string; deliveryToken?: string }): Promise<void> { const { client } = requireAuthClient(); const params = new URLSearchParams(); if (options.limit) params.set('limit', options.limit); if (options.deliveryToken) params.set('deliveryToken', options.deliveryToken); const { data } = await client.get(`${workspacePath(workspace)}/changes${params.size ? `?${params}` : ''}`); outputSuccess(data.data, formatWorkspaceChanges); }
export async function workspaceChangesAck(workspace: string, deliveryToken: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/changes/ack`, { deliveryToken }); outputSuccess(data.data); }
