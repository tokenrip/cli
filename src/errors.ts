export interface ValidationDetail {
  path?: Array<string | number>;
  message?: string;
}
export interface DomainErrorDetails {
  field?: string;
  fields?: string[];
  currentVersionId?: string;
  currentRevision?: number;
  currentWorkspaceRevision?: number;
  /**
   * `INVALID_SKILL`: which skill rule refused (closed set, mirrors the server).
   * `CONFLICT`: `not_current` when a named draft version is not the file's current one.
   */
  reason?: string;
  /** `CONFLICT` `not_current`: the draft file's public id. */
  artifact?: string;
  /** `CONFLICT` `not_current`: that file's current version. A malformed one is dropped whole. */
  current?: { id: string; number: number };
  /** `DELETED` / `WORKSPACE_DELETED`: the item in the trash (or, via a folder, what put it there). */
  type?: string;
  id?: string;
  deletedAt?: string;
  purgeAt?: string;
  via?: { type: string; id: string };
  /** Only for callers who may restore it: `rip trash restore <id>`. */
  restorable?: true;
  deletedBy?: { id: string; alias: string | null } | null;
  /** Also only for a restorer, of a workspace file or folder: `--expected-workspace-revision` for `rip trash restore`. */
  workspaceId?: string;
  workspaceRevision?: number;
  /** `TASK_TAKEN`: who holds the task, as the server projects it (never a key id). */
  holder?: TaskHolderDetails;
  /** `REVIEW_NOT_YOURS` / `INVALID_REVIEWER`: whom the review is addressed to; null: any person who can edit tasks. */
  reviewer?: TaskPrincipalDetails | null;
  /** `TASK_NOT_IN_REVIEW`: where the task is now. */
  status?: string;
  /** `VERSION_IN_USE`: the task whose review round keeps the version, and the round; null when the caller reads no such task. */
  task?: string | null;
  round?: number | null;
  /**
   * `OUTPUT_EXISTS`: the output not failed that holds the key (its id, kind, status, target, ref, the
   * agent that recorded it, and when); null when the caller cannot read it.
   */
  output?: OutputDetails | null;
  /** `TASK_NOT_IN_REVIEW`: the task's latest review round and how it ended; null: never proposed. */
  latestRound?: TaskRoundDetails | null;
  /**
   * `WORKSPACE_LIMIT_REACHED`: the owner held to its plan, the plan, and how many it allows and has.
   * `STORAGE_LIMIT_REACHED`, `ACTIONS_LIMIT_REACHED`: the plan too.
   */
  owner?: { kind: 'personal' | 'team'; id: string; name: string | null };
  plan?: string;
  /** A number on `WORKSPACE_LIMIT_REACHED`; on `RATE_LIMITED`, which limit refused. */
  limit?: number | CapacityLimit;
  used?: number;
  /**
   * `STORAGE_LIMIT_REACHED`: the payer's bytes used, its plan's limit, what the write would have
   * added, and the plan. All four or none (a workspace's external member gets none).
   */
  usedBytes?: number;
  limitBytes?: number;
  addedBytes?: number;
  /**
   * `ACTIONS_LIMIT_REACHED`: the payer's actions this month before the refused write, its limit, the
   * plan and when the allowance resets. All four or none (a workspace's guest gets none).
   */
  usedActions?: number;
  limitActions?: number;
  resetsAt?: string;
  /** An input refusal ({@link INPUT_REFUSAL_CODES}): the place below `field` the rule broke (`schema[3].name`). */
  path?: string;
  /** A row-query refusal: the columns valid for `field` (`sort_by`, `filter` or `fields`), and whether the list was cut. */
  available?: string[];
  availableTruncated?: true;
  /** `INVALID_SCHEMA` on a CSV header: its 1-based column and which rule it broke. */
  column?: number;
  rule?: string;
  /** `NOT_FOUND`: which kind of reference named nothing the caller can read. */
  resource?: string;
  /** `RATE_LIMITED`: what `limit` allows. */
  max?: number;
  /** `MAINTENANCE`: when the pause is planned to end. */
  until?: string;
  /** `MAINTENANCE`, `RATE_LIMITED`, `SERVER_BUSY`: the server's `Retry-After` in seconds. */
  retryAfterSeconds?: number;
  /** `AMBIGUOUS_REFERENCE` on a workspace slug: each workspace it names, to be named by its id. */
  candidates?: WorkspaceCandidateDetails[];
  /**
   * `KEY_ACCESS_LIMITED`: `workspaceId` when the refusal names one (the door omits it). `level` is
   * the grant, or null when that workspace is outside the key (or the door named none). `operation`
   * is what was refused.
   */
  level?: 'read' | 'write' | null;
  operation?: string;
}
/** The server's `CapacityLimit` (apps/backend/src/api/ratelimit/capacity-limits.ts). */
export type CapacityLimit = 'requests' | 'concurrent' | 'streams';
const CAPACITY_LIMITS: ReadonlySet<unknown> = new Set<CapacityLimit>(['requests', 'concurrent', 'streams']);
/** One workspace an ambiguous slug names (`WorkspaceService.resolveReference`), copied field by field. */
export interface WorkspaceCandidateDetails {
  id: string;
  slug: string;
  name: string;
  home: 'personal' | { team: string };
}
/** The server's task principal projection (feed, review and instructions plan D3), copied field by field. */
export interface TaskPrincipalDetails {
  account: { id: string; alias: string | null; former?: true };
  agent: { id: string | null; name: string | null; harness: string | null } | null;
  mine: boolean;
  isCaller: boolean;
}
/** The server's `TASK_ROUND_VERDICTS` (apps/backend/src/db/models/task-vocabulary.ts). */
export const TASK_ROUND_VERDICTS = ['approved', 'sent_back', 'cancelled', 'withdrawn', 'replaced'] as const;
export type TaskRoundVerdict = (typeof TASK_ROUND_VERDICTS)[number];
/** The server's `TASK_ROUNDS_MAX`: the most rounds a task holds. */
const TASK_ROUNDS_MAX = 50;
/** A task's latest round as the server's summary carries it (task rounds plan M5): its number and verdict (null: open). */
export interface TaskRoundDetails {
  number: number;
  verdict: TaskRoundVerdict | null;
}
/** An `OUTPUT_EXISTS` holder (leverage plan M5), copied field by field. */
export interface OutputDetails {
  id: string;
  kind: string;
  status: string;
  target?: string | null;
  ref?: string | null;
  agent?: TaskPrincipalDetails | null;
  createdAt?: string;
  sentAt?: string | null;
}
/** The server's task `holder` projection (workspace tasks plan D5), copied field by field. */
export interface TaskHolderDetails {
  account: { id: string; alias: string | null; former?: true };
  agent: { name: string } | null;
  surface: string | null;
  inBrowser: boolean;
  since: string;
  leaseExpiresAt: string | null;
  mine: boolean;
  heldByCaller: boolean;
}
/** Observations made by the local client, never copied from an API response. */
export interface TransportErrorDetails {
  elapsedMs?: number;
  timeoutMs?: number;
  transportCode?: string;
  responseReceived?: boolean;
  httpStatus?: number;
}
export type CliErrorDetails = (DomainErrorDetails & TransportErrorDetails) | ValidationDetail[];

