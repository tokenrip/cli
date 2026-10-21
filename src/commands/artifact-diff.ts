import { optionalAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionDiff } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/**
 * `GET /v0/diffs`: `rip artifact diff <artifact>` diffs the artifact's current version;
 * `--version-id <id>` alone diffs that version (its id names its artifact). `--from-version-id`
 * makes it a range: every change from that version up to the diffed one.
 */
export async function artifactDiff(
  input: string | undefined,
  options: { versionId?: string; fromVersionId?: string },
): Promise<void> {
  if (input !== undefined && options.versionId) {
    throw new CliError('INVALID_ARGS', 'A version id names its artifact: give the artifact or --version-id, not both.');
  }
  if (input === undefined && !options.versionId) {
    throw new CliError('INVALID_ARGS', 'Name the artifact (its current version), or --version-id for one version.');
  }
  const { client } = optionalAuthClient();
  const params: Record<string, string> = options.versionId
    ? { versionId: options.versionId }
    : { artifactId: parseArtifactId(input!) };
  if (options.fromVersionId) params.fromVersionId = options.fromVersionId;
  const { data } = await client.get('/v0/diffs', { params });
  outputSuccess(data.data, formatVersionDiff);
}
