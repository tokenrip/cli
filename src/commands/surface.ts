// Surface CLI commands — sibling to the `publish_surface` / `update_surface` /
// `validate_surface` / `promote_surface` / `list_surfaces` / `get_surface` /
// `open_surface` / `delete_surface` / `restore_surface_revision` MCP tools.
//
// All endpoints under `/v0/surfaces/*` are owner-only — we always use
// `requireAuthClient()` (NOT `optionalAuthClient`) so a missing API key
// fails fast with `NO_API_KEY` rather than producing an obscure 401.
//
// URL construction is CLI-side. The REST `POST /v0/surfaces` response does
// not include a `draftUrl` field (the MCP tool wrapper constructs it on the
// server). We mirror that construction here using `getFrontendUrl(config)` —
// the same helper that powers other share-link prints (`/s/<publicId>`,
// `/operator/auth`). Surface URLs are always `<frontend>/x/<publicId>`.

import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { CliError } from '../errors.js';
import { getFrontendUrl } from '../config.js';

// ── shared shapes ────────────────────────────────────────────────────

interface ValidationDiagnostic {
  kind: string;
  message?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface ValidationSummary {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  revisionId: string | null;
  validatedAt?: string;
  loadTimeMs?: number;
  // Diagnostic detail — present on create / update / validate responses
  // (backend echoes the arrays so a failing surface is debuggable from the
  // CLI). Older backends omit these; the formatter degrades to counts.
  errors?: ValidationDiagnostic[];
  warnings?: ValidationDiagnostic[];
  accessibility?: ValidationDiagnostic[];
  overflow?: ValidationDiagnostic[];
  blockedNetworkAttempts?: ValidationDiagnostic[];
}

interface SurfaceRevisionSummary {
  id: string;
  createdAt: string;
  htmlContent?: string;
}

interface SurfaceSummary {
  publicId: string;
  ownerId: string;
  title: string;
  description: string | null;
  mountId: string | null;
  bindings: Record<string, unknown>;
  status: 'draft' | 'published';
  currentRevision: SurfaceRevisionSummary | null;
  lastValidation: ValidationSummary | null;
  changedSinceValidation: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── helpers ──────────────────────────────────────────────────────────

function readBindings(file: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new CliError(
      'FILE_NOT_FOUND',
      `Could not read bindings file: ${file}`,
    );
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Bindings file must contain a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliError(
      'INVALID_JSON',
      `Invalid bindings JSON in ${file}: ${message}`,
    );
  }
}

function readHtmlFile(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new CliError('FILE_NOT_FOUND', `Could not read file: ${file}`);
  }
}

function surfaceUrl(publicId: string): string {
  return `${getFrontendUrl()}/x/${publicId}`;
}

function formatValidationLine(v: ValidationSummary | null | undefined): string {
  if (!v) return 'Validation: (not run)';
  const head = v.ok
    ? `Validated ✓ (${v.errorCount} errors, ${v.warningCount} warnings)`
    : `Failed ✗ (${v.errorCount} errors, ${v.warningCount} warnings)`;
  const detail = formatValidationDetail(v);
  return detail ? `${head}\n${detail}` : head;
}

/**
 * Render the per-finding diagnostic detail the backend now echoes on
 * create / update / validate responses. Without this, a `Failed ✗ (1 error)`
 * line is undebuggable from the CLI (the historical 3.1 gap). Degrades to ''
 * when an older backend omits the arrays.
 */
function formatValidationDetail(v: ValidationSummary): string {
  const lines: string[] = [];
  const section = (label: string, items?: ValidationDiagnostic[]) => {
    if (!items || items.length === 0) return;
    lines.push(`  ${label}:`);
    for (const d of items) {
      const loc =
        d.metadata && typeof d.metadata === 'object'
          ? formatLocation((d.metadata as Record<string, unknown>).location)
          : '';
      const where = d.url ? ` (${d.url})` : loc ? ` (${loc})` : '';
      lines.push(`    - [${d.kind}] ${d.message ?? ''}${where}`.trimEnd());
    }
  };
  section('Errors', v.errors);
  section('Blocked network', v.blockedNetworkAttempts);
  section('Accessibility', v.accessibility);
  section('Overflow', v.overflow);
  section('Warnings', v.warnings);
  return lines.join('\n');
}

