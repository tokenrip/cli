import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactDeleted } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function deleteArtifact(identifier: string, options: { dryRun?: boolean; expectedWorkspaceRevision?: string; workspaceSessionId?: string } = {}): Promise<void> {
  const id = parseArtifactId(identifier);
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would delete', id }, formatArtifactDeleted);
    return;
  }

  const { client } = requireAuthClient();
  await client.delete(`/v0/artifacts/${id}`, { params: { expectedWorkspaceRevision: options.expectedWorkspaceRevision, workspaceSessionId: options.workspaceSessionId } });

  outputSuccess({ id, deleted: true }, formatArtifactDeleted);
}
