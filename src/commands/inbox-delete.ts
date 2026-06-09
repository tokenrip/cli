import { requireAuthClient } from '../auth-client.js';
import { outputSuccess } from '../output.js';
import { resolveSubjects } from './inbox-clear.js';

interface DeletedSubject {
  subject_type: string;
  subject_id: string;
}

interface SkippedSubject {
  subject_type: string;
  subject_id: string;
  reason: 'not_owner' | 'not_found' | 'failed';
}

interface DeleteResult {
  deleted: DeletedSubject[];
  skipped: SkippedSubject[];
}

export async function inboxDelete(
  ids: string[],
  options: { type?: string },
): Promise<void> {
  const items = resolveSubjects(ids, options.type);
  const { client } = requireAuthClient();
  const { data } = await client.post('/v0/inbox/delete', { items });
  const result: DeleteResult = data.data;

  outputSuccess(
    result as unknown as Record<string, unknown>,
    (d) => {
      const r = d as unknown as DeleteResult;
      const deleted = r.deleted ?? [];
      const skipped = r.skipped ?? [];
      const lines = [`Deleted ${deleted.length}`];
      for (const item of deleted) {
        lines.push(`  ${item.subject_type} ${item.subject_id}`);
      }
      for (const item of skipped) {
        lines.push(`  skipped ${item.subject_id} (${item.reason})`);
      }
      return lines.join('\n');
    },
  );
}
