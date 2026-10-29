import { optionalAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatVersionDiff } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';

/**
 * `GET /v0/diffs`: `rip artifact diff <artifact>` diffs the artifact's current version;
 * `--version-id <id>` alone diffs that version (its id names its artifact). `--from-version-id`
 * makes it a range: every change from that version up to the diffed one. `--base <versionId>`
 * diffs against that version itself (a draft file against its base); not with `--from-version-id`.
 */
export async function artifactDiff(
  input: string | undefined,
  options: { versionId?: string; fromVersionId?: string; base?: string },
): Promise<void> {
  if (options.fromVersionId && options.base) {
    throw new CliError('INVALID_ARGS', 'Name one starting point: --from-version-id (a range) or --base (a version to compare with), not both.');
  }
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
  if (options.base) params.baseVersionId = options.base;
  const { data } = await client.get('/v0/diffs', { params });
  outputSuccess(data.data, formatVersionDiff);
}
