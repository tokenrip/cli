export interface ValidationDetail {
  path?: Array<string | number>;
  message?: string;
}
export interface DomainErrorDetails {
  field?: string;
  fields?: string[];
  status?: string;
  currentVersionId?: string;
  currentRevision?: number;
  currentWorkspaceRevision?: number;
  /** `INVALID_SKILL`: which skill rule refused (closed set, mirrors the server). */
  reason?: string;
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
    if (typeof body[field] === 'number' && Number.isFinite(body[field]) && body[field] >= 0) details[field] = body[field];
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

/** The server owns refusal codes; only curated correction metadata is copied. */
export function safeErrorDetails(code: string, value: unknown): DomainErrorDetails | ValidationDetail[] | undefined {
  if (Array.isArray(value)) {
    if (['CONFLICT', 'STATE_CONFLICT', 'PRECONDITION_REQUIRED', 'WORKSPACE_AUTHORITY', 'INELIGIBLE_STORAGE', 'INVALID_SCOPE',
      'WORKSPACE_SESSION_INVALID', 'WORKSPACE_SESSION_REVOKED', 'WORKSPACE_SESSION_EXPIRED', 'WORKSPACE_SESSION_INACTIVE',
      'WORKSPACE_PAGE_UNACKNOWLEDGED', 'INVALID_WORKSPACE_DELIVERY', 'INVALID_CURSOR', 'WORKSPACE_ARCHIVED'].includes(code)) return undefined;
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
  } else if (code === 'PRECONDITION_REQUIRED' && typeof body.field === 'string'
    && ['expectedVersionId', 'expectedRevision', 'expectedRevisions', 'expectedWorkspaceRevision'].includes(body.field)) details.field = body.field;
  else if (code === 'INVALID_SCOPE' && body.field === 'workspaceId') details.field = body.field;
  else if ((code === 'WORKSPACE_AUTHORITY' || code === 'INELIGIBLE_STORAGE') && Array.isArray(body.fields)) {
    const allowed = code === 'INELIGIBLE_STORAGE' ? ['publicAsset', 'public_asset'] : ['visibility', 'public', 'isPublic', 'is_public', 'team', 'teams', 'teamId', 'teamIds', 'folder', 'folderSlug'];
    const fields = [...new Set(body.fields.filter((field): field is string => typeof field === 'string' && allowed.includes(field)))].slice(0, 8);
    if (fields.length) details.fields = fields;
  } else if ((code === 'WORKSPACE_SESSION_INACTIVE' || code === 'WORKSPACE_SESSION_EXPIRED') && typeof body.status === 'string'
    && ['active', 'ended', 'expired', 'revoked', 'archived'].includes(body.status)) details.status = body.status;
  else if (code === 'INVALID_SKILL' && typeof body.reason === 'string' && SKILL_INVALID_REASONS.has(body.reason)) details.reason = body.reason;
  return Object.keys(details).length ? details : undefined;
}

export class CliError extends Error {
  public readonly details?: CliErrorDetails;
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