const TRANSPORT_CODES: ReadonlySet<string> = new Set([
  'ECONNABORTED', 'ETIMEDOUT', 'ERR_PROXY_TUNNEL', 'ERR_CANCELED', 'ERR_NETWORK',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
  'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE', 'ERR_INVALID_URL', 'ERR_INVALID_ARG_TYPE',
  'ERR_FR_TOO_MANY_REDIRECTS', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** A distinct construction channel prevents remote bodies from claiming local facts. */
export function safeTransportErrorDetails(value: unknown): TransportErrorDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  const details: TransportErrorDetails = {};
  for (const field of ['elapsedMs', 'timeoutMs'] as const) {
    const ms = body[field];
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) details[field] = ms;
  }
  if (typeof body.transportCode === 'string' && TRANSPORT_CODES.has(body.transportCode)) details.transportCode = body.transportCode;
  if (typeof body.responseReceived === 'boolean') details.responseReceived = body.responseReceived;
  if (details.responseReceived === true && typeof body.httpStatus === 'number' && Number.isInteger(body.httpStatus)
    && body.httpStatus >= 100 && body.httpStatus <= 599) details.httpStatus = body.httpStatus;
  return Object.keys(details).length ? details : undefined;
}

/** The server's `SKILL_INVALID_REASONS` (apps/backend/src/db/models/Skill.ts). */
const SKILL_INVALID_REASONS: ReadonlySet<string> = new Set([
  'missing_entry', 'frontmatter', 'name_mismatch', 'description', 'name', 'path',
  'duplicate_path', 'encoding', 'file_count', 'total_size', 'unknown_removal',
]);

