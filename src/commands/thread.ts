import { requireAuthClient } from '../auth-client.js';
import { loadIdentity } from '../identity.js';
import { createCapabilityToken } from '../crypto.js';
import { getFrontendUrl } from '../config.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatThreadCreated, formatShareLink } from '../formatters.js';
import { resolveRecipients } from '../contacts.js';
import { parseDuration } from './share.js';

export async function threadCreate(options: {
  participants?: string;
  message?: string;
}): Promise<void> {
  const { client } = requireAuthClient();

  const payload: Record<string, unknown> = {};

  if (options.participants) {
    payload.participants = resolveRecipients(
      options.participants.split(',').map((p) => p.trim()),
    );
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
    throw new CliError('NO_IDENTITY', 'No agent identity found. Run `tokenrip auth register` first.');
  }

  const perm = ['comment'];
  const exp = options.expires ? parseDuration(options.expires) : undefined;
  const aud = options.for || undefined;

  const token = createCapabilityToken(
    { sub: `thread:${threadId}`, iss: identity.agentId, perm, exp, aud },
    identity.secretKey,
  );

  const frontendUrl = getFrontendUrl();
  const url = `${frontendUrl}/threads/${threadId}?cap=${encodeURIComponent(token)}`;

  outputSuccess({ url, token, threadId, perm, exp: exp ?? null, aud: aud ?? null }, formatShareLink);
}
