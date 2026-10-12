import { optionalAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatVersionDiff } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

export async function artifactDiff(
  input: string,
  options: { versionId?: string; from?: string },
): Promise<void> {
  const uuid = parseArtifactId(input);
  const { client } = optionalAuthClient();

  let versionId = options.versionId;
  if (!versionId) {
    const { data } = await client.get(`/v0/artifacts/${uuid}`);
    versionId = data.data.currentVersionId;
  }

  const path = `/v0/artifacts/${uuid}/versions/${versionId}/diff`;
  // --from: everything the versions from it to --version-id changed, against the version before it.
  const { data } = options.from
    ? await client.get(path, { params: { from: options.from } })
    : await client.get(path);
  outputSuccess(data.data, formatVersionDiff);
}
