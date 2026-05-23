import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, getApiUrl, getFrontendUrl } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { startOAuthListener } from '../oauth-listener.js';
import { generatePkce } from '../pkce.js';
import {
  loadIdentities,
  saveIdentities,
  type StoredIdentity,
} from '../identities.js';
import { accountIdToPublicKey } from '../crypto.js';

const execAsync = promisify(exec);

/**
 * Cross-platform "open URL in browser". Failure is non-fatal — the URL is
 * already printed to stderr so the operator can copy/paste if needed.
 */
async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start ""'
        : 'xdg-open';
  try {
    await execAsync(`${cmd} "${url.replace(/"/g, '\\"')}"`);
  } catch {
    // best-effort
  }
}

export async function authLogin(_options: Record<string, unknown> = {}): Promise<void> {
  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const frontendUrl = getFrontendUrl(config);

  const listener = await startOAuthListener();
  try {
    const { verifier, challenge, method } = generatePkce();
    const state = randomBytes(16).toString('hex');
    const redirectUri = `http://127.0.0.1:${listener.port}/callback`;

    const authorizeUrl = new URL('/oauth/authorize', frontendUrl);
    authorizeUrl.searchParams.set('client_id', 'tokenrip-cli');
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', method);
    authorizeUrl.searchParams.set('state', state);

    console.error(`Opening browser to ${authorizeUrl.toString()}`);
    console.error('If the browser does not open automatically, paste the URL above.');
    await openBrowser(authorizeUrl.toString());

    const { code, state: returnedState } = await listener.await;
    if (returnedState !== state) {
      throw new CliError(
        'OAUTH_STATE_MISMATCH',
        'OAuth state mismatch — possible CSRF attempt. Aborting.',
      );
    }

    // Exchange code for access token (bare OAuth 2.1 token response, not the
    // tokenrip { ok, data } envelope — see apps/backend/src/oauth/oauth.controller.ts).
    const client = createHttpClient({ baseUrl: apiUrl });
    const tokenRes = await client.post('/oauth/token', {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: 'tokenrip-cli',
    });

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      throw new CliError(
        'OAUTH_TOKEN_INVALID_RESPONSE',
        `Unexpected /oauth/token response: ${JSON.stringify(tokenRes.data)}`,
      );
    }

    // /oauth/token does not return the agent id — fetch it via /v0/accounts/me
    // using the freshly issued access token.
    const meClient = createHttpClient({ baseUrl: apiUrl, apiKey: accessToken });
    const meRes = await meClient.get('/v0/accounts/me');
    const agentId = meRes.data?.data?.agent_id;
    if (!agentId || typeof agentId !== 'string') {
      throw new CliError(
        'OAUTH_PROFILE_FETCH_FAILED',
        `Could not resolve agent_id after token exchange: ${JSON.stringify(meRes.data)}`,
      );
    }

    // publicKey is recoverable from the bech32-encoded accountId. secretKey is
    // left empty: this identity was issued by the server (no local keypair).
    // Most CLI commands authenticate with the API key — only operator-link
    // token signing needs the secret key, and OAuth-bound agents don't need to
    // re-bind operators.
    const publicKey = accountIdToPublicKey(agentId);

    const store = loadIdentities();
    const identity: StoredIdentity = {
      accountId: agentId,
      publicKey,
      secretKey: '',
      apiKey: accessToken,
    };
    store[agentId] = identity;
    saveIdentities(store);

    outputSuccess(
      { agent_id: agentId, api_key: accessToken },
      () =>
        `Signed in as ${agentId}\n` +
        `  API key saved to ~/.config/tokenrip/identities.json\n` +
        `  Note: no local secret key (server-issued credential).`,
    );
  } finally {
    listener.close();
  }
}
