import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionDeleted } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';

/** `DELETE /v0/versions/:versionId`: the version id names its artifact; inputs in the body. */
export async function deleteVersion(
  versionId: string,
  options: { dryRun?: boolean; expectedWorkspaceRevision?: string; why?: string } = {},
): Promise<void> {
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would delete version', versionId }, formatVersionDeleted);
    return;
  }

  const { client } = requireAuthClient();
  const expectedWorkspaceRevision = options.expectedWorkspaceRevision === undefined
    ? undefined
    : parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  const body = {
    ...(expectedWorkspaceRevision !== undefined ? { expectedWorkspaceRevision } : {}),
    ...(options.why !== undefined ? { why: options.why } : {}),
  };
  await client.delete(`/v0/versions/${encodeURIComponent(versionId)}`, Object.keys(body).length ? { data: body } : {});

  outputSuccess({ versionId, deleted: true }, formatVersionDeleted);
}
