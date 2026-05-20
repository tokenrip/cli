import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { parseArtifactId } from '../parse-artifact-id.js';
import { resolveFolderId } from './folder.js';

const VALID_ACTIONS = ['move', 'archive', 'delete'] as const;
type BulkAction = (typeof VALID_ACTIONS)[number];

export async function artifactBulk(
  action: string,
  options: { ids?: string; folder?: string; team?: string; unfiled?: boolean },
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
  const publicIds = options.ids
    .split(',')
    .map((s) => parseArtifactId(s.trim()))
    .filter((s) => s.length > 0);
  if (publicIds.length === 0) {
    throw new CliError('MISSING_FIELD', 'No artifact identifiers provided in --ids');
  }

  const { client } = requireAuthClient();

  const body: { action: BulkAction; publicIds: string[]; folderId?: string | null } = {
    action: action as BulkAction,
    publicIds,
  };

  if (action === 'move') {
    if (options.unfiled) {
      body.folderId = null;
    } else if (options.folder) {
      body.folderId = await resolveFolderId(client, options.folder, options.team);
    } else {
      throw new CliError('MISSING_FIELD', 'For "move", provide --folder <slug> or --unfiled');
    }
  }

  const { data } = await client.post('/v0/artifacts/bulk', body);
  const result = data.data as { succeeded: number; failed: { publicId: string; error: string }[] };

  outputSuccess(
    {
      action,
      requested: publicIds.length,
      succeeded: result.succeeded,
      failed: result.failed,
      failed_count: result.failed.length,
    },
    (d) => {
      const lines = [
        `Bulk ${d.action}: ${d.succeeded as number} succeeded, ${d.failed_count as number} failed`,
      ];
      const failed = d.failed as { publicId: string; error: string }[];
      if (failed.length > 0) {
        lines.push('');
        lines.push('Failed:');
        for (const f of failed) {
          lines.push(`  ${f.publicId}: ${f.error}`);
        }
      }
      return lines.join('\n');
    },
  );
}
