import { optionalAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionList, formatVersionMetadata } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactVersions(
  input: string,
  options: { version?: string },
): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();

  if (options.version) {
    const { data } = await client.get(`/v0/artifacts/${uuid}/versions/${options.version}`);
    outputSuccess(data.data, formatVersionMetadata);
  } else {
    const { data } = await client.get(`/v0/artifacts/${uuid}/versions`);
    outputSuccess(data.data as unknown as Record<string, unknown>, formatVersionList);
  }
}
