import fs from 'node:fs';
import {
  loadIdentities,
  addIdentity,
  removeIdentity,
  clearCurrentAccount,
  defaultSignInKey,
  resolveSignIn,
  resolveCurrentIdentity,
  settleDefault,
  signInKey,
  requireLocalKeypair,
  saveIdentities,
  type StoredIdentity,
} from '../identities.js';
import { loadConfig, saveConfig, getApiUrl } from '../config.js';
import { generateKeypair, publicKeyToAccountId, signPayload } from '../crypto.js';
import { formatAuthKey } from '../formatters.js';
import { createHttpClient } from '../client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { encryptIdentityForAgent, decryptIdentityFromAgent } from '../agent-crypto.js';

/**
 * Decide whether a newly-created keypair identity should become the default.
 * It only does when it is the first identity here, or when the caller asks,
 * so no agent already here is silently switched out from under its work.
 */
export function shouldActivateNewIdentity(opts: { activateRequested: boolean; storeWasEmpty: boolean }): boolean {
  return opts.activateRequested || opts.storeWasEmpty;
}

export async function accountCreate(options: { alias?: string; activate?: boolean }): Promise<void> {
  const keypair = generateKeypair();
  const accountId = publicKeyToAccountId(keypair.publicKeyHex);
  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const client = createHttpClient({ baseUrl: apiUrl });

  const body: Record<string, string> = { public_key: keypair.publicKeyHex };
  if (options.alias) body.alias = options.alias;

  const { data } = await client.post('/v0/accounts', body);

  const apiKey = data.data.api_key;
  const identity: StoredIdentity = {
    accountId,
    publicKey: keypair.publicKeyHex,
    secretKey: keypair.secretKeyHex,
    apiKey,
  };
  if (options.alias) identity.alias = options.alias;

  const storeBefore = loadIdentities();
  const storeWasEmpty = Object.keys(storeBefore).length === 0;
  const before = defaultSignInKey(storeBefore, config);
  addIdentity(identity);

  const previousAccountId = config.currentAccount;
  const active = shouldActivateNewIdentity({ activateRequested: options.activate === true, storeWasEmpty });
  // An explicit --activate makes it the default as an empty store would; otherwise `settleDefault`.
  settleDefault(config, { storeWasEmpty: active, before, key: accountId });
  saveConfig(config);

  outputSuccess({
    accountId,
    alias: data.data.alias ?? null,
    apiKey,
    active,
    previousAccountId:
      active && previousAccountId && previousAccountId !== accountId ? previousAccountId : undefined,
    message: active
      ? 'Account created and selected as active identity'
      : 'Account created (run `rip account use <alias>` to switch to it)',
  });
}

/**
 * The sign-ins here. `current` marks the default, the one plain `rip` acts as; `defaultMissing`
 * says there are several and none is the default, so plain `rip` refuses.
 */
export function accountList(): {
  accounts: Array<{ name?: string; accountId: string; alias?: string; current: boolean }>;
  defaultMissing?: true;
} {
  const store = loadIdentities();
  const current = defaultSignInKey(store);
  const accounts = Object.entries(store).map(([key, id]) => ({
    name: id.name,
    accountId: id.accountId,
    alias: id.alias,
    current: key === current,
  }));
  return { accounts, ...(current === null && accounts.length > 1 ? { defaultMissing: true as const } : {}) };
}

/** The store key `target` (a name, account id or alias) names, or `IDENTITY_NOT_FOUND`. */
function requireSignIn(store: Record<string, StoredIdentity>, target: string, listHint = true): string {
  const key = resolveSignIn(store, target);
  if (!key) {
    throw new CliError(
      'IDENTITY_NOT_FOUND',
      listHint
        ? `No local identity matching "${target}". Run \`rip account list\` to see available accounts.`
        : `No local identity matching "${target}".`,
    );
  }
  return key;
}

