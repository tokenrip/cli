import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/**
 * `rip artifact inspect <publicId>` — SDK-shaped discovery surface for a
 * text-supporting artifact.
 *
 * Wraps `GET /v0/operator/artifacts/:publicId/inspect`. Returns the same
 * payload served to the `inspect_artifact` MCP tool: title, description,
 * `recommendedBinding` (kind: 'artifact'), `editable`, and a ≤2 KB UTF-8
 * `contentPreview` for markdown / html / code / text / json artifacts. Non-
 * text types are rejected by the backend with `INVALID_ARTIFACT_TYPE`.
 *
 * Output: JSON in `--json` mode (pass-through `{ ok, data }` envelope); in
 * human mode a compact summary plus the first 200 chars of the preview.
 */
export async function artifactInspect(identifier: string): Promise<void> {
  const publicId = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  const { data } = await client.get(
    `/v0/operator/artifacts/${encodeURIComponent(publicId)}/inspect`,
  );
  outputSuccess(data.data, formatArtifactInspection);
}

interface InspectArtifactPayload {
  publicId: string;
  title: string;
  description?: string;
  type: string;
  mimeType?: string;
  editable: boolean;
  recommendedBindingKey: string;
  contentPreview?: string;
}

function formatArtifactInspection(raw: Record<string, unknown>): string {
  const inspection = raw as unknown as InspectArtifactPayload;
  const lines: string[] = [];
  lines.push(`Artifact: ${inspection.title} (${inspection.type}, editable=${inspection.editable})`);
  lines.push(`ID: ${inspection.publicId}`);
  lines.push(`Binding key: ${inspection.recommendedBindingKey}`);
  if (inspection.description) lines.push(`Description: ${inspection.description}`);
  if (inspection.mimeType) lines.push(`Mime: ${inspection.mimeType}`);
  if (inspection.contentPreview) {
    const snippet = inspection.contentPreview.slice(0, 200);
    const elided = inspection.contentPreview.length > 200 ? '…' : '';
    lines.push('');
    lines.push('Preview:');
    lines.push(snippet + elided);
  }
  return lines.join('\n');
}
