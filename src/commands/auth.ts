import { loadConfig, getApiUrl, saveConfig } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAuthKey } from '../formatters.js';
import { generateKeypair, publicKeyToAgentId } from '../crypto.js';
import { loadIdentity, saveIdentity } from '../identity.js';
import { requireAuthClient } from '../auth-client.js';

export async function authRegister(options: { alias?: string; force?: boolean }): Promise<void> {
  const existing = loadIdentity();
  if (existing && !options.force) {
    throw new CliError('IDENTITY_EXISTS', [
      `Already registered as ${existing.agentId}`,
      'To re-register with a new identity, use --force',
    ].join('\n'));
  }

  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl });

  const keypair = generateKeypair();
  const agentId = publicKeyToAgentId(keypair.publicKeyHex);

  const body: Record<string, string> = { public_key: keypair.publicKeyHex };
  if (options.alias) body.alias = options.alias;

  try {
    const { data } = await client.post('/v0/agents', body);
    const apiKey = data.data.api_key;

    saveIdentity({
      agentId,
      publicKey: keypair.publicKeyHex,
      secretKey: keypair.secretKeyHex,
    });

    config.apiKey = apiKey;
    saveConfig(config);

    outputSuccess({
      agentId,
      alias: data.data.alias ?? null,
      apiKey,
      message: 'Agent registered',
      identity_file: '~/.config/tokenrip/identity.json',
      config_file: '~/.config/tokenrip/config.json',
    }, formatAuthKey);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('REGISTRATION_FAILED', 'Failed to register agent. Is the server running?');
  }
}

export async function authCreateKey(): Promise<void> {
  const { client } = requireAuthClient();

  try {
    const { data } = await client.post('/v0/agents/revoke-key');
    const apiKey = data.data.api_key;

    const config = loadConfig();
    config.apiKey = apiKey;
    saveConfig(config);

    outputSuccess({
      apiKey,
      message: 'API key regenerated and saved',
      note: 'Previous key has been revoked',
    }, formatAuthKey);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('KEY_ROTATION_FAILED', 'Failed to regenerate API key.');
  }
}

export async function authWhoami(): Promise<void> {
  const { client } = requireAuthClient();

  try {
    const { data } = await client.get('/v0/agents/me');
    outputSuccess({
      agent_id: data.data.agent_id,
      alias: data.data.alias,
      registered_at: data.data.registered_at,
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('WHOAMI_FAILED', 'Failed to fetch agent profile.');
  }
}