export function accountUse(target: string): void {
  const store = loadIdentities();
  const key = requireSignIn(store, target);
  const config = loadConfig();
  config.currentAccount = key;
  saveConfig(config);
  const identity = store[key];
  const label = identity.name || identity.alias || identity.accountId;
  outputSuccess({
    accountId: identity.accountId,
    alias: identity.alias ?? null,
    ...(identity.name ? { name: identity.name } : {}),
    message: `Switched to ${label}: plain \`rip\` now acts as ${label}.`,
  });
}

export async function accountExport(target: string, options: { to: string }): Promise<void> {
  const store = loadIdentities();
  const identity = store[requireSignIn(store, target, false)];
  requireLocalKeypair(identity, 'Sign in on the other machine instead: rip auth login --email <your email>, or connect it with rip auth code.');
  const blob = encryptIdentityForAgent(identity, options.to, identity.secretKey);
  outputSuccess({
    blob,
    fromAgentId: identity.accountId,
    toAgentId: options.to,
    message: 'Identity exported. Send the blob value to the recipient.',
  });
}

export async function accountImport(file: string): Promise<void> {
  const current = resolveCurrentIdentity();
  requireLocalKeypair(current, 'Importing decrypts with the current identity\'s keypair; switch to a keypair identity (rip account use <name>) first.');
  let blob: string;
  if (file === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    blob = Buffer.concat(chunks).toString('utf-8').trim();
  } else {
    blob = fs.readFileSync(file, 'utf-8').trim();
  }

  const identity = decryptIdentityFromAgent(blob, current.secretKey);
  const config = loadConfig();
  const storeBefore = loadIdentities();
  const before = defaultSignInKey(storeBefore, config);
  addIdentity(identity);
  // The imported sign-in becomes the default only on an empty store (`settleDefault`).
  settleDefault(config, { storeWasEmpty: Object.keys(storeBefore).length === 0, before, key: signInKey(identity) });
  saveConfig(config);
  outputSuccess({
    accountId: identity.accountId,
    alias: identity.alias ?? null,
    message: `Imported agent ${identity.alias || identity.accountId}`,
  });
}

export function accountRemove(target: string): void {
  const store = loadIdentities();
  // An exact store key first: an unnamed sign-in (keyed by its account id) beside named ones of the
  // same account is otherwise unreachable, since the account id matches them all.
  const key = Object.hasOwn(store, target) ? target : requireSignIn(store, target, false);
  const identity = store[key];
  removeIdentity(key);
  clearCurrentAccount(key);
  outputSuccess({
    agentId: identity.accountId,
    ...(identity.name ? { name: identity.name } : {}),
    message: `Removed ${target} from local identities (agent still exists on server)`,
  });
}

/**
 * `rip account recover-key` — a keypair identity that lost its key gets a new one by signing a
 * recovery token with its Ed25519 key. Replaces only the identity's `default` key; every other key
 * on the account keeps working. An identity that signed in by email signs in again instead.
 */
export async function accountRecoverKey(): Promise<void> {
  const identity = resolveCurrentIdentity();
  requireLocalKeypair(identity, 'Sign in again instead: rip auth login --email <your email>.');
  const exp = Math.floor(Date.now() / 1000) + 300;
  const token = signPayload(
    { sub: 'key-recovery', iss: identity.accountId, exp, jti: Math.random().toString(36).slice(2) },
    identity.secretKey,
  );

  const client = createHttpClient({ baseUrl: getApiUrl(loadConfig()) });
  const { data } = await client.post('/v0/accounts/recover-key', { token });
  const apiKey = data.data.api_key;

  const store = loadIdentities();
  const key = signInKey(identity);
  if (store[key]) {
    store[key].apiKey = apiKey;
    saveIdentities(store);
  }

  outputSuccess(
    { accountId: identity.accountId, apiKey, message: 'API key recovered and saved. Other keys on the account keep working.' },
    formatAuthKey,
  );
}
