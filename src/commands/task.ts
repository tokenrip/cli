import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { formatTask, formatTaskList, formatTaskStarted, formatTaskTimeline } from '../formatters.js';

export interface TaskListOptions {
  /** The workspace, or `parentId` alone (its children, in its workspace). */
  workspaceId?: string;
  status?: string;
  /** Only tasks of this type (a free tag). */
  type?: string;
  /** Only tasks at this step (a free tag). */
  step?: string;
  /** Only tasks with all of these labels: `--label`, repeated or a comma list. */
  label?: string[];
  /** Only tasks of this job (its name). */
  job?: string;
  mine?: boolean;
  /** Only tasks for no one (`assignee=none`); never beside `mine`. */
  unassigned?: boolean;
  since?: string;
  limit?: string;
  cursor?: string;
  /** `created` or `finished` (done and cancelled only); omitted, the server picks queue order for open statuses. */
  order?: string;
  /** `me`: reviews In review addressed to you. */
  reviewer?: string;
  /** Only this task's children. */
  parentId?: string;
}

export interface TaskAddOptions {
  /** The workspace, or `parentId` alone (the parent's workspace). */
  workspaceId?: string;
  /** A person (account id or alias) or `agent:<handle>`, a handle from `rip workspace load`. */
  assignee?: string;
  /** Who decides its proposal, named as the assignee is; it may be the assignee, never the proposer. */
  reviewer?: string;
  /** A task this one belongs under: its workspace is the new task's. */
  parentId?: string;
  /** What kind of work it is: a free tag agents filter on. */
  type?: string;
  /** Which step of the workspace's workflow it is at: a free tag. */
  step?: string;
  /** Labels: the person's own words for grouping work (`--label`, repeatable). */
  label?: string[];
  /** The job it is part of, by name: a live job in its workspace. */
  job?: string;
  body?: string;
  due?: string;
  payload?: string;
  /** Files and pages the work uses: `artifact:<id>[@version]` or `url:<address>`, repeatable. */
  link?: string[];
  why?: string;
}

export interface TaskUpdateOptions {
  /** The revision read: needed with any field; a move alone (`position`, `before`, `after`) needs none. */
  expectedRevision?: string;
  title?: string;
  body?: string;
  assignee?: string;
  reviewer?: string;
  /** A tag to set, or `false` (`--no-type`, `--no-step`) to clear it. */
  type?: string | false;
  step?: string | false;
  /** A job's name to set, or `false` (`--no-job`) to clear it. */
  job?: string | false;
  /** Labels to add and to remove (`--add-label`, `--remove-label`, each repeatable). */
  addLabel?: string[];
  removeLabel?: string[];
  /** Files and pages to add to what the work uses, as `--link` on add. */
  link?: string[];
  /** Files and pages to remove from what the work uses, by target: `artifact:<id>` or `url:<address>`. */
  removeLink?: string[];
  /** Move it to the front (`top`) or back (`bottom`) of the queue. */
  position?: string;
  /** Move it just before this task in the queue. */
  before?: string;
  /** Move it just after this task in the queue. */
  after?: string;
  why?: string;
}

/** The task write field every verb shares: why. */
export interface TaskWriteOptions {
  why?: string;
}

function attribution(options: TaskWriteOptions): Record<string, string> {
  return options.why !== undefined ? { why: options.why } : {};
}

function invalid(message: string): CliError {
  return new CliError('INVALID_ARGUMENT', message);
}

/** A task's home: `--workspace-id`, or `--parent-id` alone (the parent's workspace), never both. */
function home(options: { workspaceId?: string; parentId?: string }, needed: string): Record<string, string> {
  if (options.workspaceId !== undefined && options.parentId !== undefined) {
    throw invalid('Give --workspace-id or --parent-id, not both: a parent names its workspace.');
  }
  if (options.parentId !== undefined) return { parentId: options.parentId };
  if (options.workspaceId !== undefined) return { workspaceId: options.workspaceId };
  throw invalid(`${needed} needs --workspace-id, or --parent-id for a task under another one.`);
}

/** `--label` values, each repeated or a comma list, as one list (the server checks each and drops a repeat). */
export function labelFlags(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => value.split(',')).map((label) => label.trim()).filter(Boolean);
}

