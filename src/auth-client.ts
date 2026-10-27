import { AxiosInstance } from 'axios';
import { loadConfig, getApiUrl, TokenripConfig } from './config.js';
import { createHttpClient } from './client.js';
import { CliError } from './errors.js';
import { resolveCurrentIdentity } from './identities.js';

export interface AuthContext {
  client: AxiosInstance;
  config: TokenripConfig;
  apiUrl: string;
}

export function requireAuthClient(): AuthContext {
  const config = loadConfig();
  const envApiKey = process.env.TOKENRIP_API_KEY;

  if (envApiKey) {
    const apiUrl = getApiUrl(config);
    const client = createHttpClient({ baseUrl: apiUrl, apiKey: envApiKey });
    return { client, config, apiUrl };
  }

  const identity = resolveCurrentIdentity();
  const apiKey = identity.apiKey;
  if (!apiKey) {
    throw new CliError(
      'NO_API_KEY',
      `No API key for ${identity.alias || identity.accountId}. Sign in again: \`rip auth login --email <your email>\`.`,
    );
  }
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl, apiKey });
  return { client, config, apiUrl };
}

/**
 * A client for reads that may be public. The key is `TOKENRIP_API_KEY`, else the current identity's
 * key, else the one `rip config set-key` saved, else none (public access). The sign-in comes before
 * the saved key because signing in never replaces it: a stale saved key would otherwise be refused
 * (the server checks every key it is sent) with advice to sign in that could not help.
 */
export function optionalAuthClient(): { client: AxiosInstance; apiUrl: string } {
  const config = loadConfig();
  let apiKey: string | undefined = process.env.TOKENRIP_API_KEY;
  if (!apiKey) {
    try { apiKey = resolveCurrentIdentity().apiKey; } catch { /* no identity: the saved key, or public */ }
  }
  apiKey ||= config.apiKey;
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl, apiKey: apiKey || undefined });
  return { client, apiUrl };
}
