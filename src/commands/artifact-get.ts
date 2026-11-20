import { optionalAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactMetadata } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function artifactGet(input: string): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();
  const { data } = await client.get(`/v0/artifacts/${uuid}`);
  // A file's earlier id still resolves (since the one-id change), and the reply names its id: a
  // UUID other than that one can only be the earlier id. An alias never is. Stderr, in every mode.
  const id = data.data?.id;
  if (UUID.test(uuid) && typeof id === 'string' && id.toLowerCase() !== uuid.toLowerCase()) {
    console.error(`Hint: ${uuid} is this file's earlier id; its id is ${id}. Use that one from now on.`);
  }
  outputSuccess(data.data, formatArtifactMetadata);
}
