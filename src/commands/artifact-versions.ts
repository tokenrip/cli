import { optionalAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionList, formatVersionMetadata } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/**
 * `rip artifact versions <artifact>` lists an artifact's versions; `--version-id <id>` alone reads
 * one version by its own id (`GET /v0/versions/:versionId`), which names its artifact.
 */
export async function artifactVersions(
  input: string | undefined,
  options: { versionId?: string },
): Promise<void> {
  const { client } = optionalAuthClient();

  if (options.versionId) {
    if (input !== undefined) throw new CliError('INVALID_ARGS', 'A version id names its artifact: give --version-id alone, without the artifact.');
    const { data } = await client.get(`/v0/versions/${encodeURIComponent(options.versionId)}`);
    outputSuccess(data.data, formatVersionMetadata);
    return;
  }
  if (input === undefined) throw new CliError('INVALID_ARGS', 'Name the artifact whose versions to list, or --version-id for one version.');
  const { data } = await client.get(`/v0/artifacts/${parseArtifactId(input)}/versions`);
  outputSuccess(data.data as unknown as Record<string, unknown>, formatVersionList);
}
