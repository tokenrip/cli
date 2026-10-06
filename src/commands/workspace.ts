import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatWorkspace, formatWorkspaceShow, formatWorkspaceList, formatWorkspaceChanges, formatWorkspaceLoad, formatWorkspaceViewReceipt } from '../formatters.js';
import { CliError } from '../errors.js';
import { parseNonNegativeInteger } from '../input.js';

export interface WorkspaceSummary {
  id: string; slug: string; name: string; description: string | null;
  ownerAccountId: string | null; teamId: string | null; archivedAt: string | null;
  role: string; membership: string; audiences: Array<'internal' | 'shared'>;
  mutationSequence: number; accessGeneration: number;
}

function ref(workspace: string): string { return encodeURIComponent(workspace); }
const workspacePath = (workspace: string) => `/v0/workspaces/${ref(workspace)}`;

export async function workspaceCreate(slug: string, options: { name?: string; description?: string; teamId?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/workspaces', { slug, name: options.name ?? slug, description: options.description, teamId: options.teamId });
  outputSuccess(data.data, formatWorkspace);
}
export async function workspaceList(): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get('/v0/workspaces'); outputSuccess(data.data, formatWorkspaceList); }
export async function workspaceShow(workspace: string, options: { sessionCursor?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(workspacePath(workspace), { params: options }); outputSuccess(data.data, formatWorkspaceShow); }
export async function workspaceUpdate(workspace: string, options: { name?: string; description?: string | null }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.patch(workspacePath(workspace), options); outputSuccess(data.data, formatWorkspace); }
export async function workspaceDelete(workspace: string): Promise<void> { const { client } = requireAuthClient(); await client.delete(workspacePath(workspace)); outputSuccess({ ok: true }); }
export async function workspaceArchive(workspace: string, options: { workspaceSessionId?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/archive`, options); outputSuccess(data.data, formatWorkspace); }
export async function workspaceRestore(workspace: string, options: { workspaceSessionId?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/restore`, options); outputSuccess(data.data, formatWorkspace); }

export async function workspaceMemberAdd(workspace: string, account: string, options: { role?: string }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/members`, { account, role: options.role }); outputSuccess(data.data); }
export async function workspaceMemberSetRole(workspace: string, accountId: string, role: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.patch(`${workspacePath(workspace)}/members/${encodeURIComponent(accountId)}`, { role }); outputSuccess(data.data); }
export async function workspaceMemberRemove(workspace: string, account: string): Promise<void> { const { client } = requireAuthClient(); await client.delete(`${workspacePath(workspace)}/members/${encodeURIComponent(account)}`); outputSuccess({ ok: true }); }
export async function workspaceMemberList(workspace: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/members`); outputSuccess(data.data); }

export async function workspaceAdopt(workspace: string, item: string, options: { kind?: 'artifact' | 'folder'; audience: 'internal' | 'shared'; destinationFolderId?: string; workspaceSessionId?: string }): Promise<void> { const { client } = requireAuthClient(); const kind = options.kind ?? 'artifact'; const { data } = await client.post(`${workspacePath(workspace)}/adopt`, { kind, ...(kind === 'artifact' ? { artifactId: item } : { folderId: item }), audience: options.audience, destinationFolderId: options.destinationFolderId, workspaceSessionId: options.workspaceSessionId }); outputSuccess(data.data); }
export async function workspacePin(workspace: string, artifactId: string, options: { position?: string }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/pins`, { artifactId, ...(options.position === undefined ? {} : { position: parseNonNegativeInteger(options.position, '--position') }) }); outputSuccess(data.data); }
export async function workspaceUnpin(workspace: string, artifactId: string): Promise<void> { const { client } = requireAuthClient(); await client.delete(`${workspacePath(workspace)}/pins/${encodeURIComponent(artifactId)}`); outputSuccess({ ok: true }); }
export type WorkspaceLoadSelector = { operationId: string; sessionId?: never } | { sessionId: string; operationId?: never };
export async function workspaceLoad(workspace: string, selector: WorkspaceLoadSelector | string, options: { artifactOffset?: string; taskCursor?: string; activityCursor?: string; handoffOffset?: string }): Promise<void> {
  const selection = typeof selector === 'string' ? { operationId: selector } : selector;
  if (!selection || (selection.operationId !== undefined) === (selection.sessionId !== undefined)) throw new CliError('INVALID_ARGUMENT', 'Supply exactly one --operation-id or --session-id.');
  if (selection.operationId !== undefined && (typeof selection.operationId !== 'string' || selection.operationId.length < 1 || selection.operationId.length > 255)) throw new CliError('INVALID_ARGUMENT', '--operation-id must contain 1 to 255 characters.');
  if (selection.sessionId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selection.sessionId)) throw new CliError('INVALID_ARGUMENT', '--session-id must be a UUID.');
  const { client } = requireAuthClient();
  const { data } = await client.post(`${workspacePath(workspace)}/load`, { ...selection,
    ...(options.artifactOffset !== undefined ? { artifactOffset: parseNonNegativeInteger(options.artifactOffset, '--artifact-offset') } : {}),
    ...(options.taskCursor ? { taskCursor: options.taskCursor } : {}),
    ...(options.activityCursor ? { activityCursor: options.activityCursor } : {}),
    ...(options.handoffOffset !== undefined ? { handoffOffset: parseNonNegativeInteger(options.handoffOffset, '--handoff-offset') } : {}),
  });
  outputSuccess(data.data, receipt => formatWorkspaceLoad(receipt, selection));
}
export async function workspaceSessionEnd(workspace: string, sessionId: string, options: { summary?: string; handoffArtifactId?: string }): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/sessions/${encodeURIComponent(sessionId)}/end`, options); outputSuccess(data.data); }
export async function workspaceViewContext(workspace: string, sessionId: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/sessions/${encodeURIComponent(sessionId)}/view`); outputSuccess(data.data, formatWorkspaceViewReceipt); }
export async function workspaceViewOpen(workspace: string, sessionId: string, artifactId: string, operationId: string, expectedContextGeneration: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/sessions/${encodeURIComponent(sessionId)}/view/open`, { artifactId, operationId, expectedContextGeneration: parseNonNegativeInteger(expectedContextGeneration, '--expected-context-generation') }); outputSuccess(data.data, formatWorkspaceViewReceipt); }
export async function workspaceChanges(workspace: string, options: { limit?: string; deliveryToken?: string }): Promise<void> { const { client } = requireAuthClient(); const params = new URLSearchParams(); if (options.limit) params.set('limit', options.limit); if (options.deliveryToken) params.set('deliveryToken', options.deliveryToken); const { data } = await client.get(`${workspacePath(workspace)}/changes${params.size ? `?${params}` : ''}`); outputSuccess(data.data, formatWorkspaceChanges); }
export async function workspaceChangesAck(workspace: string, deliveryToken: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/changes/ack`, { deliveryToken }); outputSuccess(data.data); }
