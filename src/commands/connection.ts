import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { resolveTeam } from '../teams.js';
import {
  formatConnection, formatConnectionList, formatConnectionOperation, formatConnectionOperationList,
} from '../formatters.js';

export interface ConnectionSecretOptions {
  secret?: string;
  secretEnv?: string;
  secretStdin?: boolean;
}

export interface ConnectionCreateOptions extends ConnectionSecretOptions {
  team?: string;
  name: string;
  baseUrl: string;
  /** An existing credential of the same owner, by name or id; the server then defaults `authType` to bearer. */
  credential?: string;
  /** Required without `credential`: the placement of an inline secret. */
  authType?: string;
  authHeaderName?: string;
  allowedPaths?: string;
  header?: string[];
  query?: string[];
  rateLimitPerMin?: string;
  dailyQuota?: string;
}

/** `team` for a team's connections (a list or a create), or to scope a connection name. Local aliases resolve to the slug. */
function teamField(team?: string): { team?: string } {
  return team ? { team: resolveTeam(team) } : {};
}

/** One connection: its id (personal, or a team's you belong to), or its name (in `--team` when given). */
function connectionPath(connection: string): string {
  return `/v0/connections/${encodeURIComponent(connection)}`;
}

/** Resolve the secret from a literal, an env var, or stdin (never from argv history). */
export function resolveSecret(o: ConnectionSecretOptions): string {
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

/**
 * Attach an existing credential (`--credential`; the placement is optional and defaults to bearer
 * on the server) or create one inline from `--auth-type` and a secret, named after the connection.
 */
export async function connectionCreate(options: ConnectionCreateOptions): Promise<void> {
  const body: Record<string, unknown> = { name: options.name, baseUrl: options.baseUrl };
  if (options.credential !== undefined) {
    if (options.secret !== undefined || options.secretEnv !== undefined || options.secretStdin) {
      throw new CliError(
        'INVALID_ARGS',
        '--credential uses that credential\'s key; drop the secret flags (rotate the key with `rip credential rotate`).',
      );
    }
    body.credential = options.credential;
    if (options.authType) body.authType = options.authType;
  } else {
    if (!options.authType) {
      throw new CliError(
        'MISSING_OPTION',
        'Provide --credential <name|id> to use an existing credential, or --auth-type with a secret to create one.',
      );
    }
    body.authType = options.authType;
    body.secret = resolveSecret(options);
  }
  const { client } = requireAuthClient();
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
  const { data } = await client.post('/v0/connections', { ...teamField(options.team), ...body });
  outputSuccess(data.data, formatConnection);
}

export async function connectionList(options: { team?: string; includeDisabled?: boolean }): Promise<void> {
  const { client } = requireAuthClient();
  const params = { ...teamField(options.team), ...(options.includeDisabled ? { includeDisabled: 'true' } : {}) };
  const { data } = await client.get('/v0/connections', { params });
  outputSuccess(data.data, formatConnectionList);
}

export async function connectionGet(connection: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(connectionPath(connection), { params: teamField(options.team) });
  outputSuccess(data.data, formatConnection);
}

export async function connectionDisable(connection: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(`${connectionPath(connection)}/disable`, teamField(options.team));
  outputSuccess(data.data, formatConnection);
}

export async function connectionRemove(connection: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const body = teamField(options.team);
  await client.delete(connectionPath(connection), Object.keys(body).length ? { data: body } : {});
  // The reference as given (an id or a name), under its own key: a name never reads as an id.
  outputSuccess({ connection, message: `Connection ${connection} removed` });
}

export interface ConnectionCallOptions {
  /** Team slug or alias for a team connection; omit for a personal connection. */
  team?: string;
  connection: string;
  method: string;
  path: string;
  body?: string;
  query?: string;
  header?: string[];
}

/** A JSON flag's value, or `INVALID_JSON` naming the flag. */
function parseJson(text: string, flag: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError('INVALID_JSON', `${flag} is not valid JSON.`);
  }
}

/** JSON given inline (`--<flag>`) or in a file (`--<flag>-file`), at most one of the two. */
function jsonFrom(inline: string | undefined, file: string | undefined, flag: string): unknown {
  if (inline !== undefined && file !== undefined) {
    throw new CliError('INVALID_ARGS', `Give --${flag} or --${flag}-file, not both.`);
  }
  if (inline !== undefined) return parseJson(inline, `--${flag}`);
  if (file === undefined) return undefined;
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  return parseJson(fs.readFileSync(absPath, 'utf8'), `--${flag}-file`);
}

