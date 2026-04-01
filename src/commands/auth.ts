import { hostname } from 'node:os';
import { loadConfig, getApiUrl, saveConfig } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatAuthKey } from '../formatters.js';

export async function authCreateKey(options: { name?: string; save?: boolean }): Promise<void> {
  const config = loadConfig();
  const apiUrl = getApiUrl(config);

  const keyName = options.name || `tokenrip-${hostname()}`;
  const client = createHttpClient({ baseUrl: apiUrl });

  try {
    const { data } = await client.post('/v0/auth/keys', { name: keyName });
    const apiKey = data.data.apiKey;

    // Auto-save the key if requested or not explicitly disabled
    if (options.save !== false) {
      config.apiKey = apiKey;
      saveConfig(config);
      outputSuccess({
        keyName,
        apiKey,
        message: 'API key created and saved',
        note: 'Keep this key safe — treat it like a password',
        config_file: `~/.config/tokenrip/config.json`,
      }, formatAuthKey);
    } else {
      outputSuccess({
        keyName,
        apiKey,
        message: 'API key created',
        note: 'To save it, run: tokenrip config set-key <key>',
      }, formatAuthKey);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('AUTH_FAILED', 'Failed to create API key. Is the server running?');
  }
}
