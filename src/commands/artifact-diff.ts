import { optionalAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionDiff } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactDiff(
  input: string,
  options: { version?: string },
): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();

  let versionId = options.version;
  if (!versionId) {
    const { data } = await client.get(`/v0/artifacts/${uuid}`);
    versionId = data.data.currentVersionId;
  }

  const { data } = await client.get(`/v0/artifacts/${uuid}/versions/${versionId}/diff`);
  outputSuccess(data.data, formatVersionDiff);
}
