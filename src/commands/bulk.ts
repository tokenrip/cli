import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatBulkResult } from '../formatters.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { resolveTeam } from '../teams.js';

const VALID_ACTIONS = ['move', 'delete'] as const;
type BulkAction = (typeof VALID_ACTIONS)[number];

export async function artifactBulk(
  action: string,
  options: { ids?: string; folder?: string; team?: string; unfiled?: boolean; expectedWorkspaceRevisions?: string; why?: string },
): Promise<void> {
  if (!VALID_ACTIONS.includes(action as BulkAction)) {
    throw new CliError(
      'INVALID_TYPE',
      `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
    );
  }

  if (!options.ids) {
    throw new CliError('MISSING_FIELD', 'Provide --ids <csv> with comma-separated artifact identifiers');
  }
  const artifactIds = options.ids
    .split(',')
    .map((s) => parseArtifactId(s.trim()))
    .filter((s) => s.length > 0);
  if (artifactIds.length === 0) {
    throw new CliError('MISSING_FIELD', 'No artifact identifiers provided in --ids');
  }

  const { client } = requireAuthClient();

  const body: { action: BulkAction; artifactIds: string[]; folder?: string | null; team?: string; expectedWorkspaceRevisions?: Record<string, number>; why?: string } = {
    action: action as BulkAction,
    artifactIds,
  };
  if (options.expectedWorkspaceRevisions) {
    let revisions: unknown;
    try { revisions = JSON.parse(options.expectedWorkspaceRevisions); }
    catch { throw new CliError('INVALID_JSON', '--expected-workspace-revisions is not valid JSON.'); }
    if (typeof revisions !== 'object' || revisions === null || Array.isArray(revisions)) {
      throw new CliError('INVALID_JSON', '--expected-workspace-revisions must be a JSON object of artifact id to revision.');
    }
    // Keyed as --ids names them: a URL key becomes its id, as the id itself does.
    body.expectedWorkspaceRevisions = Object.fromEntries(Object.entries(revisions).map(([key, value]) => [parseArtifactId(key.trim()), value as number]));
  }
  if (options.why !== undefined) body.why = options.why;

  if (action === 'move') {
    if (options.unfiled && options.folder) {
      throw new CliError('INVALID_ARGS', 'For "move", provide --folder or --unfiled, not both');
    }
    if (options.unfiled) {
      body.folder = null;
    } else if (options.folder) {
      body.folder = options.folder;
      if (options.team) body.team = resolveTeam(options.team);
    } else {
      throw new CliError('MISSING_FIELD', 'For "move", provide --folder <id-or-slug> or --unfiled');
    }
  } else if (options.folder || options.team || options.unfiled) {
    throw new CliError('INVALID_ARGS', 'A delete has no destination: leave out --folder, --team and --unfiled');
  }

  const { data } = await client.post('/v0/artifacts/bulk', body);
  const result = data.data as {
    succeeded: number;
    failed: { publicId: string; error: string }[];
    deleted?: { type: string; id: string; deletedAt: string; purgeAt: string }[];
  };

  outputSuccess(
    {
      action,
      requested: artifactIds.length,
      succeeded: result.succeeded,
      failed: result.failed,
      failed_count: result.failed.length,
      ...(result.deleted ? { deleted: result.deleted } : {}),
    },
    formatBulkResult,
  );
}
