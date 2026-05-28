import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';

/**
 * `rip mount inspect <mountId>` — SDK-shaped discovery surface for a mount.
 *
 * Wraps `GET /v0/operator/mounts/:mountId/inspect`. Returns the same payload
 * served to the `inspect_mount` MCP tool: mount metadata + per-collection
 * schema, ≤5 sample rows, recommended binding, and `window.tokenrip.collections`
 * SDK examples — no raw `/v0/...` URLs surface to the caller.
 *
 * Output: JSON in `--json` mode (pass-through `{ ok, data }` envelope); in
 * human mode a compact summary suitable for terminal use. The AI consumer is
 * the primary audience — when in doubt prefer `--json` for programmatic use.
 */
export async function mountInspect(mountId: string): Promise<void> {
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/operator/mounts/${encodeURIComponent(mountId)}/inspect`,
  );
  outputSuccess(data.data, formatMountInspection);
}

interface InspectField {
  name: string;
  type: string;
  writable: boolean;
  values?: string[];
}

interface InspectCollection {
  slug: string;
  title?: string;
  scope: 'workflow' | 'memory';
  tags: string[];
  schema: InspectField[];
  sampleRows: Array<{ id: string; data: Record<string, unknown> }>;
  sdkExamples: string[];
}

interface InspectMountPayload {
  mount: { id: string; slug?: string; title: string; imprintSlug: string };
  collections: InspectCollection[];
}

function formatMountInspection(raw: Record<string, unknown>): string {
  const inspection = raw as unknown as InspectMountPayload;
  const lines: string[] = [];
  const m = inspection.mount;
  lines.push(`Mount: ${m.title} (imprint: ${m.imprintSlug})`);
  lines.push(`ID: ${m.id}`);
  if (m.slug) lines.push(`Name: ${m.slug}`);
  lines.push('');
  if (!inspection.collections || inspection.collections.length === 0) {
    lines.push('(no collections)');
    return lines.join('\n');
  }
  lines.push(`Collections (${inspection.collections.length}):`);
  for (const c of inspection.collections) {
    const tagPart = c.tags && c.tags.length > 0 ? `  tags: ${c.tags.join(', ')}` : '';
    lines.push('');
    lines.push(`  ${c.slug}  [${c.scope}]${tagPart}`);
    if (c.title) lines.push(`    title: ${c.title}`);
    const writable = c.schema.filter((f) => f.writable).length;
    lines.push(`    schema: ${c.schema.length} fields (${writable} writable)`);
    lines.push(`    sample rows: ${c.sampleRows.length}`);
    if (c.sdkExamples && c.sdkExamples.length > 0) {
      lines.push(`    SDK: ${c.sdkExamples[0]}`);
    }
  }
  return lines.join('\n');
}
