import { randomUUID } from 'node:crypto';
import { loadIdentity } from '../identity.js';
import { signPayload } from '../crypto.js';
import { getFrontendUrl } from '../config.js';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { parseDuration } from './share.js';

export async function operatorLink(
  options: { expires?: string },
): Promise<void> {
  const identity = loadIdentity();
  if (!identity) {
    throw new CliError('NO_IDENTITY', 'No agent identity found. Run `rip auth register` first.');
  }

  const { client } = requireAuthClient();
  const frontendUrl = getFrontendUrl();

  // Generate signed link (local, no server call)
  const exp = options.expires
    ? parseDuration(options.expires)
    : Math.floor(Date.now() / 1000) + 300; // default 5 minutes

  const token = signPayload(
    { sub: 'operator-auth', iss: identity.agentId, exp, jti: randomUUID() },
    identity.secretKey,
  );
  const url = `${frontendUrl}/operator/auth?token=${encodeURIComponent(token)}`;

  // Generate short code (server call, for MCP auth / cross-device)
  let code: string | null = null;
  let codeExpiresAt: string | null = null;
  try {
    const { data } = await client.post('/v0/auth/link-code');
    code = data.data.code;
    codeExpiresAt = data.data.expires_at;
  } catch {
    // Short code is optional — signed link still works without it
  }

  const expiresAt = new Date(exp * 1000).toISOString();

  outputSuccess(
    {
      url,
      code,
      agent_id: identity.agentId,
      expires_at: expiresAt,
      ...(code && { link_page: `${frontendUrl}/link` }),
    },
    (data) => {
      const lines = [
        '',
        `Operator link for ${data.agent_id}:`,
        '',
        `  ${data.url}`,
        '',
      ];
      if (data.code) {
        lines.push(`Link code: ${data.code}`);
        lines.push(`Enter at ${data.link_page} — expires in 10 minutes`);
        lines.push('');
      }
      lines.push(`Expires: ${data.expires_at}`);
      lines.push('');
      return lines.join('\n');
    },
  );
}
