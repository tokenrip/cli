import { loadConfig, saveConfig, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import {
  loadIdentities,
  saveIdentities,
  type StoredIdentity,
} from '../identities.js';
import { accountIdToPublicKey } from '../crypto.js';

/**
 * Alphabet used by the operator dashboard when minting connection codes
 * (`apps/backend/src/api/service/operator-connection-code.service.ts`).
 * Skips visually-confusable characters (0, O, 1, I, L).
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/**
 * Normalize a user-pasted code: uppercase, strip whitespace and hyphens.
 * Validates length and alphabet before any network call so the agent gets
 * an immediate, local error for typos / paste mishaps.
 */
function normalizeCode(raw: string): string {
  const cleaned = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (cleaned.length !== CODE_LENGTH) {
    throw new CliError(
      'INVALID_CODE',
      `Connection codes are ${CODE_LENGTH} characters (formatted XXXX-XXXX). Got ${cleaned.length || 0}.`,
    );
  }
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) {
      throw new CliError(
        'INVALID_CODE',
        `Connection code contains invalid character "${ch}". Use the code your operator gave you, formatted XXXX-XXXX.`,
      );
    }
  }
  return cleaned;
}

export async function authClaim(
  rawCode: string,
  options: { label?: string } = {},
): Promise<void> {
  const code = normalizeCode(rawCode);

  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl });

  // POST returns { ok: true, data: { agent_id, api_key, api_url } }. Friendly
  // mapping of the server's INVALID_CODE (covers expired / used / unknown —
  // the service returns a single 401 in all three cases) so agents can act
  // on the failure without parsing the message.
  let response: { data: { data: { agent_id?: string; api_key?: string; api_url?: string } } };
  try {
    response = await client.post('/v0/auth/connection-code/claim', {
      code,
      ...(options.label ? { label: options.label } : {}),
    });
  } catch (err) {
    if (err instanceof CliError && err.code === 'INVALID_CODE') {
      throw new CliError(
        'INVALID_CODE',
        'This connection code is invalid, expired, or already used. Ask your operator to generate a new one from the dashboard.',
      );
    }
    if (err instanceof CliError && err.code === 'MISSING_CODE') {
      throw new CliError('INVALID_CODE', 'Connection code is required.');
    }
    throw err;
  }

  const { agent_id: agentId, api_key: apiKey } = response.data.data;
  if (!agentId || typeof agentId !== 'string' || !apiKey || typeof apiKey !== 'string') {
    throw new CliError(
      'CLAIM_INVALID_RESPONSE',
      `Unexpected /v0/auth/connection-code/claim response: ${JSON.stringify(response.data)}`,
    );
  }

  // publicKey is recoverable from the bech32 accountId. secretKey is empty —
  // this identity was minted server-side, the same as `rip auth login` does
  // for OAuth-bound agents (`apps/cli/src/commands/auth-login.ts`).
  const publicKey = accountIdToPublicKey(agentId);

  const store = loadIdentities();
  const identity: StoredIdentity = {
    accountId: agentId,
    publicKey,
    secretKey: '',
    apiKey,
  };
  store[agentId] = identity;
  saveIdentities(store);

  // Match `rip account create`: switch to this identity if it's the only one
  // or no account is currently selected.
  if (Object.keys(store).length === 1 || !config.currentAccount) {
    config.currentAccount = agentId;
    saveConfig(config);
  }

  outputSuccess(
    { agent_id: agentId, api_key: apiKey, api_url: response.data.data.api_url ?? apiUrl },
    () => `Connected as ${agentId} — run \`rip auth whoami\` to confirm.`,
  );
}
