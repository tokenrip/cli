import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function archiveArtifact(identifier: string, options: { expectedWorkspaceRevision?: string; workspaceSessionId?: string } = {}): Promise<void> {
  const id = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  await client.post(`/v0/artifacts/${id}/archive`, { expectedWorkspaceRevision: options.expectedWorkspaceRevision === undefined ? undefined : Number(options.expectedWorkspaceRevision), workspaceSessionId: options.workspaceSessionId });
  outputSuccess({ id, state: 'archived' });
}

export async function unarchiveArtifact(identifier: string, options: { expectedWorkspaceRevision?: string; workspaceSessionId?: string } = {}): Promise<void> {
  const id = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  await client.post(`/v0/artifacts/${id}/unarchive`, { expectedWorkspaceRevision: options.expectedWorkspaceRevision === undefined ? undefined : Number(options.expectedWorkspaceRevision), workspaceSessionId: options.workspaceSessionId });
  outputSuccess({ id, state: 'published' });
}
