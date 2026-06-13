import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { requireAuthClient } from '../auth-client.js';

export type CredFields = Record<string, string>;
export type CredStore = Record<string, CredFields>;

/** Options shared by every `cred` subcommand. */
export interface CredOptions {
  /**
   * Store the credential server-side (account-scoped) via the
   * `/v0/accounts/credentials/:kind` endpoints instead of the local
   * `~/.config/tokenrip/credentials.json` file.
   */
  server?: boolean;
}

/**
 * Path to the local credentials file.
 *
 * Honors `TOKENRIP_HOME` for tests and for operators who want to relocate the
 * config tree. Falls back to the user's home directory.
 */
export function credPath(): string {
  const home = process.env.TOKENRIP_HOME ?? os.homedir();
  return path.join(home, '.config', 'tokenrip', 'credentials.json');
}

export function readCreds(): CredStore {
  try {
    const raw = fs.readFileSync(credPath(), 'utf8');
    return JSON.parse(raw) as CredStore;
  } catch {
    return {};
  }
}

export function writeCreds(store: CredStore): void {
  const p = credPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), { mode: 0o600 });
  // Ensure mode is enforced even if the file already existed with broader bits.
  fs.chmodSync(p, 0o600);
}

/**
 * Convert a `--kebab-case` long-option name to a `camelCase` object key.
 *
 * Lowercased, with `-x` becoming `X`. Numerals are preserved untouched.
 * Used so that `--api-key` becomes `apiKey`.
 */
function flagToCamel(name: string): string {
  const lower = name.toLowerCase();
  return lower.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Convert a `--kebab-case` long-option name to a `snake_case` object key.
 *
 * Used in `--server` mode so the payload keys match the backend
 * `credentialSchema` (e.g. `--postmark-api-key` → `postmark_api_key`),
 * rather than the camelCase the local file uses.
 */
function flagToSnake(name: string): string {
  return name.toLowerCase().replace(/-/g, '_');
}

/**
 * Parse a raw argv tail (after `cred set <kind>`) into a flat `{key: value}`
 * map. Accepts:
 *
 *   --api-key=abc
 *   --api-key abc
 *
 * Field-name casing depends on the destination:
 *   - local (default): long-option names are camel-cased (`--api-key` → `apiKey`)
 *   - `--server`:       long-option names are snake-cased (`--api-key` → `api_key`)
 *     so they match the backend `credentialSchema` keys.
 *
 * Short options are not supported.
 */
export function parseFieldArgs(rawArgs: string[], opts: CredOptions = {}): CredFields {
  const fields: CredFields = {};
  const keyFor = opts.server ? flagToSnake : flagToCamel;
  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];
    if (!token.startsWith('--')) {
      throw new CliError(
        'INVALID_CRED_ARG',
        `Unexpected argument "${token}". Pass each field as --<name>=<value>.`,
      );
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    let name: string;
    let value: string;
    if (eq >= 0) {
      name = body.slice(0, eq);
      value = body.slice(eq + 1);
    } else {
      name = body;
      const next = rawArgs[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new CliError(
          'INVALID_CRED_ARG',
          `Missing value for --${name}. Use --${name}=<value>.`,
        );
      }
      value = next;
      i++;
    }
    if (!name) {
      throw new CliError('INVALID_CRED_ARG', `Empty field name in token "${token}".`);
    }
    fields[keyFor(name)] = value;
  }
  return fields;
}

export async function credSet(
  kind: string,
  rawArgs: string[],
  opts: CredOptions = {},
): Promise<void> {
  if (!kind) {
    throw new CliError('INVALID_CRED_ARG', 'Missing required <kind> argument.');
  }
  const fields = parseFieldArgs(rawArgs, opts);
  if (Object.keys(fields).length === 0) {
    throw new CliError(
      'INVALID_CRED_ARG',
      `No fields provided. Use \`rip cred set ${kind} --<field>=<value>\`.`,
    );
  }

  if (opts.server) {
    // Server-scoped (account) credential. Field keys are snake_case (see
    // parseFieldArgs) so the payload matches the backend `credentialSchema`.
    const { client } = requireAuthClient();
    await client.put(`/v0/accounts/credentials/${encodeURIComponent(kind)}`, { fields });
    outputSuccess({
      kind,
      fields: Object.keys(fields),
      scope: 'server',
      message: `Credential "${kind}" saved on the server`,
    });
    return;
  }

  const store = readCreds();
  store[kind] = { ...(store[kind] ?? {}), ...fields };
  writeCreds(store);
  outputSuccess({ kind, fields: Object.keys(fields), message: `Credential "${kind}" saved` });
}

