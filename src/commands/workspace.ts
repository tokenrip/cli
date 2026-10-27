import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTrashed, formatWorkspace, formatWorkspaceList, formatWorkspaceChanges, formatWorkspaceLoad, formatWorkspaceSessions, formatWorkspaceViewReceipt } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';
import { CliError } from '../errors.js';
import { parseArtifactId } from '../parse-artifact-id.js';

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

/** `name` defaults to the slug on the server; `team` (slug or id) makes it a team workspace. */
export async function workspaceCreate(slug: string, options: { name?: string; description?: string; team?: string } & WhyOption): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/workspaces', { slug, name: options.name, description: options.description, team: options.team, why: options.why });
  outputSuccess(data.data, formatWorkspace);
}
export async function workspaceList(): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get('/v0/workspaces'); outputSuccess(data.data, formatWorkspaceList); }
export async function workspaceShow(workspace: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(workspacePath(workspace)); outputSuccess(data.data, formatWorkspace); }
export async function workspaceUpdate(workspace: string, options: { name?: string; description?: string | null } & WhyOption): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.patch(workspacePath(workspace), { name: options.name, description: options.description, why: options.why }); outputSuccess(data.data, formatWorkspace); }
export async function workspaceDelete(workspace: string, options: WhyOption = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.delete(workspacePath(workspace), deleteBody(options)); outputSuccess(data.data, formatTrashed); }

/**
 * Both values pass the CLI: the server refuses `internal` with INTERNAL_NEEDS_TEAM and the path
 * (internal access comes from owning the workspace or being in its team). The flag goes with the
 * API field, at the end of the deprecation window.
 */
const WORKSPACE_MEMBERSHIPS = ['internal', 'external'] as const;
/** `--membership`: checked before any request. Omitted, nothing is sent: every stored member is a guest. */
function parseMembership(value: string | undefined): string | undefined {
  if (value === undefined || (WORKSPACE_MEMBERSHIPS as readonly string[]).includes(value)) return value;
  throw new CliError('INVALID_ARGUMENT', `--membership must be ${WORKSPACE_MEMBERSHIPS.join(' or ')}`);
}
/** Add or invite by email, alias or account id. `note` goes in the invite email. */
export async function workspaceMemberAdd(workspace: string, member: string, options: { role?: string; membership?: string; note?: string } & WhyOption): Promise<void> { const membership = parseMembership(options.membership); const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/members`, { member, role: options.role, membership, note: options.note, why: options.why }); outputSuccess(data.data); }
/** A member row id stands alone; an account id, alias or email names a member in `--workspace-id`. */
interface MemberTarget { workspaceId?: string }
const memberPath = (member: string) => `/v0/workspace-members/${encodeURIComponent(member)}`;
/** Change the role (a member stays a guest); `--membership external` changes nothing. */
export async function workspaceMemberSetRole(member: string, options: { role?: string; membership?: string } & MemberTarget & WhyOption = {}): Promise<void> {
  const membership = parseMembership(options.membership);
  if (options.role === undefined && membership === undefined) throw new CliError('INVALID_ARGUMENT', 'Pass --role, --membership, or both');
  const { client } = requireAuthClient();
  const { data } = await client.patch(memberPath(member), { workspaceId: options.workspaceId, role: options.role, membership, why: options.why });
  outputSuccess(data.data);
}
export async function workspaceMemberRemove(member: string, options: MemberTarget & WhyOption = {}): Promise<void> {
  const { client } = requireAuthClient();
  const body = { ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}), ...(options.why !== undefined ? { why: options.why } : {}) };
  await client.delete(memberPath(member), Object.keys(body).length ? { data: body } : undefined);
  outputSuccess({ ok: true });
}
export async function workspaceMemberList(workspace: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/members`); outputSuccess(data.data); }

/** Standalone artifacts (one or more, ids, aliases or URLs) or one personal folder (`--folder`, id or slug) move in. */
export async function workspaceAdopt(workspace: string, artifacts: string[], options: { folder?: string; audience?: 'internal' | 'shared'; destinationFolderId?: string } & WhyOption): Promise<void> {
  if ((artifacts.length === 0) === (options.folder === undefined)) throw new CliError('INVALID_ARGUMENT', 'Name the artifacts to move in, or --folder, one of them');
  if (options.folder !== undefined && options.destinationFolderId !== undefined) throw new CliError('INVALID_ARGUMENT', '--destination-folder-id goes with artifacts; a folder moves in as it is');
  const { client } = requireAuthClient();
  const { data } = await client.post(`${workspacePath(workspace)}/adopt`, {
    ...(options.folder !== undefined ? { folder: options.folder } : { artifactIds: artifacts.map(parseArtifactId) }),
    audience: options.audience, destinationFolderId: options.destinationFolderId, why: options.why,
  });
  outputSuccess(data.data);
}
/** The pin's workspace is the artifact's (`POST /v0/pins`). */
export async function workspacePin(artifact: string, options: { position?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post('/v0/pins', { artifactId: parseArtifactId(artifact), ...(options.position === undefined ? {} : { position: parseNonNegativeInteger(options.position, '--position') }) }); outputSuccess(data.data); }
export async function workspaceUnpin(artifact: string): Promise<void> { const { client } = requireAuthClient(); await client.delete(`/v0/pins/${encodeURIComponent(parseArtifactId(artifact))}`); outputSuccess({ ok: true }); }
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
/** The browser tab paired to this agent's key in the workspace. */
export async function workspaceViewContext(workspace: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`${workspacePath(workspace)}/view`);
  outputSuccess(data.data, formatWorkspaceViewReceipt);
}
/**
 * Ask the tab paired to this agent's key in the artifact's workspace to open it (`POST /v0/views/open`).
 * `--operation-id` is an optional idempotency key: without one the server makes one.
 */
export async function workspaceViewOpen(artifact: string, options: { expectedContextGeneration: string; operationId?: string }): Promise<void> {
  const generation = parseNonNegativeInteger(options.expectedContextGeneration, '--expected-context-generation');
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/views/open', { artifactId: parseArtifactId(artifact), expectedContextGeneration: generation, ...(options.operationId !== undefined ? { operationId: options.operationId } : {}) });
  outputSuccess(data.data, formatWorkspaceViewReceipt);
}
/** Recent computed sessions (`GET /v0/workspaces/:id/sessions`), newest first; `--cursor` continues. */
export async function workspaceSessions(workspace: string, options: { cursor?: string } = {}): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.get(`${workspacePath(workspace)}/sessions`, { params: options.cursor ? { cursor: options.cursor } : {} }); outputSuccess(data.data, page => formatWorkspaceSessions(page, workspace)); }
export async function workspaceChanges(workspace: string, options: { limit?: string; deliveryToken?: string }): Promise<void> { const { client } = requireAuthClient(); const params = new URLSearchParams(); if (options.limit) params.set('limit', options.limit); if (options.deliveryToken) params.set('deliveryToken', options.deliveryToken); const { data } = await client.get(`${workspacePath(workspace)}/changes${params.size ? `?${params}` : ''}`); outputSuccess(data.data, formatWorkspaceChanges); }
export async function workspaceChangesAck(workspace: string, deliveryToken: string): Promise<void> { const { client } = requireAuthClient(); const { data } = await client.post(`${workspacePath(workspace)}/changes/ack`, { deliveryToken }); outputSuccess(data.data); }
