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

export async function accountCreate(options: { alias?: string }): Promise<void> {
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

  const store = loadIdentities();
  if (Object.keys(store).length === 1 || !config.currentAccount) {
    config.currentAccount = accountId;
    saveConfig(config);
  }

  outputSuccess({
    accountId,
    alias: data.data.alias ?? null,
    apiKey,
    message: 'Account created',
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
  const config = loadConfig();
  if (config.currentAgent === agentId) {
    delete config.currentAgent;
    saveConfig(config);
  }
  outputSuccess({
    agentId,
    message: `Removed ${target} from local identities (agent still exists on server)`,
  });
}
