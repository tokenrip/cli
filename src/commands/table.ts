import fs from 'node:fs';
import path from 'node:path';
import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatTableRows, formatRowsAppended, formatRowUpdated, formatRowsDeleted } from '../formatters.js';
import { parseJsonObjectArrayOption, parseJsonObjectOption } from '../json.js';

export async function tableAppend(
  uuid: string,
  options: { data?: string; file?: string; upsertOn?: string; expectedWorkspaceRevision?: string; workspaceSessionId?: string },
): Promise<void> {
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
  if (options.upsertOn) body.upsertOn = options.upsertOn;
  if (options.expectedWorkspaceRevision) body.expectedWorkspaceRevision = Number(options.expectedWorkspaceRevision);
  if (options.workspaceSessionId) body.workspaceSessionId = options.workspaceSessionId;
  const { data } = await client.post(`/v0/artifacts/${uuid}/rows`, body);
  outputSuccess({ rows: data.data, count: data.data.length }, formatRowsAppended);
}

export async function tableRows(
  uuid: string,
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
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  if (options.limit) params.limit = options.limit;
  if (options.after) params.after = options.after;
  if (options.before) params.before = options.before;
  if (options.sortBy) params.sort_by = options.sortBy;
  if (options.sortOrder) params.sort_order = options.sortOrder;
  if (options.fields) params.fields = options.fields;
  if (options.includeTotal) params.include_total = '1';
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

export async function tableUpdate(
  uuid: string,
  rowId: string,
  options: { data: string; expectedRevision?: string; expectedWorkspaceRevision?: string; workspaceSessionId?: string },
): Promise<void> {
  const parsed = parseJsonObjectOption(options.data, '--data');
  const { client } = requireAuthClient();
  const { data } = await client.put(`/v0/artifacts/${uuid}/rows/${rowId}`, { data: parsed, expectedRevision: options.expectedRevision === undefined ? undefined : Number(options.expectedRevision), expectedWorkspaceRevision: options.expectedWorkspaceRevision === undefined ? undefined : Number(options.expectedWorkspaceRevision), workspaceSessionId: options.workspaceSessionId });
  outputSuccess(data.data, formatRowUpdated);
}

export async function tableDelete(
  uuid: string,
  options: { rows: string; expectedRevisions?: string; workspaceSessionId?: string },
): Promise<void> {
  const ids = options.rows.split(',').map((s) => s.trim());
  const { client } = requireAuthClient();
  let expectedRevisions: Record<string, number> | undefined;
  if (options.expectedRevisions) {
    try { expectedRevisions = JSON.parse(options.expectedRevisions); }
    catch { throw new CliError('INVALID_JSON', '--expected-revisions is not valid JSON.'); }
  }
  await client.delete(`/v0/artifacts/${uuid}/rows`, { data: { row_ids: ids, expectedRevisions, workspaceSessionId: options.workspaceSessionId } });
  outputSuccess({ deleted: ids.length }, formatRowsDeleted);
}