/**
 * The refusals that name the input they refuse (agent refusals plan M8): the contract's `INVALID_FIELD`,
 * the row-query codes and the CSV codes. Only these carry `field`, `path`, `available`, `column`,
 * `rule` and the CSV `reason`.
 */
export const INPUT_REFUSAL_CODES: ReadonlySet<string> = new Set([
  'INVALID_FIELD', 'INVALID_SORT_COLUMN', 'INVALID_FILTER_COLUMN', 'INVALID_SCHEMA', 'INVALID_CSV',
]);
/** The server's CSV header rules (`csvColumnRefusal`, apps/backend/src/api/service/csv-parser.ts). */
const CSV_COLUMN_RULES: ReadonlySet<string> = new Set(['column_name', 'duplicate_column']);
/** The server's `INVALID_CSV` reasons (apps/backend/src/api/service/csv-parser.ts). */
const CSV_REASONS: ReadonlySet<string> = new Set(['unbalanced_quote']);
/** The server's `NOT_FOUND_RESOURCES` (apps/backend/src/execution/failure.ts). */
const NOT_FOUND_RESOURCES: ReadonlySet<string> = new Set([
  'artifact', 'folder', 'workspace', 'task', 'version', 'row', 'bundle', 'team', 'account', 'connection', 'comment', 'job', 'output',
]);
/** The server's `ROW_QUERY_AVAILABLE_MAX` and `TABLE_COLUMN_NAME_MAX` (apps/backend/src/db/models/table-schema.ts). */
const AVAILABLE_MAX = 259;
const COLUMN_NAME_MAX = 256;
/** At most `max` characters counted as code points, as the server's `withinCharacters` counts a column name. */
function withinCharacters(text: string, max: number): boolean {
  return text.length <= max || (text.length <= 2 * max && [...text].length <= max);
}

/** An input refusal's details, field by field: each copied when valid, dropped when malformed. */
function inputRefusalDetails(body: Record<string, unknown>): DomainErrorDetails {
  const details: DomainErrorDetails = {};
  if (shortString(body.field)) details.field = body.field;
  if (shortString(body.path)) details.path = body.path;
  const { available } = body;
  if (Array.isArray(available) && available.length <= AVAILABLE_MAX
    && available.every((name) => typeof name === 'string' && withinCharacters(name, COLUMN_NAME_MAX))) {
    details.available = available as string[];
    if (body.availableTruncated === true) details.availableTruncated = true;
  }
  if (typeof body.column === 'number' && Number.isSafeInteger(body.column) && body.column > 0) details.column = body.column;
  if (typeof body.rule === 'string' && CSV_COLUMN_RULES.has(body.rule)) details.rule = body.rule;
  if (typeof body.reason === 'string' && CSV_REASONS.has(body.reason)) details.reason = body.reason;
  return details;
}

