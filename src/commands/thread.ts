import { requireAuthClient } from '../auth-client.js';
import { loadIdentity } from '../identity.js';
import { createCapabilityToken } from '../crypto.js';
import { getFrontendUrl, loadConfig } from '../config.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatThreadCreated, formatThreadList, formatShareLink, formatThreadDetails, formatThreadClosed, formatParticipantAdded, formatRefsAdded, formatRefRemoved } from '../formatters.js';
import { resolveRecipient, resolveRecipients } from '../contacts.js';
import { parseDuration } from './share.js';
import { parseRefList } from '../refs.js';

export async function threadList(options: {
  state?: string;
  limit?: string;
}): Promise<void> {
  const { client } = requireAuthClient();

  const params: Record<string, string> = {};
  if (options.state) params.state = options.state;
  if (options.limit) params.limit = options.limit;

  const { data } = await client.get('/v0/threads', { params });
  outputSuccess(data.data, formatThreadList);
}

export async function threadCreate(options: {
  participants?: string;
  message?: string;
  refs?: string;
}): Promise<void> {
  const { client } = requireAuthClient();

  const payload: Record<string, unknown> = {};

  if (options.participants) {
    payload.participants = resolveRecipients(
      options.participants.split(',').map((p) => p.trim()),
    );
  }

  if (options.refs) {
    payload.refs = parseRefList(options.refs);
  }

  if (options.message) {
    payload.message = { body: options.message };
  }

  const { data } = await client.post('/v0/threads', payload);
  outputSuccess(data.data, formatThreadCreated);
}

export async function threadShare(
  threadId: string,
  options: { expires?: string; for?: string },
): Promise<void> {
  const identity = loadIdentity();
  if (!identity) {
    throw new CliError('NO_IDENTITY', 'No agent identity found. Run `rip auth register` first.');
  }

  const perm = ['comment'];
  const exp = options.expires ? parseDuration(options.expires) : undefined;
  const aud = options.for || undefined;

  const token = createCapabilityToken(
    { sub: `thread:${threadId}`, iss: identity.agentId, perm, exp, aud },
    identity.secretKey,
  );

  const frontendUrl = getFrontendUrl(loadConfig());
  const url = `${frontendUrl}/threads/${threadId}?cap=${encodeURIComponent(token)}`;

  outputSuccess({ url, token, threadId, perm, exp: exp ?? null, aud: aud ?? null }, formatShareLink);
}

export async function threadGet(threadId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/threads/${threadId}`);
  outputSuccess(data.data, formatThreadDetails);
}

export async function threadClose(
  threadId: string,
  options: { resolution?: string },
): Promise<void> {
  const { client } = requireAuthClient();

  const resolution: Record<string, unknown> = { closed: true };
  if (options.resolution) resolution.message = options.resolution;

  const { data } = await client.patch(`/v0/threads/${threadId}`, { state: 'closed', resolution });
  outputSuccess(data.data, formatThreadClosed);
}

export async function threadAddParticipant(
  threadId: string,
  agent: string,
): Promise<void> {
  const { client } = requireAuthClient();
  const agentId = resolveRecipient(agent);
  const { data } = await client.post(`/v0/threads/${threadId}/participants`, { agent_id: agentId });
  outputSuccess(data.data, formatParticipantAdded);
}

export async function threadAddRefs(
  threadId: string,
  refs: string,
): Promise<void> {
  const { client } = requireAuthClient();
  const refList = parseRefList(refs);
  const { data } = await client.post(`/v0/threads/${threadId}/refs`, { refs: refList });
  outputSuccess(data.data, formatRefsAdded);
}

export async function threadRemoveRef(
  threadId: string,
  refId: string,
): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`/v0/threads/${threadId}/refs/${refId}`);
  outputSuccess({ thread_id: threadId, ref_id: refId }, formatRefRemoved);
}