function taskPath(id?: string, verb?: string): string {
  let p = '/v0/tasks';
  if (id) p += `/${encodeURIComponent(id)}`;
  if (verb) p += `/${verb}`;
  return p;
}

export async function taskList(options: TaskListOptions): Promise<void> {
  if (options.mine && options.unassigned) throw invalid('Use --mine or --unassigned, not both');
  const { client } = requireAuthClient();
  const q = new URLSearchParams(home(options, 'A task list'));
  if (options.status) q.set('status', options.status);
  if (options.type) q.set('type', options.type);
  if (options.step) q.set('step', options.step);
  const labels = labelFlags(options.label);
  if (labels.length) q.set('labels', labels.join(','));
  if (options.job) q.set('job', options.job);
  if (options.mine) q.set('assignee', 'me');
  if (options.unassigned) q.set('assignee', 'none');
  if (options.since) q.set('since', options.since);
  if (options.limit) q.set('limit', options.limit);
  if (options.cursor) q.set('cursor', options.cursor);
  if (options.order) q.set('order', options.order);
  if (options.reviewer) q.set('reviewer', options.reviewer);
  const qs = q.toString();
  const { data } = await client.get(`${taskPath()}${qs ? `?${qs}` : ''}`);
  outputSuccess(data.data, formatTaskList);
}

/**
 * `rip task show <id> [--round <n>]`: the task with its latest round and the approved round's final
 * text; `--round` (a whole number of at least 1) adds that round whole.
 */
export async function taskShow(id: string, options: { round?: string } = {}): Promise<void> {
  let query = '';
  if (options.round !== undefined) {
    if (!/^[1-9][0-9]*$/.test(options.round)) throw invalid(`--round must be a whole number of at least 1: a round the task has, got "${options.round}".`);
    query = `?${new URLSearchParams({ round: options.round })}`;
  }
  const { client } = requireAuthClient();
  const { data } = await client.get(`${taskPath(id)}${query}`);
  outputSuccess(data.data, formatTask);
}

/** The most pages `rip task timeline` follows; a timeline that long is cut off with an error, never silently. */
export const TIMELINE_PAGES_MAX = 1000;

/**
 * `rip task timeline <id>`: the task's whole timeline, newest first, read page by page (30 entries
 * each) until `nextCursor` is null. A cursor the server repeats stops the loop.
 */
export async function taskTimeline(id: string): Promise<void> {
  const { client } = requireAuthClient();
  const entries: unknown[] = [];
  const seen = new Set<string>();
  let title: string | undefined;
  let cursor: string | null = null;
  for (let page = 0; ; page += 1) {
    if (page >= TIMELINE_PAGES_MAX) throw new CliError('TIMELINE_TOO_LONG', `Stopped after ${TIMELINE_PAGES_MAX} pages of the timeline.`);
    const query = cursor ? `?${new URLSearchParams({ timelineCursor: cursor })}` : '';
    const { data } = await client.get(`${taskPath(id)}${query}`);
    const detail = data.data as { title?: string; timeline?: { entries?: unknown[]; nextCursor?: string | null } };
    title ??= detail.title;
    entries.push(...(detail.timeline?.entries ?? []));
    cursor = detail.timeline?.nextCursor ?? null;
    if (!cursor) break;
    if (seen.has(cursor)) throw new CliError('TIMELINE_CURSOR_REPEATED', 'The server returned the same timeline cursor twice; stopped.');
    seen.add(cursor);
  }
  outputSuccess({ taskId: id, entries }, (value) => formatTaskTimeline({ ...value, title }));
}