/** The server owns refusal codes; only curated correction metadata is copied. */
export function safeErrorDetails(code: string, value: unknown): DomainErrorDetails | ValidationDetail[] | undefined {
  if (Array.isArray(value)) {
    if (['CONFLICT', 'STATE_CONFLICT', 'PRECONDITION_REQUIRED', 'WORKSPACE_AUTHORITY', 'INELIGIBLE_STORAGE', 'INVALID_SCOPE',
      'WORKSPACE_PAGE_UNACKNOWLEDGED', 'INVALID_WORKSPACE_DELIVERY', 'INVALID_CURSOR', 'WORKSPACE_DELETED', 'DELETED'].includes(code)) return undefined;
    // Preserve the legacy public REST validation envelope and its human explanation.
    const issues = value.filter((issue): issue is Record<string, unknown> => !!issue && typeof issue === 'object').map(issue => ({
      ...(Array.isArray(issue.path) && issue.path.every(part => typeof part === 'string' || typeof part === 'number') ? { path: issue.path as Array<string | number> } : {}),
      ...(typeof issue.message === 'string' ? { message: issue.message } : {}),
    }));
    return issues.length ? issues : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const details: DomainErrorDetails = {};
  if (code === 'CONFLICT') {
    if (typeof body.currentVersionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.currentVersionId)) details.currentVersionId = body.currentVersionId;
    for (const field of ['currentRevision', 'currentWorkspaceRevision'] as const) {
      const revision = body[field];
      if (typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0) details[field] = revision;
    }
    const moved = notCurrentDetails(body);
    if (moved) Object.assign(details, moved);
  } else if (code === 'PRECONDITION_REQUIRED' && typeof body.field === 'string'
    && ['expectedVersionId', 'expectedRevision', 'expectedRevisions', 'expectedWorkspaceRevision'].includes(body.field)) details.field = body.field;
  else if (code === 'INVALID_SCOPE' && body.field === 'workspaceId') details.field = body.field;
  else if ((code === 'WORKSPACE_AUTHORITY' || code === 'INELIGIBLE_STORAGE') && Array.isArray(body.fields)) {
    const allowed = code === 'INELIGIBLE_STORAGE' ? ['publicAsset'] : ['visibility', 'team', 'teams', 'folder'];
    const fields = [...new Set(body.fields.filter((field): field is string => typeof field === 'string' && allowed.includes(field)))].slice(0, 8);
    if (fields.length) details.fields = fields;
  } else if (code === 'INVALID_SKILL' && typeof body.reason === 'string' && SKILL_INVALID_REASONS.has(body.reason)) details.reason = body.reason;
  else if (INPUT_REFUSAL_CODES.has(code)) Object.assign(details, inputRefusalDetails(body));
  else if (code === 'NOT_FOUND' && typeof body.resource === 'string' && NOT_FOUND_RESOURCES.has(body.resource)) details.resource = body.resource;
  else if (code === 'DELETED' || code === 'WORKSPACE_DELETED') Object.assign(details, trashedDetails(body));
  else if (code === 'TASK_TAKEN') {
    const holder = taskHolderDetails(body.holder);
    if (holder) details.holder = holder;
  } else if (code === 'REVIEW_NOT_YOURS' || code === 'INVALID_REVIEWER') {
    if (body.reviewer === null) details.reviewer = null;
    else {
      const reviewer = taskPrincipalDetails(body.reviewer);
      if (reviewer) details.reviewer = reviewer;
    }
  } else if (code === 'WORKSPACE_LIMIT_REACHED') Object.assign(details, workspaceLimitDetails(body));
  else if (code === 'STORAGE_LIMIT_REACHED') {
    const { usedBytes, limitBytes, addedBytes, plan } = body;
    const counts = [usedBytes, limitBytes, addedBytes];
    if (counts.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      && typeof plan === 'string' && PLAN_KEYS.has(plan)) {
      Object.assign(details, { usedBytes, limitBytes, addedBytes, plan });
    }
  } else if (code === 'ACTIONS_LIMIT_REACHED') {
    const { usedActions, limitActions, plan, resetsAt } = body;
    if (count(usedActions) && count(limitActions) && typeof plan === 'string' && PLAN_KEYS.has(plan)
      && typeof resetsAt === 'string' && ISO_DATE.test(resetsAt)) {
      Object.assign(details, { usedActions, limitActions, plan, resetsAt });
    }
  } else if (code === 'AMBIGUOUS_REFERENCE') {
    // Trash restore's ambiguity names no candidates; a workspace slug's does.
    const candidates = workspaceCandidateDetails(body.candidates);
    if (candidates.length) details.candidates = candidates;
  } else if (code === 'MAINTENANCE') {
    if (typeof body.until === 'string' && ISO_DATE.test(body.until)) details.until = body.until;
    if (count(body.retryAfterSeconds)) details.retryAfterSeconds = body.retryAfterSeconds;
  } else if (code === 'RATE_LIMITED') {
    if (CAPACITY_LIMITS.has(body.limit)) details.limit = body.limit as CapacityLimit;
    if (count(body.max)) details.max = body.max;
    if (count(body.retryAfterSeconds)) details.retryAfterSeconds = body.retryAfterSeconds;
  } else if (code === 'SERVER_BUSY') {
    if (count(body.retryAfterSeconds)) details.retryAfterSeconds = body.retryAfterSeconds;
  } else if (code === 'VERSION_IN_USE') {
    if (body.task === null || (typeof body.task === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.task))) details.task = body.task;
    if (body.round === null || (typeof body.round === 'number' && Number.isInteger(body.round) && body.round >= 1)) details.round = body.round;
  } else if (code === 'OUTPUT_EXISTS') {
    if (body.output === null) details.output = null;
    else {
      const output = outputDetails(body.output);
      if (output) details.output = output;
    }
  } else if (code === 'OUTPUT_SETTLED') {
    if (typeof body.status === 'string' && OUTPUT_STATUSES.has(body.status)) details.status = body.status;
  } else if (code === 'TASK_NOT_IN_REVIEW') {
    if (typeof body.status === 'string' && TASK_STATUSES.has(body.status)) details.status = body.status;
    if (body.latestRound === null) details.latestRound = null;
    else {
      const latestRound = taskRoundDetails(body.latestRound);
      if (latestRound) details.latestRound = latestRound;
    }
  } else if (code === 'KEY_ACCESS_LIMITED') Object.assign(details, keyAccessLimitedDetails(body));
  return Object.keys(details).length ? details : undefined;
}

