import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { formatArtifactCreated } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { CliError } from '../errors.js';

/**
 * `POST /v0/forks`: an independent copy of the artifact's current version, or (`--version-id`
 * alone) of one version by its own id, which names its artifact.
 */
export async function forkArtifact(
  identifier: string | undefined,
  options: {
    versionId?: string;
    title?: string;
    folder?: string;
    team?: string;
    why?: string;
  },
): Promise<void> {
  if (identifier !== undefined && options.versionId) {
    throw new CliError('INVALID_ARGS', 'A version id names its artifact: give the artifact or --version-id, not both.');
  }
  if (identifier === undefined && !options.versionId) {
    throw new CliError('INVALID_ARGS', 'Name the artifact to fork (its current version), or --version-id for one version.');
  }
  const { client } = requireAuthClient();
  const body: Record<string, string> = options.versionId
    ? { versionId: options.versionId }
    : { artifactId: parseArtifactId(identifier!) };
  if (options.title) body.title = options.title;
  if (options.folder) body.folder = options.folder;
  if (options.team) body.team = options.team;
  if (options.why !== undefined) body.why = options.why;

  const res = await client.post('/v0/forks', body);
  outputSuccess(res.data.data, formatArtifactCreated);
}
