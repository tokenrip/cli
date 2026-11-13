import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getConfigDir, loadConfig, saveConfig, tightenMode, type TokenripConfig } from './config.js';
import { accountIdToPublicKey, looksLikeAccountId } from './crypto.js';
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
  /**
   * The sign-in's name, unique on this computer (compared case-insensitively): one per agent, so
   * several agents can keep sign-ins on one account. The store keys a named sign-in by its name and
   * an unnamed one (keypair, import, and every sign-in stored before names) by its account id.
   */
  name?: string;
}

export type IdentityStore = Record<string, StoredIdentity>;

export function loadIdentities(): IdentityStore {
  tightenMode(getIdentitiesFile());
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
  // A write's `mode` applies only on create, and a restored or copied file can be wide.
  tightenMode(file);
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak`);
    tightenMode(`${file}.bak`);
  }
  // Written aside, then renamed over: another agent reading the file mid-write sees the old file or
  // the new one, never a torn one it would read as empty and then write back over everyone. The
  // temporary file holds every key, so a failed write removes it.
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** The key a sign-in is stored under: its name, or its account id when it has none. */
export function signInKey(identity: StoredIdentity): string {
  return identity.name ?? identity.accountId;
}

/** How a sign-in is shown in lists and refusals. */
export function signInLabel(identity: StoredIdentity): string {
  return identity.name ?? '(no name)';
}

/**
 * Save one sign-in, re-reading the file first so entries another agent wrote since this process
 * loaded it survive. A stored sign-in of the same account and name (any case) is replaced; a name
 * another account's sign-in holds is refused (`NAME_TAKEN`), never overwritten.
 */
export function addIdentity(identity: StoredIdentity): void {
  const store = loadIdentities();
  const key = signInKey(identity);
  if (identity.name !== undefined) {
    const lower = identity.name.toLowerCase();
    for (const [k, entry] of Object.entries(store)) {
      if (entry.name?.toLowerCase() !== lower) continue;
      if (entry.accountId !== identity.accountId) {
        throw new CliError('NAME_TAKEN', `Another sign-in on this computer is already called "${identity.name}".`);
      }
      if (k !== key) delete store[k];
    }
  }
  store[key] = identity;
  saveIdentities(store);
}

/** Every sign-in this computer holds for one account. */
export function signInsForAccount(store: IdentityStore, accountId: string): StoredIdentity[] {
  return Object.values(store).filter((identity) => identity.accountId === accountId);
}

/**
 * Whether `name` would clash with a stored sign-in: its name (any case), its store key, its
 * account id or its alias. With `sameAccount`, a sign-in of that account and that name is the one
 * being replaced, so it is no clash.
 */
function nameClashes(store: IdentityStore, name: string, sameAccount?: string): boolean {
  const lower = name.toLowerCase();
  return Object.entries(store).some(([key, entry]) => {
    const sameName = entry.name?.toLowerCase() === lower;
    if (sameName && sameAccount !== undefined && entry.accountId === sameAccount) return false;
    return sameName
      || key.toLowerCase() === lower
      || entry.accountId.toLowerCase() === lower
      || entry.alias?.toLowerCase() === lower;
  });
}

/**
 * Refuse a name a sign-in cannot take here: `INVALID_ARGS` when it is shaped like an account id
 * (names and account ids share the store's keys and `--agent`), `NAME_TAKEN` when another sign-in
 * holds it (see `nameClashes`). `rip auth login` passes the account it signed in to, so a sign-in
 * of that account and name is replaced; `rip auth add` passes none, so any stored name is taken.
 */
export function assertSignInNameFree(store: IdentityStore, name: string, sameAccount?: string): void {
  if (looksLikeAccountId(name)) {
    throw new CliError('INVALID_ARGS', `"${name}" is shaped like an account id. Name the sign-in after the agent instead, such as \`--name grok-napoleon\`.`);
  }
  if (/\s/.test(name) || name.length === 0) {
    throw new CliError('INVALID_ARGS', `A sign-in name has no spaces, so \`rip --agent <name>\` works unquoted: use \`${slugSignInName(name)}\`, for example.`);
  }
  if (nameClashes(store, name, sameAccount)) {
    throw new CliError('NAME_TAKEN', `Another sign-in on this computer is already called "${name}".`);
  }
}