/** The server's operation name on `KEY_ACCESS_LIMITED` (apps/backend/src/execution/failure.ts). */
const KEY_ACCESS_OPERATION = /^[a-z][a-zA-Z0-9_.]{0,80}$/;

/**
 * `KEY_ACCESS_LIMITED`'s details, field by field, as the server keeps them. A bad `level`,
 * `operation` or `workspaceId` drops the whole detail. The door omits `workspaceId`.
 */
function keyAccessLimitedDetails(body: Record<string, unknown>): DomainErrorDetails {
  const { workspaceId, level, operation } = body;
  if (level !== 'read' && level !== 'write' && level !== null) return {};
  if (typeof operation !== 'string' || !KEY_ACCESS_OPERATION.test(operation)) return {};
  if (workspaceId === undefined) return { level, operation };
  if (typeof workspaceId !== 'string' || !ANY_UUID.test(workspaceId)) return {};
  return { workspaceId, level, operation };
}

/** The server's `PlanLabel` (apps/backend/src/api/service/billing-plans.ts); `tests/unit/plan-catalog-parity.test.ts` pins it. */
export const PLAN_LABELS: ReadonlySet<string> = new Set(['free', 'pro', 'power', 'none']);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A `WORKSPACE_LIMIT_REACHED` refusal's details, field by field: exactly owner, plan, limit and used. */
function workspaceLimitDetails(body: Record<string, unknown>): DomainErrorDetails {
  const details: DomainErrorDetails = {};
  const owner = body.owner as Record<string, unknown> | undefined;
  if (owner && typeof owner === 'object' && (owner.kind === 'personal' || owner.kind === 'team') && shortString(owner.id)
    && nullableShortString(owner.name)) details.owner = { kind: owner.kind, id: owner.id, name: owner.name };
  if (typeof body.plan === 'string' && PLAN_LABELS.has(body.plan)) details.plan = body.plan;
  if (count(body.limit)) details.limit = body.limit;
  if (count(body.used)) details.used = body.used;
  return details;
}
/** The server's `PLAN_KEYS` (apps/backend/src/db/models/plan-keys.ts); `tests/unit/plan-catalog-parity.test.ts` pins it. */
export const PLAN_KEYS: ReadonlySet<string> = new Set(['free', 'pro', 'power', 'enterprise']);

/** The server's `OUTPUT_STATUSES` (apps/backend/src/db/models/leverage-vocabulary.ts). */
const OUTPUT_STATUSES: ReadonlySet<string> = new Set(['sending', 'sent', 'failed']);

/** An `OUTPUT_EXISTS` holder, every field checked; a malformed id, kind or status drops it whole, another field alone. */
function outputDetails(value: unknown): OutputDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  if (!shortString(o.id) || !shortString(o.kind) || typeof o.status !== 'string' || !OUTPUT_STATUSES.has(o.status)) return undefined;
  const output: OutputDetails = { id: o.id, kind: o.kind, status: o.status };
  if (o.target === null || shortString(o.target)) output.target = o.target;
  if (o.ref === null || (typeof o.ref === 'string' && o.ref.length <= 2048)) output.ref = o.ref;
  if (o.agent === null) output.agent = null;
  else {
    const agent = taskPrincipalDetails(o.agent);
    if (agent) output.agent = agent;
  }
  if (typeof o.createdAt === 'string' && ISO_DATE.test(o.createdAt)) output.createdAt = o.createdAt;
  if (o.sentAt === null || (typeof o.sentAt === 'string' && ISO_DATE.test(o.sentAt))) output.sentAt = o.sentAt;
  return output;
}

