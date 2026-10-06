import { loadConfig, saveConfig, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatSignInRequested, formatSignedIn } from '../formatters.js';
import { accountIdToPublicKey } from '../crypto.js';
import { addIdentity, loadIdentities, resolveAccountId } from '../identities.js';

/** What happened to the key a repeat sign-in replaced on this machine (and its id when it is still live). */
type PreviousKey = { status: 'revoked' | 'already_invalid' | 'not_revoked'; id?: string };

/**
 * `rip auth login` — sign in with the person's email. Without `code`, Tokenrip emails a six-digit
 * code; with it (emailed, or issued by a connected agent or the dashboard), the CLI gets a key of
 * its own on the person's account, stores it as a keypair-less identity, and makes that identity
 * current. Signing in never disturbs another agent's key. Signing in again on an account this
 * machine already holds revokes the key it replaces, best-effort.
 */
export async function authLogin(options: { email: string; code?: string; name?: string }): Promise<void> {
  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl });
  const email = options.email.trim();

  if (options.code === undefined) {
    await client.post('/v0/auth/sign-in/request', { email });
    outputSuccess({ sent: true, email, next: `rip auth login --email ${email} --code <code>` }, formatSignInRequested);
    return;
  }

  const name = options.name ?? (process.env.CLAUDECODE ? 'Claude Code' : 'CLI');
  const { data } = await client.post('/v0/auth/sign-in', { email, code: options.code, name });
  const signedIn = data.data as { api_key: string; account_id: string; email: string; outcome: string };
  if (!signedIn?.api_key || !signedIn.account_id) {
    throw new CliError('SIGN_IN_INVALID_RESPONSE', 'Unexpected sign-in response from the server.');
  }

  // An account already stored here keeps its local fields (a keypair, an alias); only the key changes.
  const existing = loadIdentities()[signedIn.account_id];
  addIdentity({
    ...existing,
    accountId: signedIn.account_id,
    publicKey: existing?.publicKey ?? accountIdToPublicKey(signedIn.account_id),
    secretKey: existing?.secretKey ?? '',
    apiKey: signedIn.api_key,
  });
  config.currentAccount = signedIn.account_id;
  saveConfig(config);

  const previousKey = existing?.apiKey && existing.apiKey !== signedIn.api_key
    ? await retireKey(apiUrl, existing.apiKey)
    : undefined;
  const overriddenBy = envOverride(signedIn.account_id);

  outputSuccess(
    {
      account_id: signedIn.account_id,
      email: signedIn.email,
      outcome: signedIn.outcome,
      name,
      ...(previousKey ? { previous_key: previousKey.status } : {}),
      ...(previousKey?.id ? { previous_key_id: previousKey.id } : {}),
      ...(overriddenBy ? { overridden_by: overriddenBy } : {}),
    },
    formatSignedIn,
  );
}

/**
 * The environment variable that will keep later commands off this sign-in: TOKENRIP_API_KEY wins
 * over every stored identity; TOKENRIP_AGENT does unless it names the account just signed in.
 */
function envOverride(accountId: string): 'TOKENRIP_API_KEY' | 'TOKENRIP_AGENT' | undefined {
  if (process.env.TOKENRIP_API_KEY) return 'TOKENRIP_API_KEY';
  const agent = process.env.TOKENRIP_AGENT;
  if (agent && resolveAccountId(loadIdentities(), agent) !== accountId) return 'TOKENRIP_AGENT';
  return undefined;
}

/** Revoke the key this machine held before, using that key: find it (`current`) and delete it. */
async function retireKey(apiUrl: string, oldKey: string): Promise<PreviousKey> {
  const client = createHttpClient({ baseUrl: apiUrl, apiKey: oldKey });
  let id: string | undefined;
  try {
    const { data } = await client.get('/v0/auth/keys');
    id = (data.data.keys as Array<{ id: string; current: boolean }>).find((k) => k.current)?.id;
    if (!id) return { status: 'not_revoked' };
    await client.delete(`/v0/auth/keys/${id}`);
    return { status: 'revoked' };
  } catch (error) {
    if (error instanceof CliError && error.code === 'UNAUTHORIZED') return { status: 'already_invalid' };
    return { status: 'not_revoked', id };
  }
}
