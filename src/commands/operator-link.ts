import { randomUUID } from 'node:crypto';
import { requireLocalKeypair, resolveCurrentIdentity } from '../identities.js';
import { signPayload } from '../crypto.js';
import { getFrontendUrl } from '../config.js';
import { requireAuthClient } from '../auth-client.js';
import { toCliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { createHttpClient } from '../client.js';
import { parseDuration } from '../input.js';

export interface OperatorLinkIssue {
  code: string;
  message: string;
}

export async function operatorLink(
  options: { expires?: string },
): Promise<void> {
  const identity = resolveCurrentIdentity();
  // An identity that signed in by email is already on the person's account: nothing to link.
  requireLocalKeypair(identity, 'It is already on the account of the person whose email signed it in.');

  const auth = requireAuthClient();
  const client = auth.client;
  const frontendUrl = getFrontendUrl(auth.config);

  // Generate signed link (local, no server call)
  const exp = options.expires
    ? parseDuration(options.expires)
    : Math.floor(Date.now() / 1000) + 300; // default 5 minutes

  const token = signPayload(
    { sub: 'operator-auth', iss: identity.accountId, exp, jti: randomUUID() },
    identity.secretKey,
  );
  const url = `${frontendUrl}/operator/auth?token=${encodeURIComponent(token)}`;

  // Generate short code for explicit linking from another browser.
  let code: string | null = null;
  let codeError: OperatorLinkIssue | null = null;
  try {
    const { data } = await createLinkCode(client);
    code = data.data.code;
  } catch (error) {
    codeError = getErrorDetails(error);
  }

  const expiresAt = new Date(exp * 1000).toISOString();

  outputSuccess(
    {
      url,
      code,
      code_error: codeError,
      agent_id: identity.accountId,
      expires_at: expiresAt,
      ...(code && { link_page: `${frontendUrl}/operator/agents` }),
    },
    (data) => {
      const codeError = data.code_error as OperatorLinkIssue | null | undefined;
      const lines = [
        '',
        `Link agent ${data.agent_id} to your Tokenrip account:`,
        '',
        `  ${data.url}`,
        '',
      ];
      if (data.code) {
        lines.push(`Link code: ${data.code}`);
        lines.push(`Sign in, then enter at ${data.link_page} — expires in 10 minutes`);
        lines.push('');
      } else if (codeError?.message) {
        lines.push(`Link code unavailable: ${codeError.message}`);
        lines.push('');
      }
      lines.push(`Expires: ${data.expires_at}`);
      lines.push('');
      return lines.join('\n');
    },
  );
}

async function createLinkCode(client: ReturnType<typeof createHttpClient>) {
  return client.post('/v0/auth/link-code');
}

function getErrorDetails(error: unknown): OperatorLinkIssue {
  const cliError = toCliError(error);
  return {
    code: cliError.code || 'UNKNOWN_ERROR',
    message: cliError.message,
  };
}
