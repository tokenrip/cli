import fs from 'node:fs';
import path from 'node:path';
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
  /** `created` (default) or `finished` (done and cancelled only). */
  order?: string;
  /** `me`: reviews In review addressed to you. */
  reviewer?: string;
  /** Only this task's children. */
  parent?: string;
}

export interface TaskAddOptions {
  /** Required: every task lives in a workspace. */
  workspaceId: string;
  /** A person (account id or alias) or `agent:<handle>`, a handle from `rip workspace load`. */
  assignee?: string;
  /** Who decides its proposal, named as the assignee is; never the assignee. */
  reviewer?: string;
  /** A task in the same workspace this one belongs under. */
  parent?: string;
  kind?: string;
  body?: string;
  due?: string;
  payload?: string;
  audience?: 'internal' | 'shared';
  why?: string;
}

export interface TaskUpdateOptions {
  expectedRevision: string;
  title?: string;
  body?: string;
  assignee?: string;
  reviewer?: string;
  audience?: 'internal' | 'shared';
  why?: string;
}

/** The task write field every verb shares: why. */
export interface TaskWriteOptions {
  why?: string;
}

function attribution(options: TaskWriteOptions): Record<string, string> {
  return options.why !== undefined ? { why: options.why } : {};
}

function taskPath(id?: string, verb?: string): string {
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
  if (options.order) q.set('order', options.order);
  if (options.reviewer) q.set('reviewer', options.reviewer);
  if (options.parent) q.set('parentId', options.parent);
  const qs = q.toString();
  const { data } = await client.get(`${taskPath()}${qs ? `?${qs}` : ''}`);
  outputSuccess(data.data, formatTaskList);
}

export async function taskShow(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(taskPath(id));
  outputSuccess(data.data, formatTask);
}

export async function taskAdd(title: string, options: TaskAddOptions): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { title, workspaceId: options.workspaceId };
  if (options.audience) body.audience = options.audience;
  if (options.why !== undefined) body.why = options.why;
  // Account ids, aliases and agent:<handle> pass through; the server resolves them.
  if (options.assignee) body.assignee = options.assignee;
  if (options.reviewer) body.reviewer = options.reviewer;
  if (options.parent) body.parentId = options.parent;
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
  const { data } = await client.post(taskPath(), body);
  outputSuccess(data.data, formatTask);
}

/** `--expected-revision`: the revision read, a decimal whole number of at least 1 (never `0x3` or `1.5`). */
export function parseRevision(value: string): number {
  const revision = /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(revision)) {
    throw new CliError('INVALID_ARGUMENT', `--expected-revision must be a whole number of at least 1: the revision you read (rip task show <id>), got "${value}".`);
  }
  return revision;
}

export async function taskUpdate(id: string, options: TaskUpdateOptions): Promise<void> {
  const expectedRevision = parseRevision(options.expectedRevision);
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { expectedRevision };
  if (options.title !== undefined) body.title = options.title;
  if (options.body !== undefined) body.body = options.body;
  if (options.assignee !== undefined) body.assignee = options.assignee;
  if (options.reviewer !== undefined) body.reviewer = options.reviewer;
  if (options.audience !== undefined) body.audience = options.audience;
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.patch(taskPath(id), body);
  outputSuccess(data.data, formatTask);
}

/** Start a free task, or renew your own hold (an agent's lease; never shorter). */
export async function taskStart(id: string, options: { leaseHours?: string } & TaskWriteOptions): Promise<void> {
  const { client } = requireAuthClient();
  const body = { ...(options.leaseHours !== undefined ? { leaseHours: Number(options.leaseHours) } : {}), ...attribution(options) };
  const { data } = await client.post(taskPath(id, 'start'), body);
  outputSuccess(data.data, formatTask);
}

/** Put a task you hold back in To do. */
export async function taskStop(id: string, options: TaskWriteOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'stop'), attribution(options));
  outputSuccess(data.data, formatTask);
}

/** `--result artifact:<publicId>[@<version>]` or `--result url:<https://…>` (repeatable); `--link` takes the same. */
export function parseResultFlags(raw: string[] | undefined, flag = '--result'): Array<{ type: string; id: string; version?: number }> {
  return (raw ?? []).map((item) => {
    const colon = item.indexOf(':');
    if (colon < 1) throw new CliError('INVALID_RESULT', `${flag} expects type:id, got "${item}".`);
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
    if (type !== 'artifact' && type !== 'url') throw new CliError('INVALID_RESULT', `${flag} type must be artifact or url, got "${type}".`);
    return version === undefined ? { type, id } : { type, id, version };
  });
}

/** Complete with what the work produced: links (`--result`) and what came of it (`--result-text`, at most 280 characters). */
export async function taskDone(id: string, options: { result?: string[]; resultText?: string } & TaskWriteOptions): Promise<void> {
  const { client } = requireAuthClient();
  const results = parseResultFlags(options.result);
  const body = { ...(results.length ? { results } : {}), ...(options.resultText !== undefined ? { result: options.resultText } : {}), ...attribution(options) };
  const { data } = await client.post(taskPath(id, 'complete'), body);
  outputSuccess(data.data, formatTask);
}

/** Won't do: To do or Doing → Cancelled (reopenable). */
export async function taskCancel(id: string, options: { reason?: string } & TaskWriteOptions): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'cancel'), { ...(options.reason ? { reason: options.reason } : {}), ...attribution(options) });
  outputSuccess(data.data, formatTask);
}

export async function taskReopen(id: string, options: TaskWriteOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'reopen'), attribution(options));
  outputSuccess(data.data, formatTask);
}