export async function connectionCall(options: ConnectionCallOptions): Promise<void> {
  const { client } = requireAuthClient();
  const payload: Record<string, unknown> = {
    connection: options.connection,
    method: options.method.toUpperCase(),
    path: options.path,
  };
  if (options.body !== undefined) payload.body = parseJson(options.body, '--body');
  if (options.query !== undefined) payload.query = parseJson(options.query, '--query');
  const headers = parseKvList(options.header, '--header');
  if (headers) payload.headers = headers;
  if (options.team) payload.team = resolveTeam(options.team);
  const { data } = await client.post('/v0/connections/call', payload);
  // Emit the upstream { status, headers, body, bodyIsJson, latencyMs } as bare
  // JSON in human mode so a skill can `JSON.parse(stdout)`; --json wraps it in
  // the standard { ok, data } envelope.
  outputSuccess(data.data, (d) => JSON.stringify(d));
}

// ── Operations: a connection's named calls (connection operations design §5.8) ──

/**
 * The declaration's flags. On `update` each is optional, and the `--no-*` forms arrive as `false`:
 * they clear the fixed body, the placements or the response pointer, and `--no-kind` sets no kinds.
 */
export interface ConnectionOperationOptions {
  team?: string;
  name?: string;
  title?: string;
  description?: string;
  method?: string;
  path?: string;
  inputSchema?: string;
  inputSchemaFile?: string;
  fixedBody?: string | false;
  place?: string[] | false;
  response?: string | false;
  kind?: string[] | false;
}

function operationsPath(connection: string, operation?: string): string {
  const base = `${connectionPath(connection)}/operations`;
  return operation === undefined ? base : `${base}/${encodeURIComponent(operation)}`;
}

/** The body fields the given flags name, in the contract's names (`connectionOperation.create` / `.update`). */
function operationFields(o: ConnectionOperationOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (o.name !== undefined) body.name = o.name;
  if (o.title !== undefined) body.title = o.title;
  if (o.description !== undefined) body.description = o.description;
  if (o.method !== undefined) body.method = o.method.toUpperCase();
  if (o.path !== undefined) body.path = o.path;
  const inputSchema = jsonFrom(o.inputSchema, o.inputSchemaFile, 'input-schema');
  if (inputSchema !== undefined) body.inputSchema = inputSchema;
  if (o.fixedBody === false) body.fixedBody = null;
  else if (o.fixedBody !== undefined) body.fixedBody = parseJson(o.fixedBody, '--fixed-body');
  if (o.place === false) body.placements = null;
  else {
    const placements = parseKvList(o.place, '--place');
    if (placements) body.placements = placements;
  }
  if (o.response === false) body.responsePointer = null;
  else if (o.response !== undefined) body.responsePointer = o.response;
  if (o.kind === false) body.kinds = [];
  else if (o.kind && o.kind.length) body.kinds = o.kind;
  return body;
}

/** Declare an operation on a connection (its writer: the personal owner, or a team connection's creator or the team owner). */
export async function connectionOperationAdd(connection: string, options: ConnectionOperationOptions): Promise<void> {
  const body = operationFields(options);
  const { client } = requireAuthClient();
  const { data } = await client.post(operationsPath(connection), { ...teamField(options.team), ...body });
  outputSuccess(data.data, formatConnectionOperation);
}

export async function connectionOperationList(connection: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(operationsPath(connection), { params: teamField(options.team) });
  outputSuccess(data.data, formatConnectionOperationList);
}

export async function connectionOperationGet(connection: string, operation: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(operationsPath(connection, operation), { params: teamField(options.team) });
  outputSuccess(data.data, formatConnectionOperation);
}

/** Change an operation; the server judges the result whole. */
export async function connectionOperationUpdate(
  connection: string,
  operation: string,
  options: ConnectionOperationOptions,
): Promise<void> {
  const body = operationFields(options);
  if (Object.keys(body).length === 0) {
    throw new CliError(
      'MISSING_OPTION',
      'Provide at least one option to update (--name, --title, --description, --method, --path, --input-schema, --fixed-body, --place, --response, --kind, or a --no-* form).',
    );
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(operationsPath(connection, operation), { ...teamField(options.team), ...body });
  outputSuccess(data.data, formatConnectionOperation);
}

export async function connectionOperationRemove(connection: string, operation: string, options: { team?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const body = teamField(options.team);
  await client.delete(operationsPath(connection, operation), Object.keys(body).length ? { data: body } : {});
  // The references as given, as `connection rm` echoes them.
  outputSuccess({ connection, operation, message: `Operation ${operation} removed from ${connection}` });
}

/** Call an operation by name with its input (`--input` or `--input-file`); the server checks the input against its schema. */
export async function connectionRun(
  connection: string,
  operation: string,
  options: { team?: string; input?: string; inputFile?: string },
): Promise<void> {
  const input = jsonFrom(options.input, options.inputFile, 'input');
  const { client } = requireAuthClient();
  const payload: Record<string, unknown> = { ...teamField(options.team) };
  if (input !== undefined) payload.input = input;
  const { data } = await client.post(`${operationsPath(connection, operation)}/call`, payload);
  // `{ status, body }` as bare JSON in human mode, as `connection call` prints, so a skill can
  // `JSON.parse(stdout)`; --json wraps it in the standard { ok, data } envelope.
  outputSuccess(data.data, (d) => JSON.stringify(d));
}
