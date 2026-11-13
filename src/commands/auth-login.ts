import { loadConfig, getApiUrl } from '../config.js';
import { createHttpClient } from '../client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatSignInRequested, formatSignedIn } from '../formatters.js';
import {
  assertSignInNameFree,
  commitSignIn,
  loadIdentities,
  resolveSignIn,
  signInKey,
  signInsForAccount,
  slugSignInName,
  type SignInCommit,
} from '../identities.js';

/** What happened to the key a repeat sign-in replaced on this machine (and its id when it is still live). */
export type PreviousKey = { status: 'revoked' | 'already_invalid' | 'not_revoked'; id?: string };

/** `POST /v0/auth/sign-in` 201: a key of the agent's own, or (outcome `run`) a run key for its lasting key. */
type SignedIn = { api_key: string; account_id: string; email: string } & (
  | { outcome: 'registered' | 'existing_account' }
  | {
      outcome: 'run';
      agent: { key_id: string; name: string };
      ends_by: string;
      idle_timeout_seconds: number;
      renew_url: string;
    }
);

export const RUN_KEY_PREFIX = 'tr_run_';

/**
 * `rip auth login` — sign in with the person's email. Without `code`, Tokenrip emails a six-digit
 * code; with it (emailed, or issued by a connected agent or the dashboard), the CLI gets a key of
 * its own on the person's account, stores it as a keypair-less sign-in, and makes that sign-in
 * current.
 *
 * Several agents can keep sign-ins on one account here, each under its own name (design
 * 2026-11-13-shared-computer-sign-ins §5). The target is `--name`; else the account's only sign-in
 * here (replaced, as before names); else a new sign-in named after the key's server name, with a
 * `-2`, `-3`… suffix when that name is taken. A key is revoked (best-effort) only when the sign-in
 * it belonged to is replaced: same name and account, or this agent's own unnamed sign-in (below).
 * A name another account holds here is
 * `NAME_TAKEN`: the key just received is revoked and nothing is saved. When a named sign-in is
 * added beside an unnamed one of the account (stored before names), the unnamed one is first named
 * after its own key's server name; if that read fails it stays unnamed. With `--name n`, though,
 * an unnamed sign-in of the account whose key the server calls `n` (slugged, any case), unless `n`
 * is a server-default name (`DEFAULT_KEY_NAMES`), is this agent's own sign-in from before names:
 * it is replaced and its old key revoked, as for a sign-in named `n`. Server names become
 * slugs (`Claude Code` → `claude-code`); a `--name` is kept as given but may hold no spaces.
 *
 * Several agents may sign in at once, so every network read happens first and the store is then
 * read and written once (`commitSignIn`): a sign-in that appeared meanwhile is never replaced or
 * revoked, and a name another agent took meanwhile is refused or suffixed.
 *
 * A run code (from the key sign-in page, issued with the agent's lasting key) returns a run key
 * instead (`outcome: 'run'`): a short-lived key that acts as that lasting key, ends after
 * `idle_timeout_seconds` without use and by `ends_by` at the latest, and cannot manage keys. It is
 * stored like any key, but it revokes nothing: the key this machine held may be the lasting key it
 * stands for. Nor is a previously held run key ever retired; it ends on its own.
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

  // Without --name the server names the key after this harness (X-Tokenrip-Surface), as for any agent.
  const name = options.name;
  if (name !== undefined) assertSignInNameFree({}, name); // its shape, before a key is made
  const { data } = await client.post('/v0/auth/sign-in', { email, code: options.code, ...(name === undefined ? {} : { name }) });
  const signedIn = data.data as SignedIn;
  if (!signedIn?.api_key || !signedIn.account_id) {
    throw new CliError('SIGN_IN_INVALID_RESPONSE', 'Unexpected sign-in response from the server.');
  }
  const accountId = signedIn.account_id;
  const run = signedIn.outcome === 'run';

  // Every network read first, from what was stored when the login began; then one write.
  const before = loadIdentities();
  if (name !== undefined) await refuseTaken(apiUrl, signedIn, () => assertSignInNameFree(before, name, accountId));
  const mine = signInsForAccount(before, accountId);
  // One sign-in of this account here and no --name: it is replaced, as before names (even unnamed).
  const replacingOnly = name === undefined && mine.length === 1;
  const lower = name?.toLowerCase();
  let replaces = replacingOnly
    ? mine[0]
    : lower === undefined ? undefined : mine.find((entry) => entry.name?.toLowerCase() === lower);

  // A named sign-in joining the account's others names each unnamed one, from its own key. With
  // --name n, an unnamed one (from before names; one at most) whose key the server calls n is this
  // same agent's earlier sign-in, replaced instead (design §8), unless n is a server-default name,
  // which every agent signed in without --name shares. A key that cannot be read (revoked, or any
  // other failure) proves nothing about whose it was: that sign-in stays "(no name)".
  const nameSiblings: NonNullable<SignInCommit['nameSiblings']> = [];
  if (!replacingOnly) {
    for (const entry of mine) {
      if (entry.name !== undefined || !entry.apiKey) continue;
      const serverName = await keyServerName(apiUrl, entry.apiKey);
      if (serverName === undefined) continue;
      const sameAgent = lower !== undefined && !replaces && !isDefaultKeyName(serverName)
        && (slugSignInName(serverName) === lower || serverName.toLowerCase() === lower);
      if (sameAgent) replaces = entry;
      else nameSiblings.push({ key: signInKey(entry), apiKey: entry.apiKey, serverName });
    }
  }
  const serverName = name !== undefined ? undefined
    : run ? signedIn.agent.name : await keyServerName(apiUrl, signedIn.api_key);

  const committed = await refuseTaken(apiUrl, signedIn, () => commitSignIn({
    accountId,
    apiKey: signedIn.api_key,
    ...(name === undefined ? {} : { name }),
    ...(serverName === undefined ? {} : { serverName }),
    ...(replaces ? { replaces: { key: signInKey(replaces), apiKey: replaces.apiKey } } : {}),
    nameSiblings,
  }));

  // Only the key of the sign-in replaced, which was stored before this login began.
  const oldKey = committed.replaced?.apiKey;
  const retired = oldKey && oldKey !== signedIn.api_key && !oldKey.startsWith(RUN_KEY_PREFIX) ? oldKey : undefined;
  const previousKey = !run && retired ? await retireKey(apiUrl, retired) : undefined;
  const overriddenBy = envOverride(committed.key);
  const targetName = committed.name;
  const siblings = committed.siblings;

  outputSuccess(
    {
      account_id: accountId,
      email: signedIn.email,
      outcome: signedIn.outcome,
      ...(signedIn.outcome === 'run'
        ? {
            name: signedIn.agent.name,
            ends_by: signedIn.ends_by,
            idle_timeout_seconds: signedIn.idle_timeout_seconds,
            renew_url: signedIn.renew_url,
          }
        : name === undefined ? {} : { name }),
      ...(targetName === undefined ? {} : { signed_in_as: targetName }),
      siblings,
      ...(previousKey ? { previous_key: previousKey.status } : {}),
      ...(previousKey?.id ? { previous_key_id: previousKey.id } : {}),
      ...(overriddenBy ? { overridden_by: overriddenBy } : {}),
    },
    formatSignedIn,
  );
}

/**
 * Run `check`; on `NAME_TAKEN` revoke the key this sign-in just received (unused, saved nowhere;
 * a run key cannot revoke) and refuse, naming that key's id when it could not be revoked.
 */