export async function credGet(kind: string, opts: CredOptions = {}): Promise<void> {
  if (opts.server) {
    // The server never returns the secret value — only its presence. A 404
    // means "not configured"; surface it as a clean CRED_NOT_FOUND.
    const { client } = requireAuthClient();
    try {
      await client.get(`/v0/accounts/credentials/${encodeURIComponent(kind)}`);
    } catch (err: unknown) {
      if (isNotFound(err)) {
        throw new CliError('CRED_NOT_FOUND', `No "${kind}" credential configured on the server.`);
      }
      throw err;
    }
    // Mirror the local bare-JSON contract so scripts can `JSON.parse(stdout)`;
    // the server only knows existence, so we emit `{ configured: true }`.
    outputSuccess({ configured: true }, (data) => JSON.stringify(data));
    return;
  }

  const store = readCreds();
  const entry = store[kind];
  if (!entry) {
    throw new CliError('CRED_NOT_FOUND', `No credential stored for "${kind}".`);
  }
  // JSON mode (via TOKENRIP_OUTPUT=json or --json) gets the standard envelope
  // `{ok:true, data:{...}}` like every other command. In TTY/human mode we
  // print the bare JSON object so callers (and tests) can `JSON.parse(stdout)`.
  outputSuccess(entry, (data) => JSON.stringify(data));
}

export async function credList(opts: CredOptions = {}): Promise<void> {
  if (opts.server) {
    // There is no server-side list endpoint (Task 3 only exposes
    // PUT/GET/DELETE on a known :kind). Report cleanly rather than guessing a
    // route. Non-fatal — exit 0.
    outputSuccess(
      {
        kinds: [],
        scope: 'server',
        message:
          'Listing server credentials is not supported. Use `rip cred get <kind> --server` to check a specific kind.',
      },
      (data) => String(data.message),
    );
    return;
  }

  const store = readCreds();
  const kinds = Object.keys(store).sort();
  // JSON mode emits `{ok:true, data:{kinds:[...]}}`. TTY/human mode prints
  // one kind per line — keeps things grep-friendly and matches the existing
  // bare-list style used elsewhere in the CLI for human output.
  outputSuccess({ kinds }, (data) => (data.kinds as string[]).join('\n'));
}

export async function credUnset(kind: string, opts: CredOptions = {}): Promise<void> {
  if (opts.server) {
    // DELETE is idempotent server-side — no 404 on a missing credential.
    const { client } = requireAuthClient();
    await client.delete(`/v0/accounts/credentials/${encodeURIComponent(kind)}`);
    outputSuccess({ kind, scope: 'server', message: `Credential "${kind}" removed from the server` });
    return;
  }

  const store = readCreds();
  if (!(kind in store)) {
    throw new CliError('CRED_NOT_FOUND', `No credential stored for "${kind}".`);
  }
  delete store[kind];
  writeCreds(store);
  outputSuccess({ kind, message: `Credential "${kind}" removed` });
}

/**
 * Detect a backend 404 across both transports: the shared axios client wraps
 * the body's `error` code into a CliError (CREDENTIAL_NOT_FOUND), but a bare
 * 404 with no JSON `error` field surfaces as a raw axios error with
 * `response.status === 404`.
 */
function isNotFound(err: unknown): boolean {
  if (err instanceof CliError) {
    return err.code === 'CREDENTIAL_NOT_FOUND' || err.code === 'NOT_FOUND';
  }
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    return status === 404;
  }
  return false;
}
