import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';

interface ListOptions {
  // No options beyond mountId for v1; future: ?layer=workflow|memory|all
}

interface RowsOptions {
  filter?: string[];
  sort?: string;
  limit?: string;
  after?: string;
}

interface PatchOptions {
  set?: string[];
}

/**
 * `--set key=value` repeats: `[ "status=seen", "owner=alice" ]` → `{ status: 'seen', owner: 'alice' }`.
 * Number-looking values stay strings on this path — agents that need typed
 * values should pass a JSON object via `--data-json` (future). For v1 the
 * schema validator on the backend coerces strings to enums/numbers as
 * declared in the table schema.
 */
function parseSetPairs(pairs: string[] | undefined): Record<string, unknown> {
  if (!pairs || pairs.length === 0) return {};
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) {
      throw new CliError('INVALID_SET', `Bad --set value (expected key=value): ${pair}`);
    }
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
  }
  return out;
}

/** Convert `--filter key:value` (repeatable) into the query-string `key:val,key:val` shape the controller expects. */
function joinFilters(filters: string[] | undefined): string | undefined {
  if (!filters || filters.length === 0) return undefined;
  return filters.join(',');
}

export async function mountTableList(mountId: string, _options: ListOptions): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(`/v0/operator/mounts/${encodeURIComponent(mountId)}/tables`);
  outputSuccess(data.data, (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return '(no tables)';
    const lines = ['slug                            kind                tags'];
    for (const r of rows as Array<Record<string, unknown>>) {
      const slug = String(r.slug ?? '').padEnd(30);
      const kind = String(r.templateKind ?? '').padEnd(18);
      const tags = Array.isArray(r.tags) && r.tags.length > 0 ? (r.tags as string[]).join(', ') : '—';
      lines.push(`${slug}  ${kind}  ${tags}`);
    }
    return lines.join('\n');
  });
}

export async function mountTableRows(
  mountId: string,
  slug: string,
  options: RowsOptions,
): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  const filterStr = joinFilters(options.filter);
  if (filterStr) params.filter = filterStr;
  if (options.sort) params.sort = options.sort;
  if (options.limit) params.limit = options.limit;
  if (options.after) params.after = options.after;
  const { data } = await client.get(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/tables/${encodeURIComponent(slug)}/rows`,
    { params },
  );
  outputSuccess(data, () => JSON.stringify(data, null, 2));
}

export async function mountTableLatest(mountId: string, slug: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/tables/${encodeURIComponent(slug)}/rows/latest`,
  );
  outputSuccess(data.data, () => JSON.stringify(data.data, null, 2));
}

export async function mountTableByTag(
  mountId: string,
  tag: string,
  options: RowsOptions,
): Promise<void> {
  const { client } = requireAuthClient();
  const params: Record<string, string> = {};
  const filterStr = joinFilters(options.filter);
  if (filterStr) params.filter = filterStr;
  if (options.sort) params.sort = options.sort;
  if (options.limit) params.limit = options.limit;
  const { data } = await client.get(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/tables-by-tag/${encodeURIComponent(tag)}/rows`,
    { params },
  );
  outputSuccess(data, () => JSON.stringify(data, null, 2));
}

export async function mountTablePatch(
  mountId: string,
  slug: string,
  rowId: string,
  options: PatchOptions,
): Promise<void> {
  const dataPatch = parseSetPairs(options.set);
  if (Object.keys(dataPatch).length === 0) {
    throw new CliError('NO_FIELDS', 'At least one --set key=value required');
  }
  const { client } = requireAuthClient();
  const { data } = await client.patch(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/tables/${encodeURIComponent(slug)}/rows/${encodeURIComponent(rowId)}`,
    { data: dataPatch },
  );
  outputSuccess(data.data, () => JSON.stringify(data.data, null, 2));
}

export async function mountTableAppend(
  mountId: string,
  slug: string,
  options: { rows?: string },
): Promise<void> {
  if (!options.rows) {
    throw new CliError('INVALID_ROWS', 'Provide --rows <json> (a JSON array of row objects)');
  }
  let rows: unknown;
  try {
    rows = JSON.parse(options.rows);
  } catch (err) {
    throw new CliError('INVALID_JSON', `--rows is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new CliError('INVALID_ROWS', '--rows must be a non-empty JSON array of row objects');
  }
  const { client } = requireAuthClient();
  // Operator control-row append — accepts workflow tables (unlike the artifact
  // rows route, which rejects them with WORKFLOW_TABLE_READONLY).
  const { data } = await client.post(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/tables/${encodeURIComponent(slug)}/rows`,
    { rows },
  );
  outputSuccess(data.data, () => JSON.stringify(data.data, null, 2));
}
