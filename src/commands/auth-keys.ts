import type { AxiosInstance } from 'axios';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatKeyCreated, formatKeyList, formatKeyRevoked, formatSignInCode, formatSignInLink } from '../formatters.js';

/**
 * `rip auth code` — issue a six-digit code tied to the person's email so their next agent can sign
 * in (`rip auth login --email <e> --code <c>`, or the browser during connector setup) without
 * another email. Mirror: the dashboard Agents page (where an MCP agent sends the person: `whoami`'s
 * `agentsUrl`); no MCP tool.
 */
export async function authCode(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/auth/sign-in-codes');
  outputSuccess(data.data, formatSignInCode);
}

/**
 * `rip auth link [--to <page>]` — a one-time sign-in link for the person's browser (10 minutes),
 * optionally opening a Tokenrip page after sign-in. No MCP tool and no dashboard mirror (a signed-in
 * browser needs no link).
 */
export async function authLink(options: { to?: string }): Promise<void> {
  const { client } = requireAuthClient();
  try {
    const { data } = await client.post('/v0/auth/sign-in-links', options.to === undefined ? undefined : { destination: options.to });
    outputSuccess(data.data, formatSignInLink);
  } catch (err) {
    // The general hints send the agent elsewhere (`rip operator-link`, the Agents page), and none of
    // them gets this agent a link: a bound keypair account is never the person's main one either.
    if (err instanceof CliError && LINK_REFUSALS.has(err.code)) err.hint = LINK_REFUSED_HINT;
    throw err;
  }
}

/** Refusals of `rip auth link` that no change by the agent or the person turns into a link. */
const LINK_REFUSALS = new Set(['NO_OPERATOR', 'OPERATOR_AMBIGUOUS', 'NOT_PRIMARY_ACCOUNT', 'RUN_KEY_FORBIDDEN']);

/** A refused `rip auth link`: the plain address is the way. */
export const LINK_REFUSED_HINT = 'Give the person the plain page address instead; they can sign in with their email.';

/** `rip auth keys` — every key on the account: agents, keys made for hosts, connector grants. */
export async function authKeysList(): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get('/v0/auth/keys');
  outputSuccess(data.data, formatKeyList);
}

/** `rip auth keys create [--name <n>]` — a key for a host that takes a pasted key (a vault, settings). */
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
