import type { AxiosInstance } from 'axios';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatKeyCreated, formatKeyList, formatKeyRevoked, formatSignInCode } from '../formatters.js';

/**
 * `rip auth code` — issue a six-digit code tied to the person's email so their next agent can sign
 * in (`rip auth login --email <e> --code <c>`, or the browser during connector setup) without
 * another email. Mirrors: dashboard Agents page, MCP `sign_in_code_create`.
 */
export async function authCode(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/auth/sign-in-codes');
  outputSuccess(data.data, formatSignInCode);
}

/** `rip auth keys` — every key on the account: agents, keys made for hosts, connector grants. */
export async function authKeysList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/auth/keys');
  outputSuccess(data.data, formatKeyList);
}

/** `rip auth keys create --name <n>` — a key for a host that takes a pasted key (a vault, settings). */
export async function authKeysCreate(options: { name?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/auth/keys', options.name === undefined ? {} : { name: options.name });
  outputSuccess(data.data, formatKeyCreated);
}

/**
 * `rip auth keys revoke <id>` — disconnect the agent holding that key. When the key is the one this
 * CLI is using, say so: every later command will be refused until it signs in again.
 */
export async function authKeysRevoke(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const ownId = await currentKeyId(client);
  const { data } = await client.delete(`/v0/auth/keys/${encodeURIComponent(id)}`);
  outputSuccess({ ...data.data, ...(ownId === id ? { own_key: true } : {}) }, formatKeyRevoked);
}

/** The id of the key this CLI is using, best-effort: a failed lookup must not block a revoke. */
async function currentKeyId(client: AxiosInstance): Promise<string | undefined> {
  try {
    const { data } = await client.get('/v0/auth/keys');
    return (data.data.keys as Array<{ id: string; current: boolean }>).find((k) => k.current)?.id;
  } catch {
    return undefined;
  }
}