export async function taskAdd(title: string, options: TaskAddOptions): Promise<void> {
  const body: Record<string, unknown> = { title, ...home(options, 'A new task') };
  const { client } = requireAuthClient();
  if (options.why !== undefined) body.why = options.why;
  // Account ids, aliases and agent:<handle> pass through; the server resolves them.
  if (options.assignee) body.assignee = options.assignee;
  if (options.reviewer) body.reviewer = options.reviewer;
  if (options.type) body.type = options.type;
  if (options.step) body.step = options.step;
  const labels = labelFlags(options.label);
  if (labels.length) body.labels = labels;
  if (options.job) body.job = options.job;
  if (options.body) body.body = options.body;
  if (options.due) body.due = options.due;
  const links = parseLinkFlags(options.link);
  if (links.length) body.links = links;
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

/**
 * `--expected-revision`: the revision read, a decimal whole number of at least 1 (never `0x3` or
 * `1.5`). `readWith` is the command that reads it, named in the refusal.
 */
export function parseRevision(value: string, readWith = 'rip task show <id>'): number {
  const revision = /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(revision)) {
    throw new CliError('INVALID_ARGUMENT', `--expected-revision must be a whole number of at least 1: the revision you read (${readWith}), got "${value}".`);
  }
  return revision;
}

/** The move `--position`, `--before` or `--after` names, at most one, as the server's `position`. */
function queuePosition(options: TaskUpdateOptions): string | { before: string } | { after: string } | undefined {
  const given = (['position', 'before', 'after'] as const).filter((flag) => options[flag] !== undefined);
  if (given.length > 1) throw invalid(`Give one of --position, --before and --after, not ${given.map((flag) => `--${flag}`).join(' and ')}: a task moves to one place.`);
  if (options.position !== undefined) {
    if (options.position !== 'top' && options.position !== 'bottom') throw invalid(`--position takes top or bottom, got "${options.position}"; use --before or --after <id> to place it beside a task.`);
    return options.position;
  }
  if (options.before !== undefined) return { before: options.before };
  if (options.after !== undefined) return { after: options.after };
  return undefined;
}

export async function taskUpdate(id: string, options: TaskUpdateOptions): Promise<void> {
  const position = queuePosition(options);
  const body: Record<string, unknown> = {};
  if (options.expectedRevision !== undefined) body.expectedRevision = parseRevision(options.expectedRevision);
  const { client } = requireAuthClient();
  if (options.title !== undefined) body.title = options.title;
  if (options.body !== undefined) body.body = options.body;
  if (options.assignee !== undefined) body.assignee = options.assignee;
  if (options.reviewer !== undefined) body.reviewer = options.reviewer;
  if (options.type !== undefined) body.type = options.type === false ? null : options.type;
  if (options.step !== undefined) body.step = options.step === false ? null : options.step;
  if (options.job !== undefined) body.job = options.job === false ? null : options.job;
  const addLabels = labelFlags(options.addLabel);
  if (addLabels.length) body.addLabels = addLabels;
  const removeLabels = labelFlags(options.removeLabel);
  if (removeLabels.length) body.removeLabels = removeLabels;
  const addLinks = parseLinkFlags(options.link);
  if (addLinks.length) body.addLinks = addLinks;
  const removeLinks = parseLinkFlags(options.removeLink, '--remove-link', false);
  if (removeLinks.length) body.removeLinks = removeLinks;
  if (position !== undefined) body.position = position;
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.patch(taskPath(id), body);
  outputSuccess(data.data, formatTask);
}

export interface TaskStartOptions extends TaskWriteOptions {
  leaseHours?: string;
  /** Start by tags in this workspace (id or slug), instead of a task by its id. */
  workspaceId?: string;
  /** Start by tags: only a task of this type. */
  type?: string;
  /** Start by tags: only a task at this step. */
  step?: string;
  /** Start by tags: only a task of this job; with --step, Tokenrip records that this agent checked the step. */
  job?: string;
}

/**
 * Start a free task by its id, or renew your own hold (an agent's lease; never shorter). Or, with
 * `--workspace-id` and no id, start by tags: the first To do task there in queue order matching
 * `--type` and `--step`: with no tag, only a task for this agent; with a tag, also one for no one or for its person
 * with no agent named. An empty answer prints "No task" and exits 0.
 */