/**
 * `base`, or `base-2`, `base-3`… : the first that clashes with no stored sign-in and none of
 * `reserved` (names this run has already given out). A base shaped like an account id becomes `agent`.
 */
export function uniqueSignInName(store: IdentityStore, base: string, reserved: string[] = []): string {
  const root = looksLikeAccountId(base) ? 'agent' : base;
  const taken = (name: string) =>
    nameClashes(store, name) || reserved.some((r) => r.toLowerCase() === name.toLowerCase());
  let name = root;
  for (let n = 2; taken(name); n++) name = `${root}-${n}`;
  return name;
}

/**
 * A server's key name (free text, such as "Claude Code") as a sign-in name: lowercase, each run of
 * other characters one `-`, the ends trimmed, at most 32 characters (the backend's
 * `normalizeSurface`); `agent` when nothing is left.
 */
export function slugSignInName(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return slug || 'agent';
}

/** What `rip auth login` saves, decided from network reads made before the write. */
export interface SignInCommit {
  accountId: string;
  apiKey: string;
  /** `--name`, as given. */
  name?: string;
  /** The new key's server name, when no `--name` was given. */
  serverName?: string;
  /** The sign-in this one replaces, as stored before the login began (its store key and key). */
  replaces?: { key: string; apiKey: string };
  /** The account's unnamed sign-ins to name, as stored before the login began, with their keys' server names. */
  nameSiblings?: Array<{ key: string; apiKey: string; serverName: string }>;
}

export interface SignInCommitted {
  /** The new sign-in's store key, now the current pointer. */
  key: string;
  name?: string;
  /** The sign-in replaced, whose old key the caller may revoke. */
  replaced?: StoredIdentity;
  /** How the account's other sign-ins here are shown. */
  siblings: string[];
}

/**
 * Name each unnamed sign-in of `accountId` that is still as it was read (same account and key)
 * after its key's server name, unique here and among `given` (which gains each name), and move the
 * current pointer with it. In place, on a store and config the caller then writes.
 */
export function nameUnnamedSiblings(
  store: IdentityStore,
  config: TokenripConfig,
  accountId: string,
  siblings: ReadonlyArray<{ key: string; apiKey: string; serverName: string }>,
  given: string[],
): void {
  for (const sibling of siblings) {
    const entry = store[sibling.key];
    if (!entry || entry.accountId !== accountId || entry.apiKey !== sibling.apiKey || entry.name !== undefined) continue;
    const name = uniqueSignInName(store, slugSignInName(sibling.serverName), given);
    delete store[sibling.key];
    store[name] = { ...entry, name };
    given.push(name);
    if (config.currentAccount === sibling.key) config.currentAccount = name;
    if (config.currentAgent === sibling.key) config.currentAgent = name;
  }
}

/**
 * Save a sign-in from one fresh read of the file and one write, with nothing awaited in between,
 * so a sign-in another agent wrote meanwhile is never overwritten, dropped or replaced:
 * - `--name` is checked again (`NAME_TAKEN`); a sign-in of that name that was not the one stored
 *   before the login began (it appeared meanwhile, or its key changed) is `NAME_TAKEN` too.
 * - A sign-in is replaced only while it is still the one in `replaces` (same account and key).
 *   Otherwise a login without `--name` adds a new name rather than replace another agent's.
 * - Each unnamed sibling still as it was is named (unique here) and the current pointer moves with
 *   it; then the pointer is set to the new sign-in.
 */
