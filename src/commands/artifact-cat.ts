import { optionalAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactCat(
  input: string,
  options: { versionId?: string },
): Promise<void> {
  const identifier = parseArtifactId(input);
  const { client } = optionalAuthClient();

  // One version of this artifact: the content read checks it is one of the artifact's.
  const response = await client.get(`/v0/artifacts/${identifier}/content`, {
    responseType: 'arraybuffer',
    ...(options.versionId ? { params: { versionId: options.versionId } } : {}),
  });

  process.stdout.write(Buffer.from(response.data));
}
