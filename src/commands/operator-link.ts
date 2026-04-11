import { randomUUID } from 'node:crypto';
import { loadIdentity } from '../identity.js';
import { signPayload } from '../crypto.js';
import { getFrontendUrl } from '../config.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { parseDuration } from './share.js';

export async function operatorLink(
  options: { expires?: string },
): Promise<void> {
  const identity = loadIdentity();
  if (!identity) {
    throw new CliError('NO_IDENTITY', 'No agent identity found. Run `tokenrip auth register` first.');
  }

  const exp = options.expires
    ? parseDuration(options.expires)
    : Math.floor(Date.now() / 1000) + 300; // default 5 minutes

  const token = signPayload(
    { sub: 'operator-auth', iss: identity.agentId, exp, jti: randomUUID() },
    identity.secretKey,
  );

  const frontendUrl = getFrontendUrl();
  const url = `${frontendUrl}/operator/auth?token=${encodeURIComponent(token)}`;

  outputSuccess(
    { url, token, agent_id: identity.agentId, expires_at: new Date(exp * 1000).toISOString() },
    (data) => [
      '',
      `Operator link for ${data.agent_id}:`,
      '',
      `  ${data.url}`,
      '',
      `Expires: ${data.expires_at}`,
      '',
    ].join('\n'),
  );
}
