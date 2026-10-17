import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionsPruned } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';

/**
 * Permanently delete an artifact's old versions, keeping the current one and the newest `--keep`
 * (default 0). Prints the versions removed, the bytes freed and how many versions remain.
 */
export async function pruneVersions(
  uuid: string,
  options: { keep?: string; expectedWorkspaceRevision?: string; why?: string } = {},
): Promise<void> {
  const keep = options.keep === undefined ? undefined : parseNonNegativeInteger(options.keep, '--keep');
  const expectedWorkspaceRevision = options.expectedWorkspaceRevision === undefined
    ? undefined
    : parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  const { client } = requireAuthClient();
  const { data } = await client.delete(`/v0/artifacts/${uuid}/versions`, {
    params: {
      ...(keep !== undefined ? { keep } : {}),
      ...(expectedWorkspaceRevision !== undefined ? { expectedWorkspaceRevision } : {}),
      ...(options.why !== undefined ? { why: options.why } : {}),
    },
  });
  outputSuccess(data.data, formatVersionsPruned);
}