async function refuseTaken<T>(apiUrl: string, signedIn: SignedIn, check: () => T): Promise<T> {
  try {
    return check();
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== 'NAME_TAKEN') throw error;
    const own = signedIn.outcome === 'run' ? undefined : await retireKey(apiUrl, signedIn.api_key);
    const revoked = own?.status === 'revoked' || own?.status === 'already_invalid';
    const left = revoked
      ? ', and the key this sign-in received was revoked'
      : own?.id
        ? `; the key this sign-in received could not be revoked: remove it with \`rip auth keys revoke ${own.id}\``
        : '';
    throw new CliError('NAME_TAKEN', `${error.message} Nothing was saved${left}. Sign in again with another name.`);
  }
}

/**
 * Key names the server gives a key signed in without `--name`: the harness surface the CLI sends
 * (`claude-code`, `codex`, `cli`; `resolveSurface` in client.ts) or the server's fallback `agent`
 * (`parseKeyName`). Every agent that signed in without `--name` under that harness shares one, so
 * an unnamed sign-in whose key carries one is never taken for the agent now signing in with
 * `--name <that name>`: replacing it would revoke another live agent's key.
 */
export const DEFAULT_KEY_NAMES: readonly string[] = ['cli', 'claude-code', 'codex', 'agent'];

/** Whether `name` is a server-default key name: one of `DEFAULT_KEY_NAMES`, or this process's `TOKENRIP_SURFACE` slugged. */
export function isDefaultKeyName(name: string): boolean {
  const slug = slugSignInName(name);
  const surface = process.env.TOKENRIP_SURFACE ? slugSignInName(process.env.TOKENRIP_SURFACE) : undefined;
  return DEFAULT_KEY_NAMES.includes(slug) || slug === surface;
}

/** The server's name for a key (`key.name` from `GET /v0/accounts/me`, read with that key); undefined when the read fails. */
export async function keyServerName(apiUrl: string, apiKey: string): Promise<string | undefined> {
  try {
    const { data } = await createHttpClient({ baseUrl: apiUrl, apiKey }).get('/v0/accounts/me');
    const keyName = data?.data?.key?.name;
    return typeof keyName === 'string' && keyName.trim() ? keyName.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The environment variable that will keep later commands off this sign-in: TOKENRIP_API_KEY wins
 * over every stored identity; TOKENRIP_AGENT does unless it names the sign-in just made.
 */
function envOverride(targetKey: string): 'TOKENRIP_API_KEY' | 'TOKENRIP_AGENT' | undefined {
  if (process.env.TOKENRIP_API_KEY) return 'TOKENRIP_API_KEY';
  const agent = process.env.TOKENRIP_AGENT;
  if (!agent) return undefined;
  const store = loadIdentities();
  try {
    const key = resolveSignIn(store, agent);
    if (key !== targetKey) return 'TOKENRIP_AGENT';
  } catch {
    return 'TOKENRIP_AGENT'; // it names several sign-ins, so later commands refuse instead
  }
  return undefined;
}

/** Revoke the key this machine held before, using that key: find it (`current`) and delete it. */
export async function retireKey(apiUrl: string, oldKey: string): Promise<PreviousKey> {
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
