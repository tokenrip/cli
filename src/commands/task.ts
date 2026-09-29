import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatTask, formatTaskList } from '../formatters.js';

export interface TaskListOptions {
  /** Required: every task lives in a workspace. */
  workspaceId: string;
  status?: string;
  kind?: string;
  mine?: boolean;
  since?: string;
  limit?: string;
  cursor?: string;
}

export interface TaskAddOptions {
  /** Required: every task lives in a workspace. */
  workspaceId: string;
  assignee?: string;
  kind?: string;
  body?: string;
  due?: string;
  payload?: string;
  audience?: 'internal' | 'shared';
  workspaceSessionId?: string;
}

export interface TaskUpdateOptions {
  expectedRevision: string;
  title?: string;
  body?: string;
  assignee?: string;
  audience?: 'internal' | 'shared';
  workspaceSessionId?: string;
}

function path(id?: string, verb?: string): string {
  let p = '/v0/tasks';
  if (id) p += `/${encodeURIComponent(id)}`;
  if (verb) p += `/${verb}`;
  return p;
}

export async function taskList(options: TaskListOptions): Promise<void> {
  const { client } = requireAuthClient();
  const q = new URLSearchParams();
  q.set('workspaceId', options.workspaceId);
  if (options.status) q.set('status', options.status);
  if (options.kind) q.set('kind', options.kind);
  if (options.mine) q.set('assignee', 'me');
  if (options.since) q.set('since', options.since);
  if (options.limit) q.set('limit', options.limit);
  if (options.cursor) q.set('cursor', options.cursor);
  const qs = q.toString();
  const { data } = await client.get(`${path()}${qs ? `?${qs}` : ''}`);
  outputSuccess(data.data, formatTaskList);
}

export async function taskShow(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(path(id));
  outputSuccess(data.data, formatTask);
}

export async function taskAdd(title: string, options: TaskAddOptions): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { title, workspaceId: options.workspaceId };
  if (options.audience) body.audience = options.audience;
  if (options.workspaceSessionId) body.workspaceSessionId = options.workspaceSessionId;
  // Account ids and aliases pass through; the server resolves them.
  if (options.assignee) body.assignee = options.assignee;
  if (options.kind) body.kind = options.kind;
  if (options.body) body.body = options.body;
  if (options.due) body.due = options.due;
  if (options.payload !== undefined) {
    try {
      body.payload = JSON.parse(options.payload);
    } catch {
      throw new CliError('INVALID_JSON', '--payload is not valid JSON.');
    }
  }
  const { data } = await client.post(path(), body);
  outputSuccess(data.data, formatTask);
}

export async function taskUpdate(id: string, options: TaskUpdateOptions): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { expectedRevision: Number(options.expectedRevision) };
  if (options.title !== undefined) body.title = options.title;
  if (options.body !== undefined) body.body = options.body;
  if (options.assignee !== undefined) body.assignee = options.assignee;
  if (options.audience !== undefined) body.audience = options.audience;
  if (options.workspaceSessionId !== undefined) body.workspaceSessionId = options.workspaceSessionId;
  const { data } = await client.patch(path(id), body);
  outputSuccess(data.data, formatTask);
}

export async function taskClaim(id: string, options: { leaseHours?: string; workspaceSessionId?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const body = { ...(options.leaseHours !== undefined ? { leaseHours: Number(options.leaseHours) } : {}), ...(options.workspaceSessionId ? { workspaceSessionId: options.workspaceSessionId } : {}) };
  const { data } = await client.post(path(id, 'claim'), body);
  outputSuccess(data.data, formatTask);
}

export async function taskTouch(id: string, options: { leaseHours?: string; workspaceSessionId?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const body = { ...(options.leaseHours !== undefined ? { leaseHours: Number(options.leaseHours) } : {}), ...(options.workspaceSessionId ? { workspaceSessionId: options.workspaceSessionId } : {}) };
  const { data } = await client.post(path(id, 'touch'), body);
  outputSuccess(data.data, formatTask);
}

export async function taskRelease(id: string, options: { workspaceSessionId?: string } = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(path(id, 'release'), options);
  outputSuccess(data.data, formatTask);
}

/** `--result artifact:<publicId>[@<version>]` or `--result url:<https://…>` (repeatable). */
export function parseResultFlags(raw: string[] | undefined): Array<{ type: string; id: string; version?: number }> {
  return (raw ?? []).map((item) => {
    const colon = item.indexOf(':');
    if (colon < 1) throw new CliError('INVALID_RESULT', `--result expects type:id, got "${item}".`);
    const type = item.slice(0, colon);
    let id = item.slice(colon + 1);
    let version: number | undefined;
    if (type === 'artifact') {
      const at = id.lastIndexOf('@');
      if (at > 0) {
        version = Number(id.slice(at + 1));
        id = id.slice(0, at);
        if (!Number.isInteger(version) || version < 1) throw new CliError('INVALID_RESULT', `Bad version in "${item}".`);
      }
    }
    if (type !== 'artifact' && type !== 'url') throw new CliError('INVALID_RESULT', `--result type must be artifact or url, got "${type}".`);
    return version === undefined ? { type, id } : { type, id, version };
  });
}

export async function taskDone(id: string, options: { result?: string[]; workspaceSessionId?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const results = parseResultFlags(options.result);
  const { data } = await client.post(path(id, 'complete'), { ...(results.length ? { results } : {}), ...(options.workspaceSessionId ? { workspaceSessionId: options.workspaceSessionId } : {}) });
  outputSuccess(data.data, formatTask);
}

export async function taskDismiss(id: string, options: { reason?: string; workspaceSessionId?: string }): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(path(id, 'dismiss'), { ...(options.reason ? { reason: options.reason } : {}), ...(options.workspaceSessionId ? { workspaceSessionId: options.workspaceSessionId } : {}) });
  outputSuccess(data.data, formatTask);
}

export async function taskReopen(id: string, options: { workspaceSessionId?: string } = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(path(id, 'reopen'), options);
  outputSuccess(data.data, formatTask);
}
