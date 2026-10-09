import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionDeleted } from '../formatters.js';
import { parseNonNegativeInteger } from '../input.js';

export async function deleteVersion(
  uuid: string,
  versionId: string,
  options: { dryRun?: boolean; expectedWorkspaceRevision?: string; why?: string } = {},
): Promise<void> {
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would delete version', artifactId: uuid, versionId }, formatVersionDeleted);
    return;
  }

  const { client } = requireAuthClient();
  const expectedWorkspaceRevision = options.expectedWorkspaceRevision === undefined
    ? undefined
    : parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  await client.delete(`/v0/artifacts/${uuid}/versions/${versionId}`, {
    params: {
      ...(expectedWorkspaceRevision !== undefined ? { expectedWorkspaceRevision } : {}),
      ...(options.why !== undefined ? { why: options.why } : {}),
    },
  });

  outputSuccess({ artifactId: uuid, versionId, deleted: true }, formatVersionDeleted);
}
