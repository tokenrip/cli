import fs from 'node:fs';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { resolveTeam } from '../teams.js';
import { formatCredential, formatCredentialList } from '../formatters.js';
import { resolveSecret, type ConnectionSecretOptions } from './connection.js';

/** Where a credential's material comes from: a literal, an env var, stdin, or a key file (Google). */
export interface CredentialMaterialOptions extends ConnectionSecretOptions {
  keyFile?: string;
}

export interface CredentialCreateOptions extends CredentialMaterialOptions {
  team?: string;
  name: string;
  kind?: string;
  scope?: string[];
}

export interface CredentialUpdateOptions {
  team?: string;
  name?: string;
  scope?: string[];
  restrict?: boolean;
  unrestrict?: boolean;
  user?: string[];
}

/** Route to the personal or team credential collection. */
function credentialsBase(team?: string): string {
  return team ? `/v0/teams/${encodeURIComponent(resolveTeam(team))}/credentials` : '/v0/credentials';
}

function credentialPath(id: string, team?: string): string {
  return `${credentialsBase(team)}/${encodeURIComponent(id)}`;
}

/**
 * The material sent as `secret`: a key file's text verbatim (a Google service-account key is sent
 * as its JSON text), else `--secret` / `--secret-env` / `--secret-stdin`. Exactly one source.
 */
function resolveMaterial(o: CredentialMaterialOptions): string {
  const sources = [o.secret, o.secretEnv, o.secretStdin, o.keyFile].filter((v) => v !== undefined && v !== false);
  if (sources.length === 0) {
    throw new CliError(
      'MISSING_SECRET',
      'Provide the key with --secret <value>, --secret-env <VAR>, --secret-stdin, or --key-file <path>.',
    );
  }
  if (sources.length > 1) {
    throw new CliError('INVALID_ARGS', 'Give the key one way: --secret, --secret-env, --secret-stdin or --key-file.');
  }
  if (o.keyFile === undefined) return resolveSecret(o);
  let text: string;
  try {
    text = fs.readFileSync(o.keyFile, 'utf8');
  } catch {
    throw new CliError('MISSING_SECRET', `Cannot read key file ${o.keyFile}.`);
  }
  if (!text.trim()) throw new CliError('MISSING_SECRET', `Key file ${o.keyFile} is empty.`);
  return text;
}

const nonEmpty = (list?: string[]): string[] | undefined => (list && list.length ? list : undefined);

export async function credentialCreate(options: CredentialCreateOptions): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { name: options.name };
  if (options.kind) body.kind = options.kind;
  body.secret = resolveMaterial(options);
  const scopes = nonEmpty(options.scope);
  if (scopes) body.scopes = scopes;
  const { data } = await client.post(credentialsBase(options.team), body);
  outputSuccess(data.data, formatCredential);
}

export async function credentialList(options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(credentialsBase(options.team));
  outputSuccess(data.data, formatCredentialList);
}

export async function credentialGet(id: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(credentialPath(id, options.team));
  outputSuccess(data.data, formatCredential);
}

/** Rename, set Google scopes, or name who may use a team credential. Never changes the key (rotate does). */
export async function credentialUpdate(id: string, options: CredentialUpdateOptions): Promise<void> {
  if (options.restrict && options.unrestrict) {
    throw new CliError('INVALID_ARGS', 'Give --restrict or --unrestrict, not both.');
  }
  const body: Record<string, unknown> = {};
  if (options.name !== undefined) body.name = options.name;
  const scopes = nonEmpty(options.scope);
  if (scopes) body.scopes = scopes;
  if (options.restrict) body.restricted = true;
  if (options.unrestrict) body.restricted = false;
  const users = nonEmpty(options.user);
  if (users) body.users = users;
  if (Object.keys(body).length === 0) {
    throw new CliError('MISSING_OPTION', 'Provide at least one option to update (--name, --scope, --restrict, --unrestrict, --user).');
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(credentialPath(id, options.team), body);
  outputSuccess(data.data, formatCredential);
}

/** New material of the same kind; every connection using the credential sends it from the next call. */
export async function credentialRotate(id: string, options: CredentialMaterialOptions & { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const secret = resolveMaterial(options);
  const { data } = await client.post(`${credentialPath(id, options.team)}/rotate`, { secret });
  outputSuccess(data.data, formatCredential);
}

/** Refused (`CREDENTIAL_IN_USE`) while any connection still uses it. */
export async function credentialRemove(id: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(credentialPath(id, options.team));
  outputSuccess({ id, message: `Credential ${id} removed` });
}