function formatLocation(loc: unknown): string {
  if (!loc || typeof loc !== 'object') return '';
  const l = loc as { url?: string; lineNumber?: number; columnNumber?: number };
  if (!l.url) return '';
  const line = typeof l.lineNumber === 'number' ? `:${l.lineNumber}` : '';
  const col = typeof l.columnNumber === 'number' ? `:${l.columnNumber}` : '';
  return `${l.url}${line}${col}`;
}

function statusPill(s: string): string {
  return s === 'published' ? '[published]' : '[draft]';
}

function validationPill(
  v: ValidationSummary | null | undefined,
  stale: boolean,
): string {
  if (!v) return 'no-validation';
  const base = v.ok ? 'ok' : `fail:${v.errorCount}`;
  return stale ? `${base} (stale)` : base;
}

// ── publish ──────────────────────────────────────────────────────────

interface PublishOpts {
  title: string;
  mount?: string;
  bindings?: string;
  description?: string;
}

export async function surfacePublish(
  file: string,
  opts: PublishOpts,
): Promise<void> {
  if (!opts.bindings) {
    throw new CliError(
      'INVALID_BODY',
      'Surfaces require at least one binding. Provide --bindings <file.json>.',
    );
  }
  const htmlContent = readHtmlFile(file);
  const bindings = readBindings(opts.bindings);
  const { client } = requireAuthClient();
  const body: Record<string, unknown> = {
    title: opts.title,
    htmlContent,
    bindings,
  };
  if (opts.mount) body.mountId = opts.mount;
  if (opts.description) body.description = opts.description;
  const { data } = await client.post('/v0/surfaces', body);
  const payload = data.data as {
    publicId: string;
    currentRevisionId: string;
    validation: ValidationSummary | null;
  };
  outputSuccess(
    {
      publicId: payload.publicId,
      currentRevisionId: payload.currentRevisionId,
      draftUrl: surfaceUrl(payload.publicId),
      validation: payload.validation,
    },
    formatPublishOrUpdate,
  );
}

function formatPublishOrUpdate(raw: Record<string, unknown>): string {
  const p = raw as {
    publicId: string;
    currentRevisionId?: string;
    revisionId?: string;
    draftUrl: string;
    validation: ValidationSummary | null;
  };
  const revId = p.currentRevisionId ?? p.revisionId ?? '(none)';
  const lines: string[] = [];
  lines.push(`Surface: ${p.publicId}`);
  lines.push(`Revision: ${revId}`);
  lines.push(formatValidationLine(p.validation));
  lines.push(`Draft URL: ${p.draftUrl}`);
  return lines.join('\n');
}

// ── update ───────────────────────────────────────────────────────────

interface UpdateOpts {
  title?: string;
  description?: string;
  bindings?: string;
}

export async function surfaceUpdate(
  publicId: string,
  file: string,
  opts: UpdateOpts,
): Promise<void> {
  const htmlContent = readHtmlFile(file);
  const body: Record<string, unknown> = { htmlContent };
  if (opts.title) body.title = opts.title;
  if (opts.description) body.description = opts.description;
  if (opts.bindings) body.bindings = readBindings(opts.bindings);
  const { client } = requireAuthClient();
  const { data } = await client.patch(
    `/v0/surfaces/${encodeURIComponent(publicId)}`,
    body,
  );
  const payload = data.data as {
    revisionId: string;
    validation: ValidationSummary | null;
  };
  outputSuccess(
    {
      publicId,
      revisionId: payload.revisionId,
      draftUrl: surfaceUrl(publicId),
      validation: payload.validation,
    },
    formatPublishOrUpdate,
  );
}

// ── list ─────────────────────────────────────────────────────────────

interface ListOpts {
  mount?: string;
  status?: string;
}

export async function surfaceList(opts: ListOpts): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (opts.mount) params.mountId = opts.mount;
  if (opts.status) {
    if (opts.status !== 'draft' && opts.status !== 'published') {
      throw new CliError(
        'INVALID_BODY',
        '--status must be "draft" or "published".',
      );
    }
    params.status = opts.status;
  }
  const { data } = await client.get('/v0/surfaces', { params });
  const items = data.data as SurfaceSummary[];
  outputSuccess({ items } as unknown as Record<string, unknown>, (raw) => {
    const list = (raw as { items: SurfaceSummary[] }).items;
    if (list.length === 0) return '(no surfaces)';
    const lines: string[] = [];
    lines.push(`${list.length} surface${list.length === 1 ? '' : 's'}:`);
    for (const s of list) {
      lines.push('');
      lines.push(`  ${s.publicId}  ${statusPill(s.status)}`);
      lines.push(`    title: ${s.title}`);
      lines.push(
        `    validation: ${validationPill(s.lastValidation, s.changedSinceValidation)}`,
      );
      lines.push(`    updated: ${s.updatedAt}`);
      lines.push(`    url: ${surfaceUrl(s.publicId)}`);
    }
    return lines.join('\n');
  });
}