/** The server's `TASK_STATUSES` (apps/backend/src/db/models/task-vocabulary.ts). */
const TASK_STATUSES: ReadonlySet<string> = new Set(['todo', 'doing', 'review', 'done', 'cancelled']);
const nullableShortString = (value: unknown): value is string | null => value === null || shortString(value);

/** An account already checked: `former` comes through only as the server sends it, true. */
function accountDetails(id: string, account: Record<string, unknown>): TaskPrincipalDetails['account'] {
  return { id, alias: account.alias as string | null, ...(account.former === true ? { former: true as const } : {}) };
}

/** A task principal, every field checked; anything malformed drops the whole principal. */
function taskPrincipalDetails(value: unknown): TaskPrincipalDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const p = value as Record<string, unknown>;
  const account = p.account as Record<string, unknown> | undefined;
  const agent = p.agent as Record<string, unknown> | null | undefined;
  if (!account || typeof account !== 'object' || !shortString(account.id) || !nullableShortString(account.alias)) return undefined;
  if (agent !== null && !(agent && typeof agent === 'object' && nullableShortString(agent.id) && nullableShortString(agent.name) && nullableShortString(agent.harness))) return undefined;
  if (typeof p.mine !== 'boolean' || typeof p.isCaller !== 'boolean') return undefined;
  return {
    account: accountDetails(account.id, account),
    agent: agent ? { id: agent.id as string | null, name: agent.name as string | null, harness: agent.harness as string | null } : null,
    mine: p.mine, isCaller: p.isCaller,
  };
}

/** A latest round, every field checked; anything malformed drops the whole round. */
function taskRoundDetails(value: unknown): TaskRoundDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const r = value as Record<string, unknown>;
  if (typeof r.number !== 'number' || !Number.isSafeInteger(r.number) || r.number < 1 || r.number > TASK_ROUNDS_MAX) return undefined;
  // A server before the verdict rename sends only `outcome` (window round-outcome-field-window).
  const verdict = r.verdict !== undefined ? r.verdict : r.outcome;
  if (verdict !== null && !(TASK_ROUND_VERDICTS as readonly unknown[]).includes(verdict)) return undefined;
  return { number: r.number, verdict: verdict as TaskRoundVerdict | null };
}

const NAME_MAX = 255;
const shortString = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= NAME_MAX;

/** A `TASK_TAKEN` holder, every field checked; anything malformed drops the whole holder. */
function taskHolderDetails(value: unknown): TaskHolderDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const h = value as Record<string, unknown>;
  const account = h.account as Record<string, unknown> | undefined;
  const agent = h.agent as Record<string, unknown> | null | undefined;
  if (!account || typeof account !== 'object' || !shortString(account.id)) return undefined;
  if (account.alias !== null && !shortString(account.alias)) return undefined;
  if (agent !== null && !(agent && typeof agent === 'object' && shortString(agent.name))) return undefined;
  if (h.surface !== null && !shortString(h.surface)) return undefined;
  if (typeof h.since !== 'string' || !ISO_DATE.test(h.since)) return undefined;
  if (h.leaseExpiresAt !== null && !(typeof h.leaseExpiresAt === 'string' && ISO_DATE.test(h.leaseExpiresAt))) return undefined;
  if (typeof h.inBrowser !== 'boolean' || typeof h.mine !== 'boolean' || typeof h.heldByCaller !== 'boolean') return undefined;
  return {
    account: accountDetails(account.id, account),
    agent: agent ? { name: agent.name as string } : null,
    surface: h.surface as string | null,
    inBrowser: h.inBrowser, since: h.since, leaseExpiresAt: h.leaseExpiresAt as string | null,
    mine: h.mine, heldByCaller: h.heldByCaller,
  };
}

/** The most candidates kept (the server's `CANDIDATES_MAX`, apps/backend/src/execution/failure.ts). */
const CANDIDATES_MAX = 20;
/** A workspace or team slug: lowercase letters, digits and hyphens, at most 64. */
const SLUG = /^[a-z0-9-]{1,64}$/;
const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Approve's refusal of a named version that is not the file's current one (`not_current`): the reason,
 * the artifact's public id and that version, all required. A malformed current adds nothing, so a
 * secret beside a half-read file cannot cross. A stale task revision stays `currentRevision` alone.
 */