export async function taskStart(id: string | undefined, options: TaskStartOptions): Promise<void> {
  const byTags = options.workspaceId !== undefined || options.type !== undefined || options.step !== undefined || options.job !== undefined;
  if (id !== undefined && byTags) {
    throw invalid('Name a task id, or --workspace-id (with --type, --step and --job) to start the first To do task in queue order matching them; not both.');
  }
  if (id === undefined && options.workspaceId === undefined) {
    throw invalid('Name the task id to start, or --workspace-id (with --type, --step and --job) to start the first To do task in queue order matching them.');
  }
  const { client } = requireAuthClient();
  const lease = options.leaseHours !== undefined ? { leaseHours: Number(options.leaseHours) } : {};
  if (id !== undefined) {
    const { data } = await client.post(taskPath(id, 'start'), { ...lease, ...attribution(options) });
    outputSuccess(data.data, formatTask);
    return;
  }
  const body = {
    workspaceId: options.workspaceId,
    ...(options.type !== undefined ? { type: options.type } : {}),
    ...(options.step !== undefined ? { step: options.step } : {}),
    ...(options.job !== undefined ? { job: options.job } : {}),
    ...lease, ...attribution(options),
  };
  const { data } = await client.post('/v0/tasks/start', body);
  outputSuccess(data.data, formatTaskStarted);
}

/** Put a task you hold back in To do, or withdraw your own proposal In review (its round closes withdrawn). */
export async function taskStop(id: string, options: TaskWriteOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'stop'), attribution(options));
  outputSuccess(data.data, formatTask);
}

/** A link as the API takes it (task rounds plan D19): an artifact (optionally at a version) or a URL. */
export type TaskLinkBody = { artifact: string; version?: number | string } | { url: string };

/** A version id: `artifact:<id>@<version id>` names a version by its own id. */
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `--link artifact:<publicId>[@<version>]` or `--link url:<https://…>` (repeatable), as the API's
 * `{ artifact, version? }` or `{ url }`. A version is a number or a version id. With
 * `withVersion: false` (`--remove-link`) a version is refused: a link is removed by its target.
 */
export function parseLinkFlags(raw: string[] | undefined, flag = '--link', withVersion = true): TaskLinkBody[] {
  return (raw ?? []).map((item) => {
    const colon = item.indexOf(':');
    if (colon < 1) throw new CliError('INVALID_LINKS', `${flag} expects artifact:<id> or url:<address>, got "${item}".`);
    const type = item.slice(0, colon);
    const value = item.slice(colon + 1);
    if (type === 'url') return { url: value };
    if (type !== 'artifact') throw new CliError('INVALID_LINKS', `${flag} type must be artifact or url, got "${type}".`);
    // A page URL holds no "@"; a version follows the last one.
    const at = value.lastIndexOf('@');
    if (at <= 0) return { artifact: value };
    if (!withVersion) throw new CliError('INVALID_LINKS', `${flag} names a link by its target only, without a version: "${item}".`);
    const raw = value.slice(at + 1);
    const artifact = value.slice(0, at);
    if (VERSION_ID.test(raw)) return { artifact, version: raw };
    const version = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(version)) throw new CliError('INVALID_LINKS', `Bad version in "${item}": a number of at least 1, or a version id.`);
    return { artifact, version };
  });
}

/** Complete with what the work produced: links (`--link`) and what came of it (`--result-text`, at most 280 characters). */
export async function taskDone(id: string, options: { link?: string[]; resultText?: string } & TaskWriteOptions): Promise<void> {
  const links = parseLinkFlags(options.link);
  const { client } = requireAuthClient();
  const body = { ...(links.length ? { links } : {}), ...(options.resultText !== undefined ? { result: options.resultText } : {}), ...attribution(options) };
  const { data } = await client.post(taskPath(id, 'complete'), body);
  outputSuccess(data.data, formatTask);
}

/** Won't do: To do or Doing → Cancelled (reopenable). */
export async function taskCancel(id: string, options: { reason?: string; expectedRevision?: string } & TaskWriteOptions): Promise<void> {
  const expectedRevision = options.expectedRevision === undefined ? undefined : parseRevision(options.expectedRevision);
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'cancel'), {
    ...(options.reason ? { reason: options.reason } : {}),
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    ...attribution(options),
  });
  outputSuccess(data.data, formatTask);
}

export async function taskReopen(id: string, options: TaskWriteOptions = {}): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'reopen'), attribution(options));
  outputSuccess(data.data, formatTask);
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
    if (!options.title) throw invalid(`A new ${verb} needs --title, and --workspace-id or --parent-id; to ${verb} on an existing task, pass its id.`);
    home(options, `A new ${verb}`);
    return;
  }
  const given = Object.entries(fields).filter(([key]) => options[key] !== undefined).map(([, flag]) => flag);
  if (given.length) throw invalid(`${given.join(', ')} ${given.length === 1 ? 'is' : 'are'} for a new task only; an existing task keeps its own.`);
}

