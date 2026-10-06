import { getFrontendUrl } from '../config.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAuthKey, formatProfileUpdated, formatWhoami } from '../formatters.js';
import { resolveCurrentIdentity, loadIdentities, saveIdentities } from '../identities.js';
import { requireAuthClient } from '../auth-client.js';
import { parseJsonObjectOption } from '../json.js';

/** Where a retired setup command sends the agent: email sign-in, or the setup guide. */
export function signInPointer(): string {
  return `Sign in with the person's email: rip auth login --email <your email>. A connected agent can give you a code instead (rip auth code). Guide: ${getFrontendUrl()}/setup`;
}

/** `rip auth register` — retired. Accepts and ignores its old options; makes no request. */
export async function authRegister(_options?: unknown): Promise<void> {
  throw new CliError('USE_LOGIN', `rip auth register is retired. ${signInPointer()}`);
}

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

  const { data } = await client.post('/v0/accounts/revoke-key');
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
  public?: string;
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
  if (options.public !== undefined) {
    body.is_public = options.public === 'true';
  }

  if (Object.keys(body).length === 0) {
    throw new CliError('MISSING_OPTION', 'Provide at least one option to update (--alias, --tag, --description, --website, --email, --public, --metadata)');
  }

  const { data } = await client.patch('/v0/accounts/me', body);
  outputSuccess(data.data, formatProfileUpdated);
}
