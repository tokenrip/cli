import { optionalAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactMetadata } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactGet(input: string): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();
  const { data } = await client.get(`/v0/artifacts/${uuid}`);
  outputSuccess(data.data, formatArtifactMetadata);
}