export interface TaskProposeOptions extends TaskWriteOptions {
  /** A new proposal: the workspace (or the parent, alone) and the title. */
  workspaceId?: string;
  parentId?: string;
  title?: string;
  body?: string;
  /** The exact text the action uses: inline, or read from a file. */
  draft?: string;
  draftFile?: string;
  /** The approve button's verb ("Post"); "Approve" without it. */
  verb?: string;
  /** The step an approval moves the task to (a free tag); the reviewer may change or clear it. */
  then?: string;
  /** A comment posted with the proposal, in the same write. */
  comment?: string;
  /** What kind of work it is; on an existing task, set only when it has none. */
  type?: string;
  /** Whom the review is addressed to; your own person when neither you nor the task names one. */
  reviewer?: string;
  /** A new proposal: the job it serves, by name (a job with task definitions fills its step, then and verb). */
  job?: string;
  /** `artifact:<publicId>[@version]` or `url:<https://…>`, repeatable. */
  link?: string[];
  /** `<publicId>[@version]`, repeatable: the files the draft is made of, in order (at most 10). */
  draftArtifact?: string[];
}

/**
 * `--draft-artifact <publicId>[@version]` (repeatable): an artifact as `--link artifact:…` names it,
 * at a version number or id (else its current one), as the API's `draftArtifacts` entry.
 */
export function parseDraftArtifacts(raw: string[] | undefined): { artifact: string; version?: number | string }[] {
  return parseLinkFlags((raw ?? []).map((item) => `artifact:${item}`), '--draft-artifact') as { artifact: string; version?: number | string }[];
}

/**
 * `--edit-artifact <publicId>@<version>` (repeatable): a draft artifact at its current version
 * (a number or a version id), as the API's `edits.artifacts` entry. Omit it and the approval
 * carries out each draft file as it is now.
 */
export function parseEditArtifacts(raw: string[] | undefined): { artifact: string; version: number | string }[] {
  return parseDraftArtifacts(raw).map((entry, index) => {
    if (entry.version === undefined) throw invalid(`--edit-artifact needs the current version: <id>@<version>, got "${raw![index]}".`);
    return { artifact: entry.artifact, version: entry.version };
  });
}

/**
 * Propose an action before it leaves the workspace (feed, review and instructions design §5.7): a new
 * task In review, or a new round on a task that is free or yours (replacing your own open round). The
 * reply is In review (stop: it comes back to you), or approved when your instructions allow its type:
 * doing (carry out `approvedRound.final.text` now), or with `then`, at that step for whoever takes it.
 */
export async function taskPropose(id: string | undefined, options: TaskProposeOptions): Promise<void> {
  newTaskFields(id, options as Record<string, unknown>, { title: '--title', workspaceId: '--workspace-id', parentId: '--parent-id', body: '--body', job: '--job' }, 'proposal');
  const draft = textFrom(options.draft, options.draftFile, 'draft');
  const links = parseLinkFlags(options.link);
  const draftArtifacts = parseDraftArtifacts(options.draftArtifact);
  const body: Record<string, unknown> = {};
  if (id === undefined) {
    Object.assign(body, home(options, 'A new proposal'));
    body.title = options.title;
    if (options.body !== undefined) body.body = options.body;
    if (options.job !== undefined) body.job = options.job;
  }
  if (draft !== undefined) body.draft = draft;
  if (draftArtifacts.length) body.draftArtifacts = draftArtifacts;
  if (options.verb !== undefined) body.approveVerb = options.verb;
  if (options.then !== undefined) body.then = options.then;
  if (options.comment !== undefined) body.comment = options.comment;
  if (options.type !== undefined) body.type = options.type;
  if (options.reviewer !== undefined) body.reviewer = options.reviewer;
  if (links.length) body.links = links;
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'propose'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}

