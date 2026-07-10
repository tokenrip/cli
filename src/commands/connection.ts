import fs from 'node:fs';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { resolveTeam } from '../teams.js';
import { formatConnection, formatConnectionList } from '../formatters.js';

export interface ConnectionSecretOptions {
  secret?: string;
  secretEnv?: string;
  secretStdin?: boolean;
}

export interface ConnectionCreateOptions extends ConnectionSecretOptions {
  team?: string;
  name: string;
  baseUrl: string;
  authType: string;
  authHeaderName?: string;
  allowedPaths?: string;
  header?: string[];
  query?: string[];
  rateLimitPerMin?: string;
  dailyQuota?: string;
}

/** Route to the personal or team connection collection. */
function connectionsBase(team?: string): string {
  return team ? `/v0/teams/${encodeURIComponent(resolveTeam(team))}/connections` : '/v0/connections';
}

/** Resolve the secret from a literal, an env var, or stdin (never from argv history). */
function resolveSecret(o: ConnectionSecretOptions): string {
  if (o.secret) return o.secret;
  if (o.secretEnv) {
    const v = process.env[o.secretEnv];
    if (!v) throw new CliError('MISSING_SECRET', `Environment variable ${o.secretEnv} is empty or unset.`);
    return v;
  }
  if (o.secretStdin) {
    const v = fs.readFileSync(0, 'utf8').trim();
    if (!v) throw new CliError('MISSING_SECRET', 'No secret received on stdin.');
    return v;
  }
  throw new CliError(
    'MISSING_SECRET',
    'Provide the secret with --secret <value>, --secret-env <VAR>, or --secret-stdin.',
  );
}

/** Parse repeatable `--header k=v` / `--query k=v` flags into a flat map. */
function parseKvList(items: string[] | undefined, flag: string): Record<string, string> | undefined {
  if (!items || items.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const item of items) {
    const eq = item.indexOf('=');
    if (eq < 0) throw new CliError('INVALID_KV', `${flag} expects key=value, got "${item}".`);
    out[item.slice(0, eq).trim()] = item.slice(eq + 1);
  }
  return out;
}

export async function connectionCreate(options: ConnectionCreateOptions): Promise<void> {
  const { client } = requireAuthClient();
  const secret = resolveSecret(options);
  const body: Record<string, unknown> = {
    name: options.name,
    baseUrl: options.baseUrl,
    authType: options.authType,
    secret,
  };
  if (options.authHeaderName) body.authHeaderName = options.authHeaderName;
  if (options.allowedPaths) {
    body.allowedPaths = options.allowedPaths.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const defaultHeaders = parseKvList(options.header, '--header');
  if (defaultHeaders) body.defaultHeaders = defaultHeaders;
  const defaultQuery = parseKvList(options.query, '--query');
  if (defaultQuery) body.defaultQuery = defaultQuery;
  if (options.rateLimitPerMin !== undefined) body.rateLimitPerMin = Number(options.rateLimitPerMin);
  if (options.dailyQuota !== undefined) body.dailyQuota = Number(options.dailyQuota);
  const { data } = await client.post(connectionsBase(options.team), body);
  outputSuccess(data.data, formatConnection);
}

export async function connectionList(options: { team?: string; includeDisabled?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const q = options.includeDisabled ? '?include_disabled=true' : '';
  const { data } = await client.get(`${connectionsBase(options.team)}${q}`);
  outputSuccess(data.data, formatConnectionList);
}

export async function connectionGet(id: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`${connectionsBase(options.team)}/${encodeURIComponent(id)}`);
  outputSuccess(data.data, formatConnection);
}

export async function connectionRotate(id: string, options: ConnectionSecretOptions & { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const secret = resolveSecret(options);
  const { data } = await client.post(
    `${connectionsBase(options.team)}/${encodeURIComponent(id)}/rotate-secret`,
    { secret },
  );
  outputSuccess(data.data, formatConnection);
}

export async function connectionDisable(id: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`${connectionsBase(options.team)}/${encodeURIComponent(id)}/disable`);
  outputSuccess(data.data, formatConnection);
}

export async function connectionRemove(id: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  await client.delete(`${connectionsBase(options.team)}/${encodeURIComponent(id)}`);
  outputSuccess({ id, message: `Connection ${id} removed` });
}

export interface ConnectionCallOptions {
  mount: string;
  connection: string;
  method: string;
  path: string;
  body?: string;
  query?: string;
  header?: string[];
}

export async function connectionCall(options: ConnectionCallOptions): Promise<void> {
  const { client } = requireAuthClient();
  const payload: Record<string, unknown> = {
    connection: options.connection,
    method: options.method.toUpperCase(),
    path: options.path,
  };
  if (options.body !== undefined) {
    try {
      payload.body = JSON.parse(options.body);
    } catch {
      throw new CliError('INVALID_JSON', '--body is not valid JSON.');
    }
  }
  if (options.query !== undefined) {
    try {
      payload.query = JSON.parse(options.query);
    } catch {
      throw new CliError('INVALID_JSON', '--query is not valid JSON.');
    }
  }
  const headers = parseKvList(options.header, '--header');
  if (headers) payload.headers = headers;
  const { data } = await client.post(
    `/v0/mounts/${encodeURIComponent(options.mount)}/connection-call`,
    payload,
  );
  // Emit the upstream { status, headers, body, bodyIsJson, latencyMs } as bare
  // JSON in human mode so a skill can `JSON.parse(stdout)`; --json wraps it in
  // the standard { ok, data } envelope.
  outputSuccess(data.data, (d) => JSON.stringify(d));
}