export function commitSignIn(commit: SignInCommit): SignInCommitted {
  const store = loadIdentities();
  const config = loadConfig();
  const unchanged = (entry: StoredIdentity | undefined, seen: { apiKey: string }): entry is StoredIdentity =>
    entry !== undefined && entry.accountId === commit.accountId && entry.apiKey === seen.apiKey;

  const replaced = commit.replaces && unchanged(store[commit.replaces.key], commit.replaces)
    ? store[commit.replaces.key]
    : undefined;
  const given: string[] = [];
  if (commit.name !== undefined) {
    assertSignInNameFree(store, commit.name, commit.accountId);
    const lower = commit.name.toLowerCase();
    const holder = Object.values(store).find((entry) => entry.name?.toLowerCase() === lower);
    if (holder && holder !== replaced) {
      throw new CliError('NAME_TAKEN', `Another sign-in on this computer is already called "${commit.name}".`);
    }
    given.push(commit.name);
  }

  nameUnnamedSiblings(store, config, commit.accountId, commit.nameSiblings ?? [], given);

  const name = commit.name
    ?? (replaced ? replaced.name : uniqueSignInName(store, slugSignInName(commit.serverName ?? ''), given));
  const target: StoredIdentity = {
    ...replaced,
    accountId: commit.accountId,
    publicKey: replaced?.publicKey ?? accountIdToPublicKey(commit.accountId),
    secretKey: replaced?.secretKey ?? '',
    apiKey: commit.apiKey,
    ...(name === undefined ? {} : { name }),
  };
  if (replaced) delete store[signInKey(replaced)];
  const key = signInKey(target);
  store[key] = target;
  saveIdentities(store);
  config.currentAccount = key;
  saveConfig(config);

  const siblings = signInsForAccount(store, commit.accountId)
    .filter((entry) => signInKey(entry) !== key)
    .map(signInLabel);
  return { key, ...(name === undefined ? {} : { name }), ...(replaced ? { replaced } : {}), siblings };
}

/**
 * Remove a stored identity: `target` is its store key, or a name, account id or alias. The last one is kept unless `allowLast` is set (`rip auth logout`
 * ends the only sign-in on purpose; `rip account remove` never does).
 */
export function removeIdentity(target: string, opts: { allowLast?: boolean } = {}): void {
  const store = loadIdentities();
  const key = Object.hasOwn(store, target) ? target : resolveSignIn(store, target);
  if (!key) {
    throw new CliError('IDENTITY_NOT_FOUND', `No local identity matching "${target}".`);
  }
  if (!opts.allowLast && Object.keys(store).length <= 1) {
    throw new CliError(
      'LAST_IDENTITY',
      'Cannot remove the last identity. Sign in to another account first: `rip auth login --email <your email>`.',
    );
  }
  delete store[key];
  saveIdentities(store);
}

/**
 * Clear the current pointer when it names this sign-in's store key. Both the current and the
 * deprecated field, so we never leave a dangling pointer on a v3 config that still has
 * `currentAgent` set or a pre-v3 config that's about to be migrated.
 */
export function clearCurrentAccount(key: string): void {
  const config = loadConfig();
  let changed = false;
  if (config.currentAccount === key) {
    delete config.currentAccount;
    changed = true;
  }
  if (config.currentAgent === key) {
    delete config.currentAgent;
    changed = true;
  }
  if (changed) saveConfig(config);
}

/**
 * The store key of the one sign-in `target` names: a name (case-insensitive), else an account id,
 * else a local alias; null when nothing matches. Several matches refuse `AMBIGUOUS_IDENTITY`.
 */
export function resolveSignIn(store: IdentityStore, target: string): string | null {
  const entries = Object.entries(store);
  const lower = target.toLowerCase();
  for (const matches of [
    entries.filter(([, identity]) => identity.name?.toLowerCase() === lower),
    entries.filter(([, identity]) => identity.accountId === target),
    entries.filter(([, identity]) => identity.alias === target),
  ]) {
    if (matches.length === 1) return matches[0][0];
    if (matches.length > 1) throw ambiguous(matches.map(([, identity]) => identity));
  }
  return null;
}

