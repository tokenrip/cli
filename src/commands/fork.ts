import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactCreated } from '../formatters.js';

export async function forkArtifact(
  identifier: string,
  options: {
    versionId?: string;
    title?: string;
    folder?: string;
    why?: string;
  },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, string> = {};
  if (options.versionId) body.versionId = options.versionId;
  if (options.title) body.title = options.title;
  if (options.folder) body.folder = options.folder;
  if (options.why !== undefined) body.why = options.why;

  const res = await client.post(`/v0/artifacts/${identifier}/fork`, body);
  outputSuccess(res.data.data, formatArtifactCreated);
}
