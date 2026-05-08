import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactCreated } from '../formatters.js';

export async function forkArtifact(
  identifier: string,
  options: {
    version?: string;
    title?: string;
    folder?: string;
  },
): Promise<void> {
  const { client } = requireAuthClient();
  const body: Record<string, string> = {};
  if (options.version) body.versionId = options.version;
  if (options.title) body.title = options.title;
  if (options.folder) body.folder = options.folder;

  const res = await client.post(`/v0/artifacts/${identifier}/fork`, body);
  outputSuccess(res.data.data, formatArtifactCreated);
}
