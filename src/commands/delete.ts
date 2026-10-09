import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTrashed } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/** Move an artifact to the trash; it stays restorable for 30 days. */
export async function deleteArtifact(identifier: string, options: { dryRun?: boolean; expectedWorkspaceRevision?: string; why?: string } = {}): Promise<void> {
  const id = parseArtifactId(identifier);
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would move to trash', id }, (d) => `Would move ${d.id} to the trash (restorable for 30 days).`);
    return;
  }

  const { client } = requireAuthClient();
  const { data } = await client.delete(`/v0/artifacts/${id}`, { params: { expectedWorkspaceRevision: options.expectedWorkspaceRevision, why: options.why } });

  outputSuccess(data.data, formatTrashed);
}
