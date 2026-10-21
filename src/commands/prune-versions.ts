import { requireAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { outputSuccess } from '../output.js';
import { formatVersionsPruned } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';

/**
 * Permanently delete an artifact's old versions, keeping the current one and the newest `--keep`
 * (default 0). Prints the versions removed, the bytes freed and how many versions remain.
 */
export async function pruneVersions(
  identifier: string,
  options: { keep?: string; expectedWorkspaceRevision?: string; why?: string } = {},
): Promise<void> {
  const uuid = parseArtifactId(identifier);
  const keep = options.keep === undefined ? undefined : parseNonNegativeInteger(options.keep, '--keep');
  const expectedWorkspaceRevision = options.expectedWorkspaceRevision === undefined
    ? undefined
    : parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  const { client } = requireAuthClient();
  // Inputs in the DELETE body (a query key on a write is refused).
  const body = {
    ...(keep !== undefined ? { keep } : {}),
    ...(expectedWorkspaceRevision !== undefined ? { expectedWorkspaceRevision } : {}),
    ...(options.why !== undefined ? { why: options.why } : {}),
  };
  const { data } = await client.delete(`/v0/artifacts/${uuid}/versions`, Object.keys(body).length ? { data: body } : {});
  outputSuccess(data.data, formatVersionsPruned);
}
