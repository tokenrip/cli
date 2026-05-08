import { optionalAuthClient } from '../auth-client.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactCat(
  input: string,
  options: { version?: string },
): Promise<void> {
  const identifier = parseArtifactId(input);
  const { client } = optionalAuthClient();

  const endpoint = options.version
    ? `/v0/artifacts/${identifier}/versions/${options.version}/content`
    : `/v0/artifacts/${identifier}/content`;

  const response = await client.get(endpoint, { responseType: 'arraybuffer' });

  process.stdout.write(Buffer.from(response.data));
}
