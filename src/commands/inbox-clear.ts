import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';

export type InboxSubjectType = 'thread' | 'artifact';

export interface InboxSubject {
  subject_type: InboxSubjectType;
  subject_id: string;
}

/**
 * Resolve a list of positional inbox ids into typed subjects.
 *
 * Each token may be prefixed (`thread:<id>` / `artifact:<id>`) for a mixed
 * batch, or bare. Bare tokens fall back to the `--type` option. If a bare
 * token is given with no `--type`, this throws — we never guess a type, since
 * mis-typing would clear/delete the wrong subject.
 */
export function resolveSubjects(
  ids: string[],
  defaultType?: string,
): InboxSubject[] {
  if (!ids || ids.length === 0) {
    throw new CliError(
      'INVALID_FIELD',
      'No ids given. Pass one or more ids, e.g. `rip inbox clear thread:<id>` or `rip inbox clear <id> --type thread`.',
    );
  }

  const normalizedDefault = normalizeType(defaultType, '--type');

  return ids.map((token) => {
    const colon = token.indexOf(':');
    if (colon > 0) {
      const prefix = token.slice(0, colon);
      const id = token.slice(colon + 1);
      const subject_type = normalizeType(prefix, `prefix in "${token}"`);
      if (!subject_type) {
        throw new CliError(
          'INVALID_FIELD',
          `Unknown subject prefix "${prefix}" in "${token}". Use thread:<id> or artifact:<id>.`,
        );
      }
      if (!id) {
        throw new CliError('INVALID_FIELD', `Missing id after prefix in "${token}".`);
      }
      return { subject_type, subject_id: id };
    }

    if (!normalizedDefault) {
      throw new CliError(
        'INVALID_FIELD',
        `Cannot determine subject type for "${token}". Pass --type <thread|artifact> or prefix the id (thread:${token} / artifact:${token}).`,
      );
    }
    return { subject_type: normalizedDefault, subject_id: token };
  });
}

function normalizeType(
  value: string | undefined,
  source: string,
): InboxSubjectType | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === 'thread' || v === 'threads') return 'thread';
  if (v === 'artifact' || v === 'artifacts') return 'artifact';
  throw new CliError(
    'INVALID_FIELD',
    `Invalid ${source}: "${value}". Expected thread or artifact.`,
  );
}

export async function inboxClear(
  ids: string[],
  options: { type?: string },
): Promise<void> {
  const items = resolveSubjects(ids, options.type);
  const { client } = requireAuthClient();
  await client.post('/v0/inbox/clear', { items });
  outputSuccess(
    { cleared: items },
    (data) => {
      const cleared = data.cleared as InboxSubject[];
      const lines = [`Cleared ${cleared.length} item${cleared.length === 1 ? '' : 's'}`];
      for (const item of cleared) {
        lines.push(`  ${item.subject_type} ${item.subject_id}`);
      }
      return lines.join('\n');
    },
  );
}
