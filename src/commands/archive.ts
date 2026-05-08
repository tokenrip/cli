import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function archiveArtifact(identifier: string): Promise<void> {
  const id = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  await client.post(`/v0/artifacts/${id}/archive`);
  outputSuccess({ id, state: 'archived' });
}

export async function unarchiveArtifact(identifier: string): Promise<void> {
  const id = parseArtifactId(identifier);
  const { client } = requireAuthClient();
  await client.post(`/v0/artifacts/${id}/unarchive`);
  outputSuccess({ id, state: 'published' });
}