function invalid(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

/** Text given inline or read from a file, at most one of the two; a file is read verbatim, as the exact text. */
function textFrom(inline: string | undefined, file: string | undefined, flag: string): string | undefined {
  if (inline !== undefined && file !== undefined) throw invalid(`Give --${flag} or --${flag}-file, not both.`);
  if (file === undefined) return inline;
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
  return fs.readFileSync(absPath, 'utf-8');
}

/** The fields only a new task takes; on an existing task each is refused before any request. */
function newTaskFields(id: string | undefined, options: Record<string, unknown>, fields: Record<string, string>, verb: string): void {
  if (id === undefined) {
    if (!options.workspaceId || !options.title) {
      throw invalid(`A new ${verb} needs --workspace-id and --title; to ${verb} on an existing task, pass its id.`);
    }
    return;
  }
  const given = Object.entries(fields).filter(([key]) => options[key] !== undefined).map(([, flag]) => flag);
  if (given.length) throw invalid(`${given.join(', ')} ${given.length === 1 ? 'is' : 'are'} for a new task only; an existing task keeps its own.`);
}

export interface TaskProposeOptions extends TaskWriteOptions {
  /** A new proposal: the workspace and the title. */
  workspaceId?: string;
  title?: string;
  body?: string;
  audience?: 'internal' | 'shared';
  parent?: string;
  /** The exact text the action uses: inline, or read from a file. */
  draft?: string;
  draftFile?: string;
  /** The approve button's verb ("Post"); "Approve" without it. */
  verb?: string;
  kind?: string;
  /** Whom the review is addressed to; your own person when neither you nor the task names one. */
  reviewer?: string;
  /** `artifact:<publicId>[@version]` or `url:<https://…>`, repeatable. */
  link?: string[];
}

/**
 * Propose an action before it leaves the workspace (feed, review and instructions design §5.7): a new
 * task In review, or a proposal on a task that is free or yours (replacing your own proposal's draft).
 * The reply is In review (stop: it comes back to you), or doing and approved when your instructions
 * allow its kind (carry out its approved text now).
 */
export async function taskPropose(id: string | undefined, options: TaskProposeOptions): Promise<void> {
  newTaskFields(id, options as Record<string, unknown>, { title: '--title', workspaceId: '--workspace-id', parent: '--parent', audience: '--audience', body: '--body' }, 'proposal');
  const draft = textFrom(options.draft, options.draftFile, 'draft');
  const links = parseResultFlags(options.link, '--link');
  const body: Record<string, unknown> = {};
  if (id === undefined) {
    body.workspaceId = options.workspaceId;
    body.title = options.title;
    if (options.body !== undefined) body.body = options.body;
    if (options.audience !== undefined) body.audience = options.audience;
    if (options.parent !== undefined) body.parentId = options.parent;
  }
  if (draft !== undefined) body.draft = draft;
  if (options.verb !== undefined) body.approveVerb = options.verb;
  if (options.kind !== undefined) body.kind = options.kind;
  if (options.reviewer !== undefined) body.reviewer = options.reviewer;
  if (links.length) body.links = links;
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'propose'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}

export interface TaskReportOptions extends TaskWriteOptions {
  /** A new report: the workspace and the title. */
  workspaceId?: string;
  title?: string;
  body?: string;
  audience?: 'internal' | 'shared';
  parent?: string;
  kind?: string;
  /** What came of it, at most 280 characters; a later result replaces the text. */
  resultText?: string;
  link?: string[];
}

/** Report work already done that needed no approval: a new task born Done, or a later result on a Done task. */
export async function taskReport(id: string | undefined, options: TaskReportOptions): Promise<void> {
  newTaskFields(id, options as Record<string, unknown>, { title: '--title', workspaceId: '--workspace-id', parent: '--parent', audience: '--audience', body: '--body', kind: '--kind' }, 'report');
  const links = parseResultFlags(options.link, '--link');
  const body: Record<string, unknown> = {};
  if (id === undefined) {
    body.workspaceId = options.workspaceId;
    body.title = options.title;
    if (options.body !== undefined) body.body = options.body;
    if (options.audience !== undefined) body.audience = options.audience;
    if (options.parent !== undefined) body.parentId = options.parent;
    if (options.kind !== undefined) body.kind = options.kind;
  }
  if (options.resultText !== undefined) body.result = options.resultText;
  if (links.length) body.links = links;
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'report'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}

export interface TaskDecideOptions extends TaskWriteOptions {
  approve?: boolean;
  skip?: boolean;
  /** The revision you read: a draft replaced since is refused `CONFLICT`. */
  expectedRevision: string;
  /** Approve only: the text to carry out instead of the draft. */
  editedDraft?: string;
  editedDraftFile?: string;
  /** Skip only: why not. */
  note?: string;
}

/** Decide a review addressed to you: approve (optionally with an edited draft) or skip. */
export async function taskDecide(id: string, options: TaskDecideOptions): Promise<void> {
  // Every flag rule before any file is read, so a wrong combination is named as such.
  if (Boolean(options.approve) === Boolean(options.skip)) throw invalid('Give exactly one of --approve and --skip.');
  const edited = options.editedDraft !== undefined || options.editedDraftFile !== undefined;
  if (edited && !options.approve) throw invalid('An edited draft goes with --approve: it is the text then carried out.');
  if (options.note !== undefined && !options.skip) throw invalid('A note goes with --skip: it says why not.');
  const expectedRevision = parseRevision(options.expectedRevision);
  const editedDraft = textFrom(options.editedDraft, options.editedDraftFile, 'edited-draft');
  const body: Record<string, unknown> = { expectedRevision, decision: options.approve ? 'approve' : 'skip' };
  if (editedDraft !== undefined) body.editedDraft = editedDraft;
  if (options.note !== undefined) body.note = options.note;
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'decide'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}
