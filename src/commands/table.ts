import fs from 'node:fs';
import path from 'node:path';
import { optionalAuthClient, requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { getFrontendUrl } from '../config.js';
import { formatArtifactCreated, formatTableRows, formatRowsAppended, formatRowUpdated, formatRowsDeleted } from '../formatters.js';
import { assertWorkspaceCreationScope, parseRevision } from '../input.js';
import { parseJsonObjectArrayOption, parseJsonObjectOption, parseJsonOption } from '../json.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { addHomeFields, addWorkspaceFields, artifactCreatedPayload } from './publish.js';

/**
 * `rip table create`, and `rip artifact publish --type table`: one `POST /v0/artifacts` with
 * `type: 'table'`. The columns come from `--schema` or `--schema-file`; `--from-csv` sends the file
 * as the table's `content`, which imports its rows (a schema then types the columns). `parent`,
 * `context` and `refs` are publish's lineage flags; `table create` has none.
 */
export async function tableCreate(
  title: string | undefined,
  options: {
    schema?: string;
    schemaFile?: string;
    fromCsv?: string;
    headers?: boolean;
    strict?: boolean;
    description?: string;
    alias?: string;
    parent?: string;
    context?: string;
    refs?: string;
    team?: string;
    folder?: string;
    visibility?: string;
    workspaceId?: string;
    why?: string;
    dryRun?: boolean;
  },
): Promise<void> {
  assertWorkspaceCreationScope(options);
  if (options.schema === undefined && options.schemaFile === undefined && options.fromCsv === undefined) {
    throw new CliError('INVALID_ARGS', 'A table needs its columns: provide --schema <json>, --schema-file <path> or --from-csv <file>.');
  }
  if (options.schema !== undefined && options.schemaFile !== undefined) {
    throw new CliError('INVALID_ARGS', 'Provide either --schema or --schema-file, not both.');
  }
  if (options.fromCsv !== undefined && options.strict) {
    throw new CliError('INVALID_ARGS', 'A table imported from CSV is not strict: --strict applies to a table created from --schema.');
  }
  if (options.headers && options.fromCsv === undefined) {
    throw new CliError('INVALID_ARGS', '--headers applies to CSV imported into a table (--from-csv).');
  }
  // The server refuses the pair (SCHEMA_AND_HEADERS_CONFLICT): with a schema every CSV line is data.
  if (options.headers && (options.schema !== undefined || options.schemaFile !== undefined)) {
    throw new CliError('INVALID_ARGS', 'Use one with --from-csv: --headers (the first line names the columns) or a schema, --schema or --schema-file (every line is a row).');
  }

  let schema: unknown;
  if (options.schema !== undefined) {
    schema = parseJsonOption(options.schema, '--schema');
  } else if (options.schemaFile !== undefined) {
    const schemaPath = path.resolve(options.schemaFile);
    if (!fs.existsSync(schemaPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${schemaPath}`);
    schema = parseJsonOption(fs.readFileSync(schemaPath, 'utf-8'), options.schemaFile);
  }

  const body: Record<string, unknown> = { type: 'table' };
  if (options.fromCsv !== undefined) {
    const csvPath = path.resolve(options.fromCsv);
    if (!fs.existsSync(csvPath)) throw new CliError('FILE_NOT_FOUND', `File not found: ${csvPath}`);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const csvTitle = title || path.basename(csvPath, path.extname(csvPath));
    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create table from csv', title: csvTitle, rows: content.split('\n').length }, formatArtifactCreated);
      return;
    }
    // A table with CSV content imports its rows (the server's one selector for CSV import).
    body.content = content;
    body.title = csvTitle;
    if (options.headers) body.headers = true;
    if (schema !== undefined) body.schema = schema;
  } else {
    const schemaTitle = title || 'Untitled Table';
    if (options.dryRun) {
      outputSuccess({ dryRun: true, action: 'would create table', title: schemaTitle, schema }, formatArtifactCreated);
      return;
    }
    body.title = schemaTitle;
    body.schema = schema;
  }
  // An empty description is not sent: the server would store the empty string.
  if (options.description) body.description = options.description;
  if (options.alias) body.alias = options.alias;
  if (options.parent) body.parentArtifactId = options.parent;
  if (options.context) body.creatorContext = options.context;
  if (options.refs) body.inputReferences = options.refs.split(',').map((r) => r.trim());
  addHomeFields(body, options);
  // No publicAsset or metadata: a table is never a public asset and keeps its schema in metadata.
  if (options.visibility) body.visibility = options.visibility;
  if (options.strict) body.strict = true;
  addWorkspaceFields(body, options);

  const { client, config } = requireAuthClient();
  const { data } = await client.post('/v0/artifacts', body);
  const url = data.data.url || `${getFrontendUrl(config)}/s/${data.data.id}`;
  outputSuccess(artifactCreatedPayload(data.data, url, options.alias), formatArtifactCreated);
}

export async function tableAppend(
  identifier: string,
  options: { data?: string; file?: string; upsert?: boolean; expectedTableRevision?: string; why?: string },
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
  if (options.expectedTableRevision !== undefined) body.expectedTableRevision = tableRevisionOption(options.expectedTableRevision);
  if (options.why !== undefined) body.why = options.why;
  const { data } = await client.post(`/v0/artifacts/${uuid}/rows`, body);
  // `data` is the array of rows, so the reply's hints sit beside it; the receipt carries them.
  outputSuccess({ rows: data.data, count: data.data.length, ...(data.hints ? { hints: data.hints } : {}) }, formatRowsAppended);
}

/** `rip table rows --all`: rows a call (the server's most) and where the walk stops. */
export const TABLE_ROWS_ALL_PAGE = 5000;
export const TABLE_ROWS_ALL_CAP = 10_000;

type TableRowsPage = {
  rows: Array<{ id: string }>;
  nextCursor: string | null;
  total?: number;
  missingFields?: string[];
  /** `--all` keeps the first page's: a change mid-read then conflicts when it is sent back (design §8). */
  tableRevision?: number;
};

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
    all?: boolean;
  },
): Promise<void> {
  if (options.all && (options.limit || options.before)) {
    throw new CliError('INVALID_ARGS', '--all reads every page from the start (or from --after): it does not go with --limit or --before.');
  }
  const uuid = parseArtifactId(identifier);
  // A table anyone may read (link or public) reads without signing in, as the route does.
  const { client } = optionalAuthClient();
  const params: Record<string, string> = {};
  if (options.limit) params.limit = options.limit;
  if (options.after) params.after = options.after;
  if (options.before) params.before = options.before;
  if (options.sortBy) params.sortBy = options.sortBy;
  if (options.sortOrder) params.sortOrder = options.sortOrder;
  if (options.fields) params.fields = options.fields;
  if (options.includeTotal) params.includeTotal = 'true';
  if (options.filter) {
    for (const f of options.filter) {
      // Split on the first '=' so an operator suffix in the key survives:
      // `revenue[gte]=75` → `filters.revenue[gte]=75`.
      const eq = f.indexOf('=');
      if (eq > 0) params[`filters.${f.slice(0, eq)}`] = f.slice(eq + 1);
    }
  }

  if (!options.all) {
    const { data } = await client.get(`/v0/artifacts/${uuid}/rows`, { params });
    outputSuccess(data.data, formatTableRows);
    return;
  }

  // Every page with the same filters, sort and fields, following `nextCursor` (a row id) until it is
  // null or the cap is reached; the total is asked for once. A cursor the server repeats stops the walk.
  const { includeTotal: _total, after: _after, ...walkParams } = params;
  const result: TableRowsPage = { rows: [], nextCursor: null };
  let cursor: string | undefined = options.after;
  let first = true;
  for (;;) {
    const pageParams: Record<string, string> = { ...walkParams, limit: String(TABLE_ROWS_ALL_PAGE) };
    if (cursor) pageParams.after = cursor;
    if (first && options.includeTotal) pageParams.includeTotal = 'true';
    const { data } = await client.get(`/v0/artifacts/${uuid}/rows`, { params: pageParams });
    const page = data.data as TableRowsPage;
    if (first && typeof page.total === 'number') result.total = page.total;
    if (first && Array.isArray(page.missingFields)) result.missingFields = page.missingFields;
    if (first && typeof page.tableRevision === 'number') result.tableRevision = page.tableRevision;
    first = false;
    result.rows.push(...page.rows);
    const next = typeof page.nextCursor === 'string' ? page.nextCursor : null;
    if (result.rows.length >= TABLE_ROWS_ALL_CAP) {
      const more = next !== null || result.rows.length > TABLE_ROWS_ALL_CAP;
      result.rows.length = TABLE_ROWS_ALL_CAP;
      result.nextCursor = more ? result.rows[TABLE_ROWS_ALL_CAP - 1].id : null;
      break;
    }
    if (next === null) break;
    if (next === cursor) {
      throw new CliError('ROWS_CURSOR_REPEATED', `The server answered the cursor it was given, so the read stopped after ${result.rows.length} rows instead of repeating that page.`);
    }
    cursor = next;
  }
  outputSuccess(result as unknown as Record<string, unknown>, formatTableRows);
}

const optionalNumber = (value: string | undefined): number | undefined => (value === undefined ? undefined : Number(value));
/** `--expected-table-revision`: a whole number of at least 1, refused locally otherwise. */
const tableRevisionOption = (value: string): number => parseRevision(value, 'rip table rows <table> --json', '--expected-table-revision');

/** `PUT /v0/rows/:rowId`: the row id names its table. */
export async function tableUpdate(
  rowId: string,
  options: { data: string; expectedRevision?: string; expectedTableRevision?: string; why?: string },
): Promise<void> {
  const parsed = parseJsonObjectOption(options.data, '--data');
  const expectedTableRevision = options.expectedTableRevision === undefined ? undefined : tableRevisionOption(options.expectedTableRevision);
  const { client } = requireAuthClient();
  const { data } = await client.put(`/v0/rows/${encodeURIComponent(rowId)}`, {
    data: parsed,
    expectedRevision: optionalNumber(options.expectedRevision),
    expectedTableRevision,
    why: options.why,
  });
  outputSuccess(data.data, formatRowUpdated);
}

/**
 * `DELETE /v0/rows`: rows of one table by their own ids, named as arguments (each may be a comma
 * list) or with `--row-ids`, one form a call. Both together is also the retired
 * `delete <table> --row-ids …`, so that refusal says the table is not named.
 */
export async function tableDelete(
  rowIds: string[],
  options: { rowIds?: string; expectedRevisions?: string; expectedTableRevision?: string; why?: string },
): Promise<void> {
  if (rowIds.length > 0 && options.rowIds !== undefined) {
    throw new CliError('INVALID_ARGS', 'Name the rows as arguments or with --row-ids, not both. A row id names its table, so the table is not named: rip table delete <rowId> <rowId>');
  }
  const ids = (options.rowIds !== undefined ? [options.rowIds] : rowIds)
    .flatMap((named) => named.split(',')).map((s) => s.trim()).filter((s) => s.length > 0);
  if (ids.length === 0) {
    throw new CliError('INVALID_ARGS', 'Name the rows to delete: rip table delete <rowId> <rowId> (or --row-ids <id,id>)');
  }
  const expectedTableRevision = options.expectedTableRevision === undefined ? undefined : tableRevisionOption(options.expectedTableRevision);
  const { client } = requireAuthClient();
  let expectedRevisions: Record<string, number> | undefined;
  if (options.expectedRevisions) {
    try { expectedRevisions = JSON.parse(options.expectedRevisions); }
    catch { throw new CliError('INVALID_JSON', '--expected-revisions is not valid JSON.'); }
  }
  // The server's count: an id that names no row you can read is skipped, not deleted.
  const { data } = await client.delete('/v0/rows', {
    data: { ids, expectedRevisions, expectedTableRevision, why: options.why },
  });
  // The table's revision is there only when the named rows resolved a table.
  const receipt = (data as { data: { deleted: number; tableRevision?: number } }).data;
  outputSuccess(
    { deleted: receipt.deleted, ...(typeof receipt.tableRevision === 'number' ? { tableRevision: receipt.tableRevision } : {}) },
    formatRowsDeleted,
  );
}
