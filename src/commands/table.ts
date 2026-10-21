import fs from 'node:fs';
import path from 'node:path';
import { optionalAuthClient, requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatTableRows, formatRowsAppended, formatRowUpdated, formatRowsDeleted } from '../formatters.js';
import { parseJsonObjectArrayOption, parseJsonObjectOption } from '../json.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function tableAppend(
  identifier: string,
  options: { data?: string; file?: string; upsert?: boolean; expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const uuid = parseArtifactId(identifier);
  let rows: Record<string, unknown>[];

  if (options.file) {
    const absPath = path.resolve(options.file);
    if (!fs.existsSync(absPath)) {
      throw new CliError('FILE_NOT_FOUND', `File not found: ${absPath}`);
    }
    rows = parseJsonObjectArrayOption(fs.readFileSync(absPath, 'utf-8'), '--file');
  } else if (options.data) {
    rows = parseJsonObjectArrayOption(options.data, '--data');
  } else {
    throw new CliError('MISSING_FIELD', 'Provide --data or --file');
  }

  const { client } = requireAuthClient();
  const body: Record<string, unknown> = { rows };
  // Upsert matches on the table's key (its unique: true column); a table without one refuses NO_TABLE_KEY.
  if (options.upsert) body.upsert = true;
  if (options.expectedWorkspaceRevision) body.expectedWorkspaceRevision = Number(options.expectedWorkspaceRevision);
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.post(`/v0/artifacts/${uuid}/rows`, body);
  outputSuccess({ rows: data.data, count: data.data.length }, formatRowsAppended);
}

export async function tableRows(
  identifier: string,
  options: {
    limit?: string;
    after?: string;
    before?: string;
    sortBy?: string;
    sortOrder?: string;
    filter?: string[];
    fields?: string;
    includeTotal?: boolean;
  },
): Promise<void> {
  const uuid = parseArtifactId(identifier);
  // A table anyone may read (link or public) reads without signing in, as the route does.
  const { client } = optionalAuthClient();
  const params: Record<string, string> = {};
  if (options.limit) params.limit = options.limit;
  if (options.after) params.after = options.after;
  if (options.before) params.before = options.before;
  if (options.sortBy) params.sort_by = options.sortBy;
  if (options.sortOrder) params.sort_order = options.sortOrder;
  if (options.fields) params.fields = options.fields;
  if (options.includeTotal) params.include_total = 'true';
  if (options.filter) {
    for (const f of options.filter) {
      // Split on the first '=' so an operator suffix in the key survives:
      // `revenue[gte]=75` → `filter.revenue[gte]=75`.
      const eq = f.indexOf('=');
      if (eq > 0) params[`filter.${f.slice(0, eq)}`] = f.slice(eq + 1);
    }
  }

  const { data } = await client.get(`/v0/artifacts/${uuid}/rows`, { params });
  outputSuccess(data.data, formatTableRows);
}

/** `PUT /v0/rows/:rowId`: the row id names its table. */
export async function tableUpdate(
  rowId: string,
  options: { data: string; expectedRevision?: string; expectedWorkspaceRevision?: string; why?: string },
): Promise<void> {
  const parsed = parseJsonObjectOption(options.data, '--data');
  const { client } = requireAuthClient();
  const { data } = await client.put(`/v0/rows/${encodeURIComponent(rowId)}`, { data: parsed, expectedRevision: options.expectedRevision === undefined ? undefined : Number(options.expectedRevision), expectedWorkspaceRevision: options.expectedWorkspaceRevision === undefined ? undefined : Number(options.expectedWorkspaceRevision), why: options.why });
  outputSuccess(data.data, formatRowUpdated);
}

/** `DELETE /v0/rows`: rows of one table by their own ids. */
export async function tableDelete(
  options: { rowIds: string; expectedRevisions?: string; why?: string },
): Promise<void> {
  const ids = options.rowIds.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const { client } = requireAuthClient();
  let expectedRevisions: Record<string, number> | undefined;
  if (options.expectedRevisions) {
    try { expectedRevisions = JSON.parse(options.expectedRevisions); }
    catch { throw new CliError('INVALID_JSON', '--expected-revisions is not valid JSON.'); }
  }
  // The server's count: an id that names no row you can read is skipped, not deleted.
  const { data } = await client.delete('/v0/rows', { data: { rowIds: ids, expectedRevisions, why: options.why } });
  outputSuccess({ deleted: (data as { data: { deleted: number } }).data.deleted }, formatRowsDeleted);
}