export interface TaskReportOptions extends TaskWriteOptions {
  /** A new report: the workspace (or the parent, alone) and the title. */
  workspaceId?: string;
  parentId?: string;
  title?: string;
  body?: string;
  /** A new report: what kind of work it was. */
  type?: string;
  /** A new report: its labels (`--label`, repeatable). */
  label?: string[];
  /** A new report: the job it was part of, by name. */
  job?: string;
  /** What came of it, at most 280 characters; a later result replaces the text. */
  resultText?: string;
  link?: string[];
}

/** Report work already done that needed no approval: a new task born Done, or a later result on a Done task. */
export async function taskReport(id: string | undefined, options: TaskReportOptions): Promise<void> {
  newTaskFields(id, options as Record<string, unknown>, { title: '--title', workspaceId: '--workspace-id', parentId: '--parent-id', body: '--body', type: '--type', label: '--label', job: '--job' }, 'report');
  const links = parseLinkFlags(options.link);
  const body: Record<string, unknown> = {};
  if (id === undefined) {
    Object.assign(body, home(options, 'A new report'));
    body.title = options.title;
    if (options.body !== undefined) body.body = options.body;
    if (options.type !== undefined) body.type = options.type;
    const labels = labelFlags(options.label);
    if (labels.length) body.labels = labels;
    if (options.job !== undefined) body.job = options.job;
  }
  if (options.resultText !== undefined) body.result = options.resultText;
  if (links.length) body.links = links;
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'report'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}

export interface TaskDecideOptions extends TaskWriteOptions {
  /** Exactly one of the two choices (a no is `rip task cancel`, plan D22). */
  approve?: boolean;
  sendBack?: boolean;
  /** The revision you read: a draft replaced since is refused `CONFLICT`. */
  expectedRevision: string;
  /** Posted with the decision; a send back needs one (what to change). */
  comment?: string;
  /** Approve only: the step to move the task to instead of the proposal's, or `false` (`--no-then`) for none. */
  then?: string | false;
  /** Approve only: a file whose text is carried out instead of the draft (sent as `edits.text`). */
  editedDraftFile?: string;
  /** Approve only: `<publicId>@<version>`, repeatable: a draft artifact at its current version (sent as `edits.artifacts`). Omit it to approve each draft file as it is now. */
  editArtifact?: string[];
}

const DECISIONS = [['approve', 'approve'], ['sendBack', 'send_back']] as const;

/**
 * Decide a review addressed to you: approve (optionally with edits and a then) or send it back with a
 * comment. A no is `rip task cancel` (plan D22). Every flag rule is checked before the edits file is read.
 */
export async function taskDecide(id: string, options: TaskDecideOptions): Promise<void> {
  const chosen = DECISIONS.filter(([flag]) => options[flag]);
  if (chosen.length !== 1) throw invalid('Give exactly one of --approve and --send-back. To say no, cancel the task: rip task cancel <id> [--reason <text>].');
  const decision = chosen[0]![1];
  if (decision !== 'approve' && options.then !== undefined) throw invalid('--then and --no-then go with --approve: they set the step an approval moves the task to.');
  if (decision !== 'approve' && options.editedDraftFile !== undefined) throw invalid('An edited draft goes with --approve: it is the text then carried out.');
  if (decision !== 'approve' && options.editArtifact?.length) throw invalid('--edit-artifact goes with --approve: it names the version of a draft artifact then carried out.');
  if (decision === 'send_back' && options.comment === undefined) throw invalid('A send back needs --comment: what to change before the next round.');
  const expectedRevision = parseRevision(options.expectedRevision);
  const editedArtifacts = parseEditArtifacts(options.editArtifact);
  const edited = textFrom(undefined, options.editedDraftFile, 'edited-draft');
  const body: Record<string, unknown> = { expectedRevision, decision };
  if (options.comment !== undefined) body.comment = options.comment;
  if (options.then !== undefined) body.then = options.then === false ? null : options.then;
  if (edited !== undefined || editedArtifacts.length) {
    body.edits = { ...(edited !== undefined ? { text: edited } : {}), ...(editedArtifacts.length ? { artifacts: editedArtifacts } : {}) };
  }
  const { client } = requireAuthClient();
  const { data } = await client.post(taskPath(id, 'decide'), { ...body, ...attribution(options) });
  outputSuccess(data.data, formatTask);
}