// ── get ──────────────────────────────────────────────────────────────

export async function surfaceGet(publicId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/surfaces/${encodeURIComponent(publicId)}`,
  );
  const surface = data.data as SurfaceSummary;
  outputSuccess(surface as unknown as Record<string, unknown>, (raw) => {
    const s = raw as unknown as SurfaceSummary;
    const lines: string[] = [];
    lines.push(`Surface: ${s.publicId} ${statusPill(s.status)}`);
    lines.push(`Title: ${s.title}`);
    if (s.description) lines.push(`Description: ${s.description}`);
    if (s.mountId) lines.push(`Mount: ${s.mountId}`);
    lines.push(`Owner: ${s.ownerId}`);
    lines.push(`Created: ${s.createdAt}`);
    lines.push(`Updated: ${s.updatedAt}`);
    lines.push(`URL: ${surfaceUrl(s.publicId)}`);
    lines.push('');
    const bindingKeys = Object.keys(s.bindings || {});
    lines.push(`Bindings (${bindingKeys.length}):`);
    for (const key of bindingKeys) {
      const b = (s.bindings as Record<string, { kind?: string }>)[key];
      const kind = b && typeof b === 'object' && b.kind ? b.kind : '?';
      lines.push(`  ${key}  [${kind}]`);
    }
    lines.push('');
    if (s.currentRevision) {
      lines.push(`Current revision: ${s.currentRevision.id}`);
      lines.push(`  createdAt: ${s.currentRevision.createdAt}`);
    } else {
      lines.push('Current revision: (none)');
    }
    lines.push('');
    lines.push(
      formatValidationLine(s.lastValidation) +
        (s.changedSinceValidation ? ' (stale — current revision not re-validated)' : ''),
    );
    return lines.join('\n');
  });
}

// ── validate ─────────────────────────────────────────────────────────

export async function surfaceValidate(publicId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/surfaces/${encodeURIComponent(publicId)}/validate`,
  );
  outputSuccess(data.data, (raw) => {
    const v = (raw as { validation: ValidationSummary }).validation;
    const lines: string[] = [];
    lines.push(formatValidationLine(v));
    if (v && typeof v.loadTimeMs === 'number') {
      lines.push(`loadTimeMs: ${v.loadTimeMs}`);
    }
    if (v && v.validatedAt) lines.push(`validatedAt: ${v.validatedAt}`);
    if (v && v.revisionId) lines.push(`revisionId: ${v.revisionId}`);
    return lines.join('\n');
  });
}

// ── promote ──────────────────────────────────────────────────────────

export async function surfacePromote(publicId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/surfaces/${encodeURIComponent(publicId)}/promote`,
  );
  // The REST endpoint returns `{ status }`. Surface warnings client-side
  // by checking the cached `lastValidation` via a follow-up GET — mirrors
  // the `promote_surface` MCP tool's behavior so the CLI report matches.
  const promoted = data.data as { status: string };
  const { data: detail } = await client.get(
    `/v0/surfaces/${encodeURIComponent(publicId)}`,
  );
  const surface = detail.data as SurfaceSummary;
  const warnings: string[] = [];
  if (surface.lastValidation && surface.lastValidation.errorCount > 0) {
    warnings.push(
      `Promoted with ${surface.lastValidation.errorCount} validation error(s) outstanding — run \`rip surface validate ${publicId}\` after fixing.`,
    );
  }
  const currentRevId = surface.currentRevision?.id;
  if (
    surface.lastValidation &&
    currentRevId &&
    surface.lastValidation.revisionId !== currentRevId
  ) {
    warnings.push(
      'Promoted with a stale validation summary — current revision has not been re-validated. Run `rip surface validate` to refresh.',
    );
  }
  outputSuccess(
    {
      status: promoted.status,
      url: surfaceUrl(publicId),
      warnings,
    },
    (raw) => {
      const p = raw as { status: string; url: string; warnings: string[] };
      const lines: string[] = [];
      lines.push(`Promoted ✓ (${p.status})`);
      lines.push(`URL: ${p.url}`);
      if (p.warnings.length > 0) {
        lines.push('');
        lines.push('Warnings:');
        for (const w of p.warnings) lines.push(`  - ${w}`);
      }
      return lines.join('\n');
    },
  );
}

