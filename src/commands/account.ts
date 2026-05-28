import fs from 'node:fs';
import {
  loadIdentities,
  addIdentity,
  removeIdentity,
  resolveAccountId,
  resolveCurrentIdentity,
  type StoredIdentity,
} from '../identities.js';
import { loadConfig, saveConfig, getApiUrl } from '../config.js';
import { generateKeypair, publicKeyToAccountId } from '../crypto.js';
import { createHttpClient } from '../client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { encryptIdentityForAgent, decryptIdentityFromAgent } from '../agent-crypto.js';

/**
 * Decide whether a newly-created identity should become the active one.
 * `rip account create` only auto-activates when there's no other choice
 * (first identity or no `currentAccount` set), so the operator isn't
 * silently switched out from under in-progress work. `rip auth register`
 * passes `activateRequested: true` because that command's contract is
 * "set up and use this identity now."
 */
export function shouldActivateNewIdentity(opts: {
  activateRequested: boolean;
  identityCount: number;
  hasCurrentAccount: boolean;
}): boolean {
  return opts.activateRequested || opts.identityCount === 1 || !opts.hasCurrentAccount;
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

  addIdentity(identity);

  const previousAccountId = config.currentAccount;
  const store = loadIdentities();
  const active = shouldActivateNewIdentity({
    activateRequested: options.activate === true,
    identityCount: Object.keys(store).length,
    hasCurrentAccount: !!config.currentAccount,
  });

  if (active) {
    config.currentAccount = accountId;
    saveConfig(config);
  }

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

export function accountList(): Array<{ accountId: string; alias?: string; current: boolean }> {
  const store = loadIdentities();
  const config = loadConfig();
  return Object.values(store).map((id) => ({
    accountId: id.accountId,
    alias: id.alias,
    current: id.accountId === (config.currentAccount || config.currentAgent),
  }));
}

export function accountUse(target: string): void {
  const store = loadIdentities();
  const accountId = resolveAccountId(store, target);
  if (!accountId) {
    throw new CliError(
      'IDENTITY_NOT_FOUND',
      `No local identity matching "${target}". Run \`rip account list\` to see available accounts.`,
    );
  }
  const config = loadConfig();
  config.currentAccount = accountId;
  saveConfig(config);
  const identity = store[accountId];
  outputSuccess({
    accountId,
    alias: identity.alias ?? null,
    message: `Switched to ${identity.alias || accountId}`,
  });
}

export async function accountExport(target: string, options: { to: string }): Promise<void> {
  const store = loadIdentities();
  const agentId = resolveAccountId(store, target);
  if (!agentId) {
    throw new CliError('IDENTITY_NOT_FOUND', `No local identity matching "${target}".`);
  }
  const identity = store[agentId];
  const blob = encryptIdentityForAgent(identity, options.to, identity.secretKey);
  outputSuccess({
    blob,
    fromAgentId: identity.accountId,
    toAgentId: options.to,
    message: 'Identity exported. Send the blob value to the recipient.',
  });
}

export async function accountImport(file: string): Promise<void> {
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

  const current = resolveCurrentIdentity();
  const identity = decryptIdentityFromAgent(blob, current.secretKey);
  addIdentity(identity);
  outputSuccess({
    accountId: identity.accountId,
    alias: identity.alias ?? null,
    message: `Imported agent ${identity.alias || identity.accountId}`,
  });
}

export function accountRemove(target: string): void {
  const store = loadIdentities();
  const agentId = resolveAccountId(store, target);
  if (!agentId) {
    throw new CliError('IDENTITY_NOT_FOUND', `No local identity matching "${target}".`);
  }
  removeIdentity(agentId);
  // Clear both the current and the deprecated field so we never leave a
  // dangling pointer on a v3 config that still has `currentAgent` set or a
  // pre-v3 config that's about to be migrated.
  const config = loadConfig();
  let changed = false;
  if (config.currentAccount === agentId) {
    delete config.currentAccount;
    changed = true;
  }
  if (config.currentAgent === agentId) {
    delete config.currentAgent;
    changed = true;
  }
  if (changed) saveConfig(config);
  outputSuccess({
    agentId,
    message: `Removed ${target} from local identities (agent still exists on server)`,
  });
}