function ambiguous(signIns: StoredIdentity[]): CliError {
  const oneAccount = signIns.every((identity) => identity.accountId === signIns[0].accountId);
  const names = signIns
    .map((identity) => (oneAccount ? signInLabel(identity) : `${signInLabel(identity)} (${identity.accountId})`))
    .join(', ');
  return new CliError(
    'AMBIGUOUS_IDENTITY',
    oneAccount
      ? `Several agents use this account on this computer: ${names}. Run commands as \`rip --agent <your name> …\`.`
      : `Several sign-ins on this computer match: ${names}. Run commands as \`rip --agent <your name> …\`.`,
  );
}

/**
 * The sign-ins the config's current pointer names: its store key, or (an account id, from a config
 * written before names) every sign-in of that account.
 */
function pointedKeys(store: IdentityStore): string[] {
  const config = loadConfig();
  const pointer = config.currentAccount || config.currentAgent;
  if (!pointer) return [];
  if (Object.hasOwn(store, pointer)) return [pointer];
  return Object.keys(store).filter((key) => store[key].accountId === pointer);
}

/**
 * The store key of the sign-in a command without `--agent` uses: the current pointer, unless its
 * account has more than one sign-in here; else the only sign-in; else null.
 */
export function defaultSignInKey(store: IdentityStore): string | null {
  const [pointed] = pointedKeys(store);
  if (pointed && signInsForAccount(store, store[pointed].accountId).length === 1) return pointed;
  const keys = Object.keys(store);
  return keys.length === 1 ? keys[0] : null;
}

/**
 * Refuse a command that signs with the local Ed25519 key when the identity has none: an identity
 * that signed in by email (`rip auth login`) holds only an API key.
 */
export function requireLocalKeypair(identity: StoredIdentity, instead: string): void {
  if (!identity.secretKey) {
    throw new CliError('NO_LOCAL_KEYPAIR', `This identity signed in by email and has no local keypair. ${instead}`);
  }
}

/** @deprecated use resolveSignIn (kept for library callers; returns the store key, an account id for an unnamed sign-in) */
export const resolveAccountId = resolveSignIn;

/** @deprecated use resolveSignIn */
export const resolveAgentId = resolveSignIn;

let agentOverride: string | undefined;

export function setAgentOverride(value: string | undefined): void {
  agentOverride = value;
}

/**
 * The sign-in a command acts as: `--agent`, then `TOKENRIP_AGENT` (a name, account id or alias);
 * then the current sign-in unless its account has several here; then the only sign-in. Otherwise
 * it refuses `AMBIGUOUS_IDENTITY` rather than guess. (`TOKENRIP_API_KEY` bypasses all of this in
 * the auth client.)
 */
export function resolveCurrentIdentity(opts?: { agent?: string }): StoredIdentity {
  const store = loadIdentities();
  const entries = Object.values(store);

  if (entries.length === 0) {
    throw new CliError(
      'NO_IDENTITY',
      'No account identity found. Sign in with your email: `rip auth login --email <your email>`.',
    );
  }

  const override = opts?.agent || agentOverride;
  if (override) {
    const key = resolveSignIn(store, override);
    if (!key) {
      throw new CliError(
        'IDENTITY_NOT_FOUND',
        `No local identity matching "${override}". Run \`rip account list\` to see available accounts.`,
      );
    }
    return store[key];
  }

  const envAgent = process.env.TOKENRIP_AGENT;
  if (envAgent) {
    const key = resolveSignIn(store, envAgent);
    if (!key) {
      throw new CliError(
        'IDENTITY_NOT_FOUND',
        `TOKENRIP_AGENT="${envAgent}" does not match any local identity.`,
      );
    }
    return store[key];
  }

  const key = defaultSignInKey(store);
  if (key) return store[key];

  // The pointer's account has several sign-ins, or every sign-in here is one account's.
  const [pointed] = pointedKeys(store);
  const accountId = pointed ? store[pointed].accountId : entries[0].accountId;
  const siblings = signInsForAccount(store, accountId);
  if (pointed || siblings.length === entries.length) throw ambiguous(siblings);

  throw new CliError(
    'AMBIGUOUS_IDENTITY',
    'Multiple accounts configured. Use `rip account use <name>` to select one, or pass `--agent <name>`.',
  );
}
