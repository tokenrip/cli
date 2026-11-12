import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatJob, formatJobList } from '../formatters.js';
import { parseRevision } from './task.js';

/**
 * `rip job create|update|delete|show|list` over `/v0/jobs` (leverage plan M3): a job is named standing work
 * in a workspace, with a description its agents read and the agents who do it, each with an
 * optional role. Every member reads them.
 *
 * A job's agents are `--job-agent` (repeatable): `--agent` stays the CLI's global identity flag.
 *
 * Job definitions plan M3: `--purpose` (one line) and `--definitions <json | @file>`, the job's task
 * definitions sent whole as given (the server judges them; an update replaces the whole set).
 */

/** One of a job's agents as the API takes it. */
export interface JobAgentBody {
  agent: string;
  role?: string;
}

export interface JobAgentOptions {
  /** Every `--job-agent` given, in order: `<handle>`, `agent:<handle>`, or either with `:<role>`. */
  jobAgent?: string[];
  /** The role of the one `--job-agent` given. */
  role?: string;
}

export interface JobCreateOptions extends JobAgentOptions {
  workspaceId: string;
  name: string;
  purpose?: string;
  description?: string;
  /** A JSON array, or `@<file>` holding one. */
  definitions?: string;
  why?: string;
}

export interface JobUpdateOptions extends JobAgentOptions {
  expectedRevision: string;
  name?: string;
  /** New text (empty clears it), or `false` (`--no-purpose`) to clear it. */
  purpose?: string | false;
  /** New text, or `false` (`--no-description`) to clear it. */
  description?: string | false;
  /** A JSON array, or `@<file>` holding one: the whole new set. */
  definitions?: string;
  /** `false` (`--no-agents`): the job has no agents. */
  agents?: boolean;
  archive?: boolean;
  restore?: boolean;
  why?: string;
}

function invalid(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

function attribution(options: { why?: string }): Record<string, string> {
  return options.why !== undefined ? { why: options.why } : {};
}

/** One `--job-agent`: the handle (bare or `agent:<handle>`, sent as given), then an optional `:<role>`. */
function agentFlag(raw: string): JobAgentBody & { inline: boolean } {
  const prefix = raw.startsWith('agent:') ? 'agent:' : '';
  const [handle, role, ...rest] = raw.slice(prefix.length).split(':');
  if (!handle || rest.length) throw invalid(`--job-agent takes <handle>[:<role>], got "${raw}".`);
  const entry: JobAgentBody & { inline: boolean } = { agent: `${prefix}${handle}`, inline: role !== undefined };
  if (role) entry.role = role;
  return entry;
}

/**
 * The job's agents from `--job-agent` (repeatable), with `--role` for a single one; with several, each
 * carries its own inline. Undefined when no `--job-agent` was given.
 */
export function jobAgents(options: JobAgentOptions): JobAgentBody[] | undefined {
  const given = options.jobAgent ?? [];
  const separate = options.role !== undefined;
  if (!given.length) {
    if (separate) throw invalid('--role belongs to an agent: give --job-agent <handle> with it.');
    return undefined;
  }
  const parsed = given.map(agentFlag);
  if (separate) {
    if (parsed.length > 1) throw invalid('With more than one --job-agent, give each its role inline: --job-agent <handle>:<role>.');
    if (parsed[0]!.inline) throw invalid('Give the role inline (--job-agent <handle>:<role>) or with --role, not both.');
    parsed[0]!.role = options.role;
  }
  return parsed.map(({ inline: _inline, ...entry }) => entry);
}

/**
 * `--definitions`: a JSON array given inline or, as `@<file>`, in a file, sent as it is. Not JSON is
 * `INVALID_JSON`, a missing file `FILE_NOT_FOUND`, and anything but an array `INVALID_ARGUMENT`.
 */
export function definitionsFlag(raw: string): unknown[] {
  let text = raw;
  if (raw.startsWith('@')) {
    const absPath = path.resolve(raw.slice(1));
    if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
    text = fs.readFileSync(absPath, 'utf8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliError('INVALID_JSON', '--definitions is not valid JSON.');
  }
  if (!Array.isArray(parsed)) throw invalid('--definitions takes a JSON array of definitions ([] for none): [{ "name", "types", "instructions"?, "steps" }].');
  return parsed;
}

const jobPath = (id?: string) => (id ? `/v0/jobs/${encodeURIComponent(id)}` : '/v0/jobs');

export async function jobCreate(options: JobCreateOptions): Promise<void> {
  const agents = jobAgents(options);
  const definitions = options.definitions === undefined ? undefined : definitionsFlag(options.definitions);
  const body: Record<string, unknown> = { workspaceId: options.workspaceId, name: options.name };
  if (options.purpose !== undefined) body.purpose = options.purpose;
  if (options.description !== undefined) body.description = options.description;
  if (agents) body.agents = agents;
  if (definitions) body.definitions = definitions;
  const { client } = requireAuthClient();
  const { data } = await client.post(jobPath(), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatJob);
}

export async function jobUpdate(id: string, options: JobUpdateOptions): Promise<void> {
  if (options.archive && options.restore) throw invalid('Give --archive or --restore, not both.');
  if (options.agents === false && options.jobAgent?.length) throw invalid('Give --job-agent (the whole new set) or --no-agents (none), not both.');
  const agents = jobAgents(options);
  const definitions = options.definitions === undefined ? undefined : definitionsFlag(options.definitions);
  const body: Record<string, unknown> = { expectedRevision: parseRevision(options.expectedRevision, 'rip job show <id>') };
  if (options.name !== undefined) body.name = options.name;
  if (options.purpose !== undefined) body.purpose = options.purpose === false ? null : options.purpose;
  if (options.description !== undefined) body.description = options.description === false ? null : options.description;
  if (agents) body.agents = agents;
  if (options.agents === false) body.agents = [];
  if (definitions) body.definitions = definitions;
  if (options.archive) body.archived = true;
  if (options.restore) body.archived = false;
  const { client } = requireAuthClient();
  const { data } = await client.patch(jobPath(id), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatJob);
}

/** `rip job delete <id>`: the job is removed. Its tasks stay and no longer belong to it. */
export async function jobDelete(id: string, options: { expectedRevision: string; why?: string }): Promise<void> {
  const body = { expectedRevision: parseRevision(options.expectedRevision, 'rip job show <id>'), ...attribution(options) };
  const { client } = requireAuthClient();
  const { data } = await client.delete(jobPath(id), { data: body });
  outputSuccess(data.data, (receipt) => `Job deleted. ${receipt.tasks} tasks no longer belong to it.`);
}

export async function jobShow(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(jobPath(id));
  outputSuccess(data.data, formatJob);
}

export async function jobList(options: { workspaceId: string; archived?: boolean }): Promise<void> {
  const q = new URLSearchParams({ workspaceId: options.workspaceId });
  if (options.archived) q.set('archived', 'true');
  const { client } = requireAuthClient();
  const { data } = await client.get(`${jobPath()}?${q}`);
  outputSuccess(data.data, formatJobList);
}
