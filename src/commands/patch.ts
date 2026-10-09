import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatArtifactPatched } from '../formatters.js';
import { parseJsonObjectOption } from '../json.js';
import { getFrontendUrl } from '../config.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { parseNonNegativeInteger } from '../input.js';

export async function patch(
  identifier: string,
  options: {
    metadata?: string;
    alias?: string;
    title?: string;
    description?: string;
    visibility?: string;
    audience?: 'internal' | 'shared';
    expectedWorkspaceRevision?: string;
    why?: string;
  },
): Promise<void> {
  if (
    !options.metadata &&
    !options.alias &&
    options.title === undefined &&
    options.description === undefined &&
    options.visibility === undefined &&
    options.audience === undefined
  ) {
    throw new CliError(
      'INVALID_ARGS',
      'Provide at least one of --title, --description, --metadata, --alias, --visibility, or --audience.',
    );
  }

  const body: Record<string, unknown> = {};
  if (options.metadata) {
    body.metadata = parseJsonObjectOption(options.metadata, '--metadata');
  }
  if (options.alias) {
    body.alias = options.alias;
  }
  if (options.title !== undefined) {
    body.title = options.title;
  }
  if (options.description !== undefined) {
    body.description = options.description;
  }
  if (options.visibility !== undefined) {
    body.visibility = options.visibility;
  }
  if (options.audience !== undefined) body.audience = options.audience;
  if (options.expectedWorkspaceRevision !== undefined) {
    body.expectedWorkspaceRevision = parseNonNegativeInteger(options.expectedWorkspaceRevision, '--expected-workspace-revision');
  }
  if (options.why !== undefined) body.why = options.why;

  const id = parseArtifactId(identifier);
  const { client, config } = requireAuthClient();
  const { data } = await client.patch(`/v0/artifacts/${id}`, body);
  const url = `${getFrontendUrl(config)}/s/${data.data.id}`;
  outputSuccess({ ...data.data, url }, formatArtifactPatched);
}