// ── set-default ──────────────────────────────────────────────────────

export async function surfaceSetDefault(publicId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/surfaces/${encodeURIComponent(publicId)}/set-default`,
  );
  const res = data.data as { publicId: string; mountId: string };
  outputSuccess(res, (raw) => {
    const r = raw as { publicId: string; mountId: string };
    return `Default surface set ✓\nSurface: ${r.publicId}\nMount: ${r.mountId}`;
  });
}

// ── promote-to-imprint ───────────────────────────────────────────────

interface PromoteToImprintOpts {
  alias?: string;
  default?: boolean;
}

export async function surfacePromoteToImprint(
  publicId: string,
  opts: PromoteToImprintOpts,
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/surfaces/${encodeURIComponent(publicId)}/promote-to-imprint`,
    { alias: opts.alias, default: opts.default ?? false },
  );
  const res = data.data as { alias: string; htmlArtifactAlias: string; default: boolean };
  outputSuccess(res, (raw) => {
    const r = raw as { alias: string; htmlArtifactAlias: string; default: boolean };
    const lines = [
      `Promoted to imprint template ✓`,
      `Alias: ${r.alias}${r.default ? ' (default)' : ''}`,
      `Starter artifact: ${r.htmlArtifactAlias}`,
      'Publish the imprint to ship this template to new mounts.',
    ];
    return lines.join('\n');
  });
}

// ── open ─────────────────────────────────────────────────────────────

interface OpenOpts {
  browser?: boolean;
}

export async function surfaceOpen(
  publicId: string,
  opts: OpenOpts,
): Promise<void> {
  const url = surfaceUrl(publicId);
  if (opts.browser) {
    // Use execFile with an argv list (no shell) so the URL can't be
    // interpreted as a command — defends against any future code path
    // that passes a less-trusted URL.
    const platform = process.platform;
    let cmd: string | null = null;
    let args: string[] = [];
    if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '', url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    try {
      execFile(cmd, args, () => {
        /* fire-and-forget; failures fall through to URL print below */
      });
    } catch {
      /* swallow — we always print the URL too */
    }
  }
  outputSuccess({ url }, (raw) => (raw as { url: string }).url);
}

// ── revisions ────────────────────────────────────────────────────────

interface RevisionRow {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  createdBy: string;
}

export async function surfaceRevisions(publicId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/surfaces/${encodeURIComponent(publicId)}/revisions`,
  );
  const revs = data.data as RevisionRow[];
  outputSuccess({ revisions: revs } as unknown as Record<string, unknown>, (raw) => {
    const list = (raw as { revisions: RevisionRow[] }).revisions;
    if (list.length === 0) return '(no revisions)';
    const lines: string[] = [];
    lines.push(`${list.length} revision${list.length === 1 ? '' : 's'}:`);
    for (const r of list) {
      lines.push('');
      lines.push(`  ${r.id}`);
      lines.push(`    title: ${r.title}`);
      lines.push(`    created: ${r.createdAt}`);
      lines.push(`    by: ${r.createdBy}`);
      if (r.description) lines.push(`    description: ${r.description}`);
    }
    return lines.join('\n');
  });
}

// ── restore ──────────────────────────────────────────────────────────

export async function surfaceRestore(
  publicId: string,
  revisionId: string,
): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.post(
    `/v0/surfaces/${encodeURIComponent(publicId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
  );
  outputSuccess(data.data, (raw) => {
    const r = raw as { revisionId?: string; id?: string };
    const newRevId = r.revisionId ?? r.id ?? '(unknown)';
    const lines: string[] = [];
    lines.push(`Restored ✓ (new revision: ${newRevId})`);
    lines.push(
      `Validation required: run \`rip surface validate ${publicId}\``,
    );
    return lines.join('\n');
  });
}

// ── delete ───────────────────────────────────────────────────────────

interface DeleteOpts {
  yes?: boolean;
}

export async function surfaceDelete(
  publicId: string,
  opts: DeleteOpts,
): Promise<void> {
  if (!opts.yes) {
    throw new CliError(
      'CONFIRMATION_REQUIRED',
      'Pass --yes to confirm deletion.',
    );
  }
  const { client } = requireAuthClient();
  const { data } = await client.delete(
    `/v0/surfaces/${encodeURIComponent(publicId)}`,
  );
  outputSuccess(data.data, () => 'Deleted.');
}
