import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';

export type CredFields = Record<string, string>;
export type CredStore = Record<string, CredFields>;

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
 * Parse a raw argv tail (after `cred set <kind>`) into a flat `{key: value}`
 * map. Accepts:
 *
 *   --api-key=abc
 *   --api-key abc
 *
 * Long-option names are camel-cased; short options are not supported.
 */
export function parseFieldArgs(rawArgs: string[]): CredFields {
  const fields: CredFields = {};
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
    fields[flagToCamel(name)] = value;
  }
  return fields;
}

export async function credSet(kind: string, rawArgs: string[]): Promise<void> {
  if (!kind) {
    throw new CliError('INVALID_CRED_ARG', 'Missing required <kind> argument.');
  }
  const fields = parseFieldArgs(rawArgs);
  if (Object.keys(fields).length === 0) {
    throw new CliError(
      'INVALID_CRED_ARG',
      `No fields provided. Use \`rip cred set ${kind} --<field>=<value>\`.`,
    );
  }
  const store = readCreds();
  store[kind] = { ...(store[kind] ?? {}), ...fields };
  writeCreds(store);
  outputSuccess({ kind, fields: Object.keys(fields), message: `Credential "${kind}" saved` });
}

export async function credGet(kind: string): Promise<void> {
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

export async function credList(): Promise<void> {
  const store = readCreds();
  const kinds = Object.keys(store).sort();
  // JSON mode emits `{ok:true, data:{kinds:[...]}}`. TTY/human mode prints
  // one kind per line — keeps things grep-friendly and matches the existing
  // bare-list style used elsewhere in the CLI for human output.
  outputSuccess({ kinds }, (data) => (data.kinds as string[]).join('\n'));
}

export async function credUnset(kind: string): Promise<void> {
  const store = readCreds();
  if (!(kind in store)) {
    throw new CliError('CRED_NOT_FOUND', `No credential stored for "${kind}".`);
  }
  delete store[kind];
  writeCreds(store);
  outputSuccess({ kind, message: `Credential "${kind}" removed` });
}
