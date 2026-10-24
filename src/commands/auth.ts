import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAuthKey, formatLoggedOut, formatProfileUpdated, formatWhoami } from '../formatters.js';
import {
  resolveCurrentIdentity,
  loadIdentities,
  saveIdentities,
  removeIdentity,
  clearCurrentAccount,
} from '../identities.js';
import { loadConfig, getApiUrl } from '../config.js';
import { retireKey, RUN_KEY_PREFIX } from './auth-login.js';
import { requireAuthClient } from '../auth-client.js';
import { parseJsonObjectOption } from '../json.js';

/** `rip auth rotate-key` — replace this agent's key. Every other key on the account keeps working. */
export async function authRotateKey(): Promise<void> {
  // The new key would be saved to the stored identity while TOKENRIP_API_KEY keeps being used,
  // and the variable's key would be the one revoked.
  if (process.env.TOKENRIP_API_KEY) {
    throw new CliError(
      'ENV_KEY_ROTATION',
      "TOKENRIP_API_KEY is set. Rotate a stored identity's key by unsetting it; to replace a key kept in a host's vault, create a new one with `rip auth keys create --name <name>` and revoke the old one.",
    );
  }
  const { client } = requireAuthClient();
  const identity = resolveCurrentIdentity();

  const { data } = await client.post('/v0/accounts/rotate-key');
  const apiKey = data.data.api_key;

  const store = loadIdentities();
  if (store[identity.accountId]) {
    store[identity.accountId].apiKey = apiKey;
    saveIdentities(store);
  }

  outputSuccess({
    apiKey,
    message: "Replaced this agent's key; other agents are not affected. The new key is saved.",
  }, formatAuthKey);
}

/**
 * `rip auth logout` — end this CLI's sign-in: revoke its key, then forget it locally. The revoke is
 * best-effort (an already-invalid key or an unreachable server must not trap the key on this
 * machine), and the result says whether it happened so a live key is never left silently. An
 * email sign-in is removed outright, even the last one; a keypair identity keeps its secret key
 * (the account is unrecoverable without it) and only loses the API key, which
 * `rip account recover-key` can replace.
 */
export async function authLogout(options: { keepKey?: boolean } = {}): Promise<void> {
  if (process.env.TOKENRIP_API_KEY) {
    throw new CliError(
      'ENV_KEY_LOGOUT',
      "TOKENRIP_API_KEY is set, so there is no stored sign-in to end. Unset it; to disconnect a key kept in a host's vault, revoke it with `rip auth keys revoke <id>`.",
    );
  }
  const identity = resolveCurrentIdentity();
  const key = identity.apiKey;

  // A run key ends on its own and cannot revoke itself.
  let revoked: 'revoked' | 'already_invalid' | 'not_revoked' | 'skipped' = 'skipped';
  let keyId: string | undefined;
  if (key && !options.keepKey && !key.startsWith(RUN_KEY_PREFIX)) {
    const result = await retireKey(getApiUrl(loadConfig()), key);
    revoked = result.status;
    keyId = result.id;
  }

  const keypair = Boolean(identity.secretKey);
  if (keypair) {
    const store = loadIdentities();
    store[identity.accountId] = { ...store[identity.accountId], apiKey: '' };
    saveIdentities(store);
  } else {
    removeIdentity(identity.accountId, { allowLast: true });
  }
  clearCurrentAccount(identity.accountId);

  outputSuccess(
    { accountId: identity.accountId, revoked, removed: !keypair, ...(keyId ? { keyId } : {}) },
    formatLoggedOut,
  );
}

export async function authWhoami(): Promise<void> {
  const { client } = requireAuthClient();

  try {
    const { data } = await client.get('/v0/accounts/me');
    outputSuccess({
      agent_id: data.data.agent_id,
      alias: data.data.alias,
      tag: data.data.tag,
      description: data.data.description,
      website: data.data.website,
      email: data.data.email,
      is_public: data.data.is_public,
      registered_at: data.data.registered_at,
    }, formatWhoami);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('WHOAMI_FAILED', 'Failed to fetch agent profile.');
  }
}

export async function authUpdate(options: {
  alias?: string;
  metadata?: string;
  tag?: string;
  description?: string;
  website?: string;
  email?: string;
  visibility?: string;
}): Promise<void> {
  const { client } = requireAuthClient();

  const body: Record<string, unknown> = {};
  if (options.alias !== undefined) {
    body.alias = options.alias === '' ? null : options.alias;
  }
  if (options.metadata !== undefined) {
    body.metadata = parseJsonObjectOption(options.metadata, '--metadata');
  }
  if (options.tag !== undefined) {
    body.tag = options.tag === '' ? null : options.tag;
  }
  if (options.description !== undefined) {
    body.description = options.description === '' ? null : options.description;
  }
  if (options.website !== undefined) {
    body.website = options.website === '' ? null : options.website;
  }
  if (options.email !== undefined) {
    body.email = options.email === '' ? null : options.email;
  }
  if (options.visibility !== undefined) {
    body.visibility = options.visibility;
  }

  if (Object.keys(body).length === 0) {
    throw new CliError('MISSING_OPTION', 'Provide at least one option to update (--alias, --tag, --description, --website, --email, --visibility, --metadata)');
  }

  const { data } = await client.patch('/v0/accounts/me', body);
  outputSuccess(data.data, formatProfileUpdated);
}
