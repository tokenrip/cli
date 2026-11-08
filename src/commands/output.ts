import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatOutput, formatOutputList } from '../formatters.js';
import { labelFlags } from './task.js';

/**
 * `rip output record|update|list` over `/v0/outputs` (leverage plan M5): an output records something
 * an agent sent, posted or published outside Tokenrip, with or without a task. To send once only,
 * record it `--status sending` with a `--key`, send, then `rip output update <id> --status sent`.
 */

export interface OutputRecordOptions {
  workspaceId: string;
  kind: string;
  target?: string;
  ref?: string;
  text?: string;
  /** `<artifact>` or `<artifact>@<version>` (a number or a version id). */
  file?: string;
  task?: string;
  job?: string;
  label?: string[];
  status?: string;
  key?: string;
  audience?: string;
  why?: string;
}

export interface OutputUpdateOptions {
  status: string;
  ref?: string;
  text?: string;
  why?: string;
}

export interface OutputListOptions {
  workspaceId: string;
  job?: string;
  /** `--by-agent`: the handle (`--agent` is the CLI's global identity switch). */
  byAgent?: string;
  kind?: string;
  label?: string[];
  task?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: string;
  cursor?: string;
}

function invalid(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

function attribution(options: { why?: string }): Record<string, string> {
  return options.why !== undefined ? { why: options.why } : {};
}

/**
 * `--file <artifact>[@<version>]`: the artifact (an id or page URL, sent as given) and an optional
 * version after the last `@`, a whole number or a version id. A page URL's own `@` (none today) would
 * need the version form.
 */
export function fileFlag(raw: string): { artifact: string; version?: number | string } {
  const at = raw.lastIndexOf('@');
  if (at <= 0) return { artifact: raw };
  const artifact = raw.slice(0, at);
  const version = raw.slice(at + 1);
  if (/^[0-9]+$/.test(version)) return { artifact, version: Number(version) };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version)) return { artifact, version };
  throw invalid(`--file takes <artifact>[@<version>], the version a number or a version id; got "${raw}".`);
}

const outputPath = (id?: string) => (id ? `/v0/outputs/${encodeURIComponent(id)}` : '/v0/outputs');

export async function outputRecord(options: OutputRecordOptions): Promise<void> {
  const body: Record<string, unknown> = { workspaceId: options.workspaceId, kind: options.kind };
  for (const field of ['target', 'ref', 'text', 'task', 'job', 'status', 'key', 'audience'] as const) {
    if (options[field] !== undefined) body[field] = options[field];
  }
  if (options.file !== undefined) body.file = fileFlag(options.file);
  const labels = labelFlags(options.label);
  if (labels.length) body.labels = labels;
  const { client } = requireAuthClient();
  const { data } = await client.post(outputPath(), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatOutput);
}

export async function outputUpdate(id: string, options: OutputUpdateOptions): Promise<void> {
  const body: Record<string, unknown> = { status: options.status };
  if (options.ref !== undefined) body.ref = options.ref;
  if (options.text !== undefined) body.text = options.text;
  const { client } = requireAuthClient();
  const { data } = await client.patch(outputPath(id), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatOutput);
}

export async function outputList(options: OutputListOptions): Promise<void> {
  const q = new URLSearchParams({ workspaceId: options.workspaceId });
  for (const field of ['job', 'kind', 'task', 'status', 'since', 'until', 'limit', 'cursor'] as const) {
    if (options[field] !== undefined) q.set(field, options[field]!);
  }
  if (options.byAgent !== undefined) q.set('agent', options.byAgent);
  const labels = labelFlags(options.label);
  if (labels.length) q.set('labels', labels.join(','));
  const { client } = requireAuthClient();
  const { data } = await client.get(`${outputPath()}?${q}`);
  outputSuccess(data.data, formatOutputList);
}
