import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatTrashed } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { parseNonNegativeInteger } from '../input.js';

/** The delete's inputs, in the JSON body (the server reads a delete's inputs from the body only). */
export function deleteBody(options: { expectedWorkspaceRevision?: string; why?: string }): Record<string, unknown> {
  return {
    ...(options.expectedWorkspaceRevision !== undefined
      ? { expectedWorkspaceRevision: parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision') }
      : {}),
    ...(options.why !== undefined ? { why: options.why } : {}),
  };
}

/** Move an artifact to the trash; it stays restorable for 30 days. */
export async function deleteArtifact(identifier: string, options: { dryRun?: boolean; expectedWorkspaceRevision?: string; why?: string } = {}): Promise<void> {
  const id = parseArtifactId(identifier);
  if (options.dryRun) {
    outputSuccess({ dryRun: true, action: 'would move to trash', id }, (d) => `Would move ${d.id} to the trash (restorable for 30 days).`);
    return;
  }

  const { client } = requireAuthClient();
  const body = deleteBody(options);
  const { data } = await client.delete(`/v0/artifacts/${id}`, Object.keys(body).length ? { data: body } : {});

  outputSuccess(data.data, formatTrashed);
}
