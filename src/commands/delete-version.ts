import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionDeleted } from '../formatters.js';

export async function deleteVersion(
  uuid: string,
  versionId: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would delete version', artifactId: uuid, versionId }, formatVersionDeleted);
    return;
  }

  const { client } = requireAuthClient();
  await client.delete(`/v0/artifacts/${uuid}/versions/${versionId}`);

  outputSuccess({ artifactId: uuid, versionId, deleted: true }, formatVersionDeleted);
}
