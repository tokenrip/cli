import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, loadConfig } from './config.js';
import { CliError } from './errors.js';

function getIdentitiesFile(): string {
  return path.join(getConfigDir(), 'identities.json');
}

export interface StoredIdentity {
  accountId: string;
  /** @deprecated use accountId */
  agentId?: string;
  publicKey: string;
  secretKey: string;
  apiKey: string;
  alias?: string;
}

export type IdentityStore = Record<string, StoredIdentity>;

export function loadIdentities(): IdentityStore {
  try {
    const raw = JSON.parse(fs.readFileSync(getIdentitiesFile(), 'utf-8')) as IdentityStore;
    // Migrate v1 identities: rename agentId → accountId
    let changed = false;
    for (const identity of Object.values(raw)) {
      if (!identity.accountId && identity.agentId) {
        identity.accountId = identity.agentId;
        changed = true;
      }
    }
    if (changed) saveIdentities(raw);
    return raw;
  } catch {
    return {};
  }
}

export function saveIdentities(store: IdentityStore): void {
  const dir = getConfigDir();
  const file = getIdentitiesFile();
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak`);
  }
  fs.writeFileSync(file, JSON.stringify(store, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function addIdentity(identity: StoredIdentity): void {
  const store = loadIdentities();
  store[identity.accountId] = identity;
  saveIdentities(store);
}

export function removeIdentity(target: string): void {
  const store = loadIdentities();
  const accountId = resolveAccountId(store, target);
  if (!accountId) {
    throw new CliError('IDENTITY_NOT_FOUND', `No local identity matching "${target}".`);
  }
  if (Object.keys(store).length <= 1) {
    throw new CliError(
      'LAST_IDENTITY',
      'Cannot remove the last identity. Use `rip account create` to add another first.',
    );
  }
  delete store[accountId];
  saveIdentities(store);
}

export function resolveAccountId(store: IdentityStore, target: string): string | null {
  if (store[target]) return target;
  for (const [id, identity] of Object.entries(store)) {
    if (identity.alias === target) return id;
  }
  return null;
}

/** @deprecated use resolveAccountId */
export const resolveAgentId = resolveAccountId;

let agentOverride: string | undefined;

export function setAgentOverride(value: string | undefined): void {
  agentOverride = value;
}

export function resolveCurrentIdentity(opts?: { agent?: string }): StoredIdentity {
  const store = loadIdentities();
  const entries = Object.values(store);

  if (entries.length === 0) {
    throw new CliError(
      'NO_IDENTITY',
      'No account identity found. Run `rip account create` to set up your account.',
    );
  }

  const override = opts?.agent || agentOverride;
  if (override) {
    const id = resolveAccountId(store, override);
    if (!id) {
      throw new CliError(
        'IDENTITY_NOT_FOUND',
        `No local identity matching "${override}". Run \`rip account list\` to see available accounts.`,
      );
    }
    return store[id];
  }

  const envAgent = process.env.TOKENRIP_AGENT;
  if (envAgent) {
    const id = resolveAccountId(store, envAgent);
    if (!id) {
      throw new CliError(
        'IDENTITY_NOT_FOUND',
        `TOKENRIP_AGENT="${envAgent}" does not match any local identity.`,
      );
    }
    return store[id];
  }

  const config = loadConfig();
  const currentAccount = config.currentAccount || config.currentAgent;
  if (currentAccount) {
    const id = resolveAccountId(store, currentAccount);
    if (id) return store[id];
  }

  if (entries.length === 1) return entries[0];

  throw new CliError(
    'AMBIGUOUS_IDENTITY',
    'Multiple accounts configured. Use `rip account use <name>` to select one, or pass `--agent <name>`.',
  );
}