function notCurrentDetails(body: Record<string, unknown>): Pick<DomainErrorDetails, 'reason' | 'artifact' | 'current'> | undefined {
  if (body.reason !== 'not_current' || typeof body.artifact !== 'string' || !ANY_UUID.test(body.artifact)) return undefined;
  const current = body.current;
  if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
  const version = current as Record<string, unknown>;
  if (typeof version.id !== 'string' || !ANY_UUID.test(version.id)) return undefined;
  if (typeof version.number !== 'number' || !Number.isSafeInteger(version.number) || version.number <= 0) return undefined;
  return { reason: 'not_current', artifact: body.artifact, current: { id: version.id, number: version.number } };
}

/** An ambiguity's workspace candidates, each field checked; a malformed candidate is dropped whole. */
function workspaceCandidateDetails(value: unknown): WorkspaceCandidateDetails[] {
  if (!Array.isArray(value)) return [];
  const candidates: WorkspaceCandidateDetails[] = [];
  for (const entry of value.slice(0, CANDIDATES_MAX)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { id, slug, name, home } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !ANY_UUID.test(id) || typeof slug !== 'string' || !SLUG.test(slug)
      || typeof name !== 'string' || name.length > NAME_MAX) continue;
    const team = home && typeof home === 'object' ? (home as Record<string, unknown>).team : undefined;
    if (home === 'personal') candidates.push({ id, slug, name, home: 'personal' });
    else if (typeof team === 'string' && SLUG.test(team)) candidates.push({ id, slug, name, home: { team } });
  }
  return candidates;
}

/** The server's `TRASH_ITEM_TYPES` (apps/backend/src/api/service/trash-contract.ts). */
const TRASH_ITEM_TYPES: ReadonlySet<string> = new Set(['artifact', 'bundle', 'folder', 'workspace']);
const TRASH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/** A trashed refusal's data, field by field: what it is, when it purges, and who may restore it. */
function trashedDetails(body: Record<string, unknown>): DomainErrorDetails {
  const details: DomainErrorDetails = {};
  if (typeof body.type === 'string' && TRASH_ITEM_TYPES.has(body.type)) details.type = body.type;
  if (typeof body.id === 'string' && TRASH_ID.test(body.id)) details.id = body.id;
  for (const field of ['deletedAt', 'purgeAt'] as const) {
    const value = body[field];
    if (typeof value === 'string' && ISO_DATE.test(value)) details[field] = value;
  }
  const via = body.via as Record<string, unknown> | undefined;
  if (via && typeof via === 'object' && typeof via.type === 'string' && TRASH_ITEM_TYPES.has(via.type)
    && typeof via.id === 'string' && TRASH_ID.test(via.id)) details.via = { type: via.type, id: via.id };
  if (body.restorable === true) {
    details.restorable = true;
    const by = body.deletedBy as Record<string, unknown> | null | undefined;
    details.deletedBy = by && typeof by === 'object' && typeof by.id === 'string' && by.id.length <= 255
      ? { id: by.id, alias: typeof by.alias === 'string' && by.alias.length <= 255 ? by.alias : null }
      : null;
    if (typeof body.workspaceId === 'string' && TRASH_ID.test(body.workspaceId)) details.workspaceId = body.workspaceId;
    const revision = body.workspaceRevision;
    if (typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0) details.workspaceRevision = revision;
  }
  return details;
}

export class CliError extends Error {
  public readonly details?: CliErrorDetails;
  /** The terminal hint for this failure when the command knows better than `ERROR_HINTS[code]`. */
  public hint?: string;
  /**
   * What a multi-call command finished before it failed (`rip trash purge --all`: the pages
   * purged), a local fact never copied from a response; `--json` prints it as `partial`.
   */
  public partial?: Record<string, unknown>;
  constructor(
    public readonly code: string,
    message: string,
    details?: CliErrorDetails,
    localTransportDetails?: TransportErrorDetails,
  ) {
    super(message);
    this.name = 'CliError';
    this.details = safeTransportErrorDetails(localTransportDetails) ?? safeErrorDetails(code, details);
  }
}

export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CliError('UNKNOWN_ERROR', message);
}
