import { requireAuthClient } from '../auth-client.js';
import { loadConfig, saveConfig } from '../config.js';
import { accountIdToPublicKey } from '../crypto.js';
import { CliError } from '../errors.js';
import { formatAuthAdded } from '../formatters.js';
import {
  assertSignInNameFree,
  loadIdentities,
  nameUnnamedSiblings,
  resolveCurrentIdentity,
  saveIdentities,
  signInKey,
  signInLabel,
  signInsForAccount,
  type StoredIdentity,
} from '../identities.js';
import { outputSuccess } from '../output.js';
import { keyServerName, retireKey } from './auth-login.js';

/** `POST /v0/auth/keys` 201. */
type CreatedKey = { id: string; name: string; api_key: string };

/**
 * `rip auth add <name>` — for another agent on this computer (design
 * 2026-11-13-shared-computer-sign-ins §5): from the selected sign-in, create a key named `name` on
 * the same account (`POST /v0/auth/keys`; the server refuses a run key or a limited key, applies
 * its hourly cap and emails the person that an agent connected) and save it here as sign-in `name`,
 * keypair-less like an email sign-in, without making it current.
 *
 * The name must be free on this computer (any account), so `rip --agent <name>` names one sign-in.
 * Since the account now has several sign-ins here, an unnamed one of the account (stored before
 * names) is first named after its key's server name, as `rip auth login` does, so it stays
 * selectable. The store is read and written once after the key is made: a name another agent saved
 * meanwhile is `NAME_TAKEN`, and the key just made is revoked (best-effort, its id named when not).
 * The new key is never printed: the other agent uses it through `--agent`.
 */
export async function authAdd(name: string): Promise<void> {
  if (process.env.TOKENRIP_API_KEY) {
    throw new CliError(
      'ENV_KEY_ADD',
      'TOKENRIP_API_KEY is set, so there is no stored sign-in to add another beside. Unset it; for a key kept in a host\'s vault, use `rip auth keys create --name <name>`.',
    );
  }
  assertSignInNameFree(loadIdentities(), name);
  const caller = resolveCurrentIdentity();
  const { client, apiUrl } = requireAuthClient();

  // Network reads first: the person's email and the calling key's server name, then the server
  // names of the account's unnamed sign-ins here (one at most: an unnamed one is keyed by account id).
  const me = await client.get('/v0/accounts/me').then(({ data }) => data?.data, () => undefined);
  const email = typeof me?.email === 'string' ? me.email : undefined;
  const callerKeyName = typeof me?.key?.name === 'string' ? me.key.name : '';
  const nameSiblings: Array<{ key: string; apiKey: string; serverName: string }> = [];
  for (const entry of signInsForAccount(loadIdentities(), caller.accountId)) {
    if (entry.name !== undefined || !entry.apiKey) continue;
    const serverName = entry.apiKey === caller.apiKey ? callerKeyName : (await keyServerName(apiUrl, entry.apiKey)) ?? '';
    nameSiblings.push({ key: signInKey(entry), apiKey: entry.apiKey, serverName });
  }

  const { data } = await client.post('/v0/auth/keys', { name });
  const created = data.data as CreatedKey;

  let addedBy: string;
  try {
    addedBy = saveAdded(caller, name, created.api_key, nameSiblings);
  } catch (error) {
    const own = await retireKey(apiUrl, created.api_key);
    const revoked = own.status === 'revoked' || own.status === 'already_invalid';
    const left = revoked
      ? ', and the key just made was revoked'
      : `; the key just made could not be revoked: remove it with \`rip auth keys revoke ${own.id ?? created.id}\``;
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliError ? error.code : 'SAVE_FAILED';
    throw new CliError(code, `${message} Nothing was saved${left}.${code === 'NAME_TAKEN' ? ' Pick another name.' : ''}`);
  }

  outputSuccess(
    {
      name,
      account_id: caller.accountId,
      ...(email === undefined ? {} : { email }),
      key_id: created.id,
      added_by: addedBy,
      run_as: `rip --agent ${name}`,
    },
    formatAuthAdded,
  );
}

/**
 * One read and one write of the store: `name` checked again, the account's unnamed sign-ins named,
 * the new sign-in added. It throws only when nothing was saved (the caller then revokes the new
 * key). The current pointer moves only with a renamed sign-in. Returns how the calling sign-in is
 * now shown.
 */
function saveAdded(
  caller: StoredIdentity,
  name: string,
  apiKey: string,
  nameSiblings: Array<{ key: string; apiKey: string; serverName: string }>,
): string {
  const store = loadIdentities();
  const config = loadConfig();
  const pointer = [config.currentAccount, config.currentAgent];
  assertSignInNameFree(store, name);
  const given = [name];
  nameUnnamedSiblings(store, config, caller.accountId, nameSiblings, given);
  store[name] = { accountId: caller.accountId, publicKey: accountIdToPublicKey(caller.accountId), secretKey: '', apiKey, name };
  saveIdentities(store);
  // Saved: from here nothing is revoked. A pointer left on the old store key (an account id)
  // still finds the renamed sign-in by its account, so its write is best-effort.
  if (pointer[0] !== config.currentAccount || pointer[1] !== config.currentAgent) {
    try { saveConfig(config); } catch { /* see above */ }
  }
  const now = Object.values(store).find((entry) => entry.accountId === caller.accountId && entry.apiKey === caller.apiKey);
  return signInLabel(now ?? caller);
}
